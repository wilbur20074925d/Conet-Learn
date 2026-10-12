"use client"

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmojiPicker } from "@/components/ui/emoji-picker"
import { finishNateReply, type Message } from "@/lib/actions"
import { mapMessageRows, type RawMessage } from "@/lib/map-messages"
import { NATE_THINKING, NATE_USER_ID, stripFigures } from "@/lib/nate"
import {
  AWAY_WINDOW_MS,
  fetchSessionMessages,
  fetchMessageById,
  fetchSessionUsers,
  isRetryableSendError,
  isTempMessageId,
  mergeIncomingMessage,
  OUTBOX_ATTEMPT_LIMIT,
  refreshRealtimeAuth,
  retryDelayMs,
  sendGroupMessage,
  touchPresence,
  type SessionUser,
} from "@/lib/seminar-sync"
import { isTempSessionId } from "@/lib/session-browser"
import { createClient } from "@/lib/supabase/browser"
import { connectChatRoom, publishChatMessage, renameChatMessage } from "@/lib/yjs/yjsChatChannel"
import { BookOpen, Check, Copy, ImagePlus, Reply, SendHorizonal, X } from "lucide-react"

type MentionPerson = {
  id: string
  name: string
}

function compressFigure(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const maxSide = 1024
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext("2d")
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error("Could not read that image"))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL("image/jpeg", 0.72))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read that image"))
    }
    image.src = url
  })
}

function readMention(value: string, cursor: number) {
  const before = value.slice(0, Math.max(0, cursor))
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before)
  if (!match) return null
  const query = match[1]
  return { query, start: before.length - query.length - 1 }
}

const ChatInputForm = memo(function ChatInputForm({
  currentUserId,
  currentUserName,
  people,
  replyingTo,
  onCancelReply,
  newintervene,
  onOptimisticSend,
  onQueueSend,
}: {
  currentUserId: string
  currentUserName: string
  people: MentionPerson[]
  replyingTo: Message | null
  onCancelReply: () => void
  newintervene: number
  onOptimisticSend: (message: Message) => void
  onQueueSend: (item: QueuedSend) => void
}) {
  const [inputValue, setInputValue] = useState("")
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [figure, setFigure] = useState<{ name: string; url: string } | null>(null)
  const [figureError, setFigureError] = useState("")
  const [figureBusy, setFigureBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    setInputValue("")
    setMention(null)
  }, [replyingTo])

  const roster = useMemo(() => {
    const byId = new Map<string, MentionPerson & { nate?: boolean }>()
    byId.set(NATE_USER_ID, { id: NATE_USER_ID, name: "NATE", nate: true })
    for (const person of people) {
      if (person.id === NATE_USER_ID) continue
      const name = person.name.trim()
      if (!name) continue
      byId.set(person.id, { id: person.id, name })
    }
    if (currentUserId && !byId.has(currentUserId) && currentUserName.trim()) {
      byId.set(currentUserId, { id: currentUserId, name: currentUserName.trim() })
    }
    const nate = byId.get(NATE_USER_ID)!
    const rest = [...byId.values()]
      .filter((person) => person.id !== NATE_USER_ID)
      .sort((a, b) => a.name.localeCompare(b.name))
    return [nate, ...rest]
  }, [currentUserId, currentUserName, people])

  const suggestions = useMemo(() => {
    if (!mention) return []
    const query = mention.query.trim().toLowerCase()
    if (!query) return roster
    return roster.filter((person) => person.name.toLowerCase().includes(query))
  }, [mention, roster])

  const menuOpen = mention !== null && suggestions.length > 0
  const highlighted = menuOpen ? Math.min(activeIndex, suggestions.length - 1) : 0

  useEffect(() => {
    if (!menuOpen) return
    const item = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    item?.scrollIntoView({ block: "nearest" })
  }, [highlighted, menuOpen, suggestions])

  const syncMention = (value: string, cursor: number) => {
    const next = readMention(value, cursor)
    setMention(next)
    if (!next) setActiveIndex(0)
  }

  const chooseMention = (person: MentionPerson) => {
    const cursor = inputRef.current?.selectionStart ?? inputValue.length
    const current = readMention(inputValue, cursor)
    if (!current) return
    const insert = `@${person.name} `
    const next = inputValue.slice(0, current.start) + insert + inputValue.slice(cursor)
    const nextCursor = current.start + insert.length
    setInputValue(next)
    setMention(null)
    setActiveIndex(0)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const chooseFigure = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setFigureError("Choose an image file.")
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setFigureError("That image is larger than 8 MB.")
      return
    }
    setFigureBusy(true)
    setFigureError("")
    try {
      const url = await compressFigure(file)
      setFigure({ name: file.name || "Figure", url })
    } catch {
      setFigure(null)
      setFigureError("Could not read that image.")
    } finally {
      setFigureBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const typed = inputValue.trim()
    if (figureBusy || (!typed && !figure)) return
    const caption = typed || "Shared a figure."
    const content = figure ? `${caption}\n\n![figure](${figure.url})` : caption

    const clientId = crypto.randomUUID()
    const reply = replyingTo
    const optimistic: Message = {
      id: `temp-${clientId}`,
      content,
      created_at: new Date().toISOString(),
      user_id: currentUserId,
      name: currentUserName,
      avatar_url: null,
      is_ai: false,
      reply_to: reply?.id ?? null,
      is_reply: Boolean(reply),
      original_message: reply
        ? { id: reply.id, content: reply.content, user_name: reply.name }
        : null,
    }

    setInputValue("")
    setFigure(null)
    setFigureError("")
    setMention(null)
    onCancelReply()
    onOptimisticSend(optimistic)
    onQueueSend({
      clientId,
      message: optimistic,
      replyTargetsNate: Boolean(reply?.is_ai),
      nateMode: newintervene,
    })
    queueMicrotask(() => inputRef.current?.focus())
  }

  return (
    <div>
      {replyingTo && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
            <Reply className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Reply to {replyingTo.name}: {(stripFigures(replyingTo.content) || "Shared a figure").slice(0, 80)}
            </span>
          </div>
          <button type="button" onClick={onCancelReply} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {figure && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <img src={figure.url} alt="" className="h-14 w-14 rounded-lg bg-white object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{figure.name}</p>
            <p className="text-xs text-slate-500">Mention @NATE to ask Nate to read this figure.</p>
          </div>
          <button
            type="button"
            onClick={() => setFigure(null)}
            className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label="Remove figure"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {figureError && <p className="mb-2 text-xs font-medium text-red-600">{figureError}</p>}
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(event) => void chooseFigure(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={figureBusy}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          aria-label="Upload a figure"
          title="Upload a figure"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <div className="relative flex-1">
          {mention && suggestions.length === 0 && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
              No one matches “{mention.query}”
            </div>
          )}
          {menuOpen && (
            <ul
              ref={listRef}
              id="chat-mention-list"
              role="listbox"
              aria-label="Mention someone"
              className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              {suggestions.map((person, index) => {
                const active = index === highlighted
                const you = person.id === currentUserId
                return (
                  <li key={person.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active ? "true" : "false"}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => chooseMention(person)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        active ? "bg-slate-100" : "bg-white"
                      }`}
                    >
                      {person.nate ? (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                          N
                        </span>
                      ) : (
                        <SeminarIcon className="h-6 w-6" iconClassName="h-3 w-3" />
                      )}
                      <span className="min-w-0 truncate font-semibold text-slate-800">
                        {person.name}
                        {you ? <span className="ml-1.5 font-medium text-slate-400">you</span> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <Input
            ref={inputRef}
            name="message"
            value={inputValue}
            role="combobox"
            aria-expanded={menuOpen}
            aria-autocomplete="list"
            aria-controls={menuOpen ? "chat-mention-list" : undefined}
            onChange={(event) => {
              const value = event.target.value
              setInputValue(value)
              setActiveIndex(0)
              syncMention(value, event.target.selectionStart ?? value.length)
            }}
            onClick={(event) => {
              const target = event.currentTarget
              syncMention(target.value, target.selectionStart ?? target.value.length)
            }}
            onKeyUp={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return
              const target = event.currentTarget
              syncMention(target.value, target.selectionStart ?? target.value.length)
            }}
            onSelect={(event) => {
              const target = event.currentTarget
              syncMention(target.value, target.selectionStart ?? target.value.length)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && mention) {
                event.preventDefault()
                setMention(null)
                return
              }
              if (!menuOpen) return
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActiveIndex((index) => (index + 1) % suggestions.length)
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
              } else if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault()
                chooseMention(suggestions[highlighted])
              }
            }}
            onBlur={() => setMention(null)}
            placeholder={
              figure
                ? "Ask @NATE to read this figure..."
                : replyingTo
                  ? `Reply to ${replyingTo.name}...`
                  : "Write to your group, or type @ to mention someone"
            }
            autoComplete="off"
            className="h-11 rounded-xl border-slate-200 bg-white pr-12 shadow-none focus-visible:ring-slate-900/20"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <EmojiPicker
              onEmojiSelect={(emoji) => {
                const cursor = inputRef.current?.selectionStart || inputValue.length
                const next = inputValue.slice(0, cursor) + emoji + inputValue.slice(cursor)
                setInputValue(next)
                setMention(null)
                setTimeout(() => {
                  inputRef.current?.focus()
                  inputRef.current?.setSelectionRange(cursor + emoji.length, cursor + emoji.length)
                }, 0)
              }}
            />
          </div>
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={figureBusy || (!inputValue.trim() && !figure)}
          className="h-11 w-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
        >
          <SendHorizonal className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  )
})

type QueuedSend = {
  clientId: string
  message: Message
  replyTargetsNate: boolean
  nateMode: number
}

type OutboxItem = QueuedSend & {
  attempts: number
  lastError: string
  paused: boolean
}

const startedNateReplies = new Set<string>()

function outboxKey(sessionId: string) {
  return `conet-outbox:${sessionId}`
}

function readOutbox(sessionId: string): OutboxItem[] {
  try {
    const raw = sessionStorage.getItem(outboxKey(sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as OutboxItem[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item?.clientId && item.message?.content)
  } catch {
    return []
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function highlightMentions(text: string, names: string[]) {
  const needles = [...new Set(["NATE", ...names.map((name) => name.trim()).filter(Boolean)])]
    .map((name) => `@${escapeHtml(name)}`)
    .sort((a, b) => b.length - a.length)
  if (needles.length === 0) return text

  const lower = text.toLowerCase()
  const taken: Array<[number, number]> = []
  const hits: Array<{ start: number; end: number }> = []
  for (const needle of needles) {
    const target = needle.toLowerCase()
    let from = 0
    while (from < text.length) {
      const start = lower.indexOf(target, from)
      if (start === -1) break
      const end = start + needle.length
      const overlaps = taken.some(([left, right]) => start < right && end > left)
      const next = text[end]
      const boundary = end === text.length || !/[\w]/.test(next)
      if (!overlaps && boundary) {
        hits.push({ start, end })
        taken.push([start, end])
      }
      from = start + 1
    }
  }
  hits.sort((a, b) => a.start - b.start)
  let cursor = 0
  let out = ""
  for (const hit of hits) {
    out += text.slice(cursor, hit.start)
    out += `<span class="font-semibold underline decoration-2 underline-offset-2">${text.slice(hit.start, hit.end)}</span>`
    cursor = hit.end
  }
  return out + text.slice(cursor)
}

const CODE_KEYWORDS: Record<string, string[]> = {
  js: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "import", "export", "from", "async", "await", "new", "this", "try", "catch", "throw", "switch", "case", "break", "continue", "typeof", "true", "false", "null", "undefined"],
  py: ["def", "return", "if", "else", "elif", "for", "while", "class", "import", "from", "as", "with", "try", "except", "lambda", "yield", "True", "False", "None", "in", "not", "and", "or", "pass", "break", "continue"],
  sql: ["select", "from", "where", "and", "or", "insert", "into", "values", "update", "set", "delete", "create", "table", "join", "on", "group", "by", "order", "limit", "as"],
  css: ["color", "background", "display", "flex", "grid", "margin", "padding", "width", "height", "font", "border", "position", "content"],
}

function codeLanguage(language: string) {
  const lang = language.trim().toLowerCase()
  if (["js", "jsx", "javascript", "ts", "tsx", "typescript"].includes(lang)) return "js"
  if (["py", "python"].includes(lang)) return "py"
  if (["html", "htm", "xml", "svg"].includes(lang)) return "html"
  if (["css", "scss"].includes(lang)) return "css"
  if (["sh", "bash", "shell", "zsh"].includes(lang)) return "bash"
  if (lang === "sql") return "sql"
  if (lang === "json") return "json"
  return lang || "text"
}

function canPreviewCode(language: string, code: string) {
  const lang = codeLanguage(language)
  if (lang === "html") return true
  const trimmed = code.trim()
  return trimmed.startsWith("<") && /<\/?[a-z][\s\S]*>/i.test(trimmed)
}

function highlightCode(code: string, language: string) {
  const lang = codeLanguage(language)
  const keywords = new Set(CODE_KEYWORDS[lang] ?? CODE_KEYWORDS.js)
  const tokens: Array<{ text: string; kind: string | null }> = []
  let index = 0

  const push = (text: string, kind: string | null) => {
    if (text) tokens.push({ text, kind })
  }

  while (index < code.length) {
    if (lang === "html" && code.startsWith("<!--", index)) {
      const end = code.indexOf("-->", index + 4)
      const stop = end === -1 ? code.length : end + 3
      push(code.slice(index, stop), "comment")
      index = stop
      continue
    }
    if (lang === "html" && code[index] === "<") {
      const end = code.indexOf(">", index + 1)
      const stop = end === -1 ? code.length : end + 1
      push(code.slice(index, stop), "tag")
      index = stop
      continue
    }
    if (code.startsWith("/*", index)) {
      const end = code.indexOf("*/", index + 2)
      const stop = end === -1 ? code.length : end + 2
      push(code.slice(index, stop), "comment")
      index = stop
      continue
    }
    if ((lang === "py" || lang === "bash") && code[index] === "#") {
      const end = code.indexOf("\n", index)
      const stop = end === -1 ? code.length : end
      push(code.slice(index, stop), "comment")
      index = stop
      continue
    }
    if (lang !== "html" && lang !== "css" && code.startsWith("//", index)) {
      const end = code.indexOf("\n", index)
      const stop = end === -1 ? code.length : end
      push(code.slice(index, stop), "comment")
      index = stop
      continue
    }
    const quote = code[index]
    if (quote === '"' || quote === "'" || quote === "`") {
      let end = index + 1
      while (end < code.length) {
        if (code[end] === "\\") {
          end += 2
          continue
        }
        if (code[end] === quote) {
          end += 1
          break
        }
        if (code[end] === "\n" && quote !== "`") break
        end += 1
      }
      push(code.slice(index, end), "string")
      index = end
      continue
    }
    if (/[0-9]/.test(code[index] ?? "") && (index === 0 || !/[\w]/.test(code[index - 1] ?? ""))) {
      let end = index
      while (end < code.length && /[0-9._xXa-fA-F]/.test(code[end] ?? "")) end += 1
      push(code.slice(index, end), "number")
      index = end
      continue
    }
    if (/[A-Za-z_]/.test(code[index] ?? "")) {
      let end = index
      while (end < code.length && /[\w]/.test(code[end] ?? "")) end += 1
      const word = code.slice(index, end)
      push(word, keywords.has(word) || (lang === "sql" && keywords.has(word.toLowerCase())) ? "keyword" : null)
      index = end
      continue
    }
    push(code[index] ?? "", null)
    index += 1
  }

  const classFor = (kind: string | null) => {
    if (kind === "keyword" || kind === "tag") return "text-sky-300"
    if (kind === "string") return "text-emerald-300"
    if (kind === "comment") return "text-slate-500"
    if (kind === "number") return "text-amber-200"
    return ""
  }

  return tokens
    .map((token) => {
      const safe = escapeHtml(token.text)
      const className = classFor(token.kind)
      return className ? `<span class="${className}">${safe}</span>` : safe
    })
    .join("")
}

function previewDocument(code: string, language: string) {
  const trimmed = code.trim()
  if (codeLanguage(language) === "html" && (language.toLowerCase() === "svg" || trimmed.startsWith("<svg"))) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}body{display:flex;align-items:center;justify-content:center;min-height:100%;padding:12px}</style></head><body>${code}</body></html>`
  }
  if (/<html[\s>]/i.test(code)) return code
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;padding:12px}</style></head><body>${code}</body></html>`
}

function renderCodeBlock(code: string, language: string, preview: boolean) {
  const label = language.trim() || "code"
  const highlighted = highlightCode(code.replace(/\n$/, ""), language)
  const block = `<div class="my-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><div class="border-b border-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">${escapeHtml(label)}</div><pre class="overflow-x-auto px-3 py-2.5 text-[13px] leading-relaxed text-slate-100"><code>${highlighted}</code></pre></div>`
  if (!preview || !canPreviewCode(language, code)) return block
  const src = previewDocument(code, language).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  return `${block}<div class="my-2 overflow-hidden rounded-xl border border-slate-200 bg-white"><div class="border-b border-slate-100 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Rendered</div><iframe sandbox="" referrerpolicy="no-referrer" title="Rendered code" class="h-44 w-full bg-white" srcdoc="${src}"></iframe></div>`
}

function splitCodeFences(raw: string) {
  const parts: Array<{ type: "text"; text: string } | { type: "code"; language: string; code: string }> = []
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw))) {
    if (match.index > last) parts.push({ type: "text", text: raw.slice(last, match.index) })
    parts.push({ type: "code", language: match[1].trim(), code: match[2] })
    last = match.index + match[0].length
  }
  const rest = raw.slice(last)
  const unclosed = /```([^\n`]*)\n([\s\S]*)$/.exec(rest)
  if (unclosed && unclosed.index !== undefined) {
    if (unclosed.index > 0) parts.push({ type: "text", text: rest.slice(0, unclosed.index) })
    parts.push({ type: "code", language: unclosed[1].trim(), code: unclosed[2] })
  } else if (rest) {
    parts.push({ type: "text", text: rest })
  }
  return parts
}

function splitFigures(raw: string) {
  const parts: Array<{ type: "text"; text: string } | { type: "figure"; alt: string; src: string }> = []
  const pattern = /!\[([^\]]*)\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s)]+)\)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw))) {
    if (match.index > last) parts.push({ type: "text", text: raw.slice(last, match.index) })
    parts.push({ type: "figure", alt: match[1], src: match[2] })
    last = match.index + match[0].length
  }
  const rest = raw.slice(last)
  if (rest) parts.push({ type: "text", text: rest })
  return parts
}

function renderFigure(alt: string, src: string) {
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || "Figure")}" class="mt-2 max-h-72 w-full rounded-lg bg-white object-contain" />`
}

function renderInlineMarkdown(raw: string, mentionNames: string[]) {
  return splitFigures(raw)
    .map((part) => (part.type === "figure" ? renderFigure(part.alt, part.src) : renderTextMarkdown(part.text, mentionNames)))
    .join("")
}

function renderTextMarkdown(raw: string, mentionNames: string[]) {
  let text = highlightMentions(escapeHtml(raw), mentionNames)
  text = text.replace(/^###\s*(.+)$/gm, '<h3 class="mt-2 mb-1 text-sm font-semibold">$1</h3>')
  text = text.replace(/^##\s*(.+)$/gm, '<h2 class="mt-3 mb-1 text-base font-semibold">$1</h2>')
  text = text.replace(/^#\s*(.+)$/gm, '<h1 class="mt-3 mb-1 text-lg font-semibold">$1</h1>')
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>")
  text = text.replace(/`([^`\n]+)`/g, '<code class="rounded bg-black/5 px-1 py-0.5 text-[0.85em]">$1</code>')
  text = text.replace(/\n/g, "<br>")
  return text
}

function renderMarkdown(raw: string, mentionNames: string[] = [], preview = false) {
  return splitCodeFences(raw)
    .map((part) =>
      part.type === "code" ? renderCodeBlock(part.code, part.language, preview) : renderInlineMarkdown(part.text, mentionNames)
    )
    .join("")
}

const EMPTY_MENTIONS: string[] = []

const MessageContent = memo(function MessageContent({
  content,
  className,
  mentionNames = EMPTY_MENTIONS,
  previewCode = false,
}: {
  content: string
  className?: string
  mentionNames?: string[]
  previewCode?: boolean
}) {
  const html = useMemo(() => renderMarkdown(content, mentionNames, previewCode), [content, mentionNames, previewCode])
  return <div className={className ?? "text-sm leading-relaxed break-words"} dangerouslySetInnerHTML={{ __html: html }} />
})

function TypingContent({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => {
    const caret =
      '<span class="ml-0.5 inline-block h-[1em] w-[1.5px] translate-y-px bg-slate-800 align-text-bottom animate-pulse"></span>'
    return `${renderMarkdown(content, [], true)}${caret}`
  }, [content])
  return <div className={className ?? "text-sm leading-relaxed break-words"} dangerouslySetInnerHTML={{ __html: html }} />
}

function rawToMessage(row: RawMessage, prev: Message[]): Message {
  const mapped = mapMessageRows([row])[0]
  if (mapped.original_message) return mapped
  if (!row.reply_to) return mapped
  const original = prev.find((message) => message.id === row.reply_to)
  if (!original) return mapped
  return {
    ...mapped,
    original_message: {
      id: original.id,
      content: original.content,
      user_name: original.name,
    },
  }
}

function nextTypedLength(text: string, index: number) {
  if (index >= text.length) return text.length
  const step = Math.max(1, Math.ceil(text.length / 160))
  let next = Math.min(text.length, index + step)
  if (step > 1 && next < text.length && /\S/.test(text[next - 1] ?? "") && /\S/.test(text[next] ?? "")) {
    const space = text.indexOf(" ", next)
    next = space === -1 ? text.length : space + 1
  }
  return next
}

function formatBubbleTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function BubbleTime({ value }: { value: string }) {
  const [label, setLabel] = useState("")

  useEffect(() => {
    setLabel(formatBubbleTime(value))
  }, [value])

  return <span className="text-[11px] text-slate-400">{label}</span>
}

function NateAvatar() {
  return (
    <div className="relative mt-0.5 h-8 w-8 shrink-0">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-slate-900 text-[11px] font-bold text-white ring-1 ring-slate-200">
        N
      </div>
    </div>
  )
}

function NateThinkingCard() {
  return (
    <div className="flex justify-start gap-2.5">
      <NateAvatar />
      <div
        className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm"
        role="status"
        aria-live="polite"
        aria-label="Nate is thinking"
      >
        <p className="text-sm font-medium text-slate-700">
          Nate is thinking
          <span className="inline-flex w-[1.15em]" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="animate-nate-ellipsis"
                style={{ animationDelay: `${dot * 0.18}s` }}
              >
                .
              </span>
            ))}
          </span>
        </p>
      </div>
    </div>
  )
}

function NateReplyCard({
  content,
  createdAt,
  quote,
  reveal,
  onReply,
}: {
  content: string
  createdAt: string
  quote: { user_name: string; content: string } | null
  reveal: boolean
  onReply?: () => void
}) {
  const [shown, setShown] = useState(reveal ? "" : content)
  const [typing, setTyping] = useState(reveal)
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reveal) {
      setShown(content)
      setTyping(false)
      return
    }
    let index = 0
    setTyping(true)
    setShown("")
    const root = cardRef.current
    const timer = window.setInterval(() => {
      index = nextTypedLength(content, index)
      setShown(content.slice(0, index))
      const scroller = root?.closest("[data-radix-scroll-area-viewport]")
      if (scroller instanceof HTMLElement) {
        const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
        if (distance < 96) scroller.scrollTop = scroller.scrollHeight
      }
      if (index >= content.length) {
        window.clearInterval(timer)
        setTyping(false)
      }
    }, 32)
    return () => window.clearInterval(timer)
  }, [content, reveal])

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div ref={cardRef} className="group flex justify-start gap-2.5">
      <NateAvatar />
      <div className="min-w-0 max-w-[min(92%,34rem)] flex-1 overflow-hidden rounded-2xl rounded-bl-md border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-800">NATE</span>
            {typing && (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Writing
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={copyReply}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title={copied ? "Copied" : "Copy reply"}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <div className="px-3 py-2.5 text-[15px] leading-relaxed text-slate-900">
          {quote && (
            <div className="mb-2 border-l-2 border-slate-300 pl-2 text-xs text-slate-500">
              <p className="font-medium">{quote.user_name}</p>
              <p className="truncate">{stripFigures(quote.content) || "Shared a figure"}</p>
            </div>
          )}
          {typing ? (
            <TypingContent content={shown} className="text-[15px] leading-relaxed break-words" />
          ) : (
            <MessageContent content={shown} previewCode className="text-[15px] leading-relaxed break-words" />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5">
          <BubbleTime value={createdAt} />
          {!typing && onReply && (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function upsertLiveMessages(prev: Message[], incoming: Message[]) {
  if (incoming.length === 0) return prev
  let next = prev
  for (const message of incoming) {
    const index = next.findIndex((item) => item.id === message.id)
    if (index === -1) next = [...next, message]
    else next = next.map((item, itemIndex) => (itemIndex === index ? { ...item, ...message } : item))
  }
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function withPending(prev: Message[], latest: Message[]) {
  const temps = prev.filter((message) => isTempMessageId(message.id))
  if (temps.length === 0) return latest
  let merged = latest
  for (const temp of temps) {
    if (!merged.some((message) => message.user_id === temp.user_id && message.content === temp.content)) {
      merged = [...merged, temp]
    }
  }
  return merged.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function SeminarIcon({ className = "h-9 w-9", iconClassName = "h-4 w-4" }: { className?: string; iconClassName?: string }) {
  return (
    <div
      title="CoNet Seminar"
      aria-label="CoNet Seminar"
      className={`flex shrink-0 items-center justify-center rounded-full bg-slate-900 text-white ${className}`}
    >
      <BookOpen className={iconClassName} />
    </div>
  )
}

export default function ChatPanel({
  initialMessages,
  currentUserId,
  currentUserName,
  groupId,
  groupName,
  sessionId,
  newintervene,
  readOnly = false,
  awaitInitial = false,
  onReady,
}: {
  initialMessages: Message[]
  currentUserId: string
  currentUserName: string
  groupId: string
  groupName: string
  sessionId: string
  newintervene: number
  readOnly?: boolean
  awaitInitial?: boolean
  onReady?: (messages: Message[]) => void
}) {
  const pendingSession = isTempSessionId(sessionId)
  const [messages, setMessages] = useState(initialMessages)
  const [messagesLoaded, setMessagesLoaded] = useState(
    pendingSession || !awaitInitial || initialMessages.length > 0
  )
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [liveUsers, setLiveUsers] = useState<SessionUser[]>([])
  const [dbUsers, setDbUsers] = useState<SessionUser[]>([])
  const [groupPeople, setGroupPeople] = useState<MentionPerson[]>([])
  const [linkStatus, setLinkStatus] = useState<"live" | "reconnecting">("live")
  const [tabHidden, setTabHidden] = useState(false)
  const [sendNotes, setSendNotes] = useState<Record<string, string>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const revealIds = useRef(new Set<string>())
  const seenNateReplyIds = useRef<Set<string> | null>(null)
  const nateTypeArmed = useRef(false)
  const skipEmptyNateBaseline = useRef(initialMessages.length === 0)
  const outboxRef = useRef(new Map<string, OutboxItem>())
  const flushingRef = useRef(new Set<string>())
  const timersRef = useRef(new Map<string, number>())
  const flushOneRef = useRef<(clientId: string) => Promise<void>>(async () => {})
  const wakeOutboxRef = useRef<() => void>(() => {})

  const cancelReply = useCallback(() => setReplyingTo(null), [])

  const persistOutbox = useCallback(() => {
    try {
      const items = [...outboxRef.current.values()]
      if (items.length === 0) sessionStorage.removeItem(outboxKey(sessionId))
      else sessionStorage.setItem(outboxKey(sessionId), JSON.stringify(items))
    } catch {
      // Private browsing can block sessionStorage. The in-memory queue still retries.
    }
  }, [sessionId])

  const handleOptimisticSend = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message])
    publishChatMessage(sessionId, message)
  }, [sessionId])

  const handleSendConfirmed = useCallback((tempId: string, realId: string) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === tempId ? { ...message, id: realId } : message))
    )
    renameChatMessage(sessionId, tempId, realId)
    setSendNotes((prev) => {
      if (!prev[tempId]) return prev
      const next = { ...prev }
      delete next[tempId]
      return next
    })
  }, [sessionId])

  const handleThinking = useCallback(
    (thinkingId: string) => {
      const alreadyStarted = startedNateReplies.has(thinkingId)
      startedNateReplies.add(thinkingId)
      const thinking: Message = {
        id: thinkingId,
        content: NATE_THINKING,
        created_at: new Date().toISOString(),
        user_id: NATE_USER_ID,
        name: "NATE",
        avatar_url: null,
        is_ai: true,
        reply_to: null,
        is_reply: false,
        original_message: null,
      }
      setMessages((prev) => (prev.some((message) => message.id === thinkingId) ? prev : [...prev, thinking]))
      publishChatMessage(sessionId, thinking)
      if (!alreadyStarted) void finishNateReply(groupId, sessionId, thinkingId)
    },
    [groupId, sessionId]
  )

  flushOneRef.current = async (clientId: string) => {
    const item = outboxRef.current.get(clientId)
    if (!item || item.paused || flushingRef.current.has(clientId)) return
    const waiting = timersRef.current.get(clientId)
    if (waiting) {
      window.clearTimeout(waiting)
      timersRef.current.delete(clientId)
    }
    flushingRef.current.add(clientId)
    setSendNotes((prev) => ({ ...prev, [item.message.id]: item.attempts > 0 ? "Will retry" : "Sending…" }))
    try {
      const supabase = createClient()
      if (item.attempts > 0) await refreshRealtimeAuth(supabase)
      const result = await sendGroupMessage(supabase, {
        groupId,
        sessionId,
        userId: currentUserId,
        content: item.message.content,
        replyTo: item.message.reply_to && !isTempMessageId(item.message.reply_to) ? item.message.reply_to : null,
        replyTargetsNate: item.replyTargetsNate,
        nateMode: item.nateMode,
        clientId,
        createdAt: item.message.created_at,
        recover: item.attempts > 0,
      })
      if (result.ok) {
        outboxRef.current.delete(clientId)
        persistOutbox()
        handleSendConfirmed(item.message.id, result.messageId)
        if (result.thinkingId) handleThinking(result.thinkingId)
        return
      }
      item.attempts += 1
      item.lastError = result.error
      const retryable = isRetryableSendError(result.error)
      if (!retryable || item.attempts >= OUTBOX_ATTEMPT_LIMIT) {
        item.paused = true
        persistOutbox()
        setSendNotes((prev) => ({
          ...prev,
          [item.message.id]: retryable ? "Saved on this device. Will send when you return." : result.error,
        }))
        if (!retryable) {
          outboxRef.current.delete(clientId)
          persistOutbox()
        }
        return
      }
      persistOutbox()
      setSendNotes((prev) => ({ ...prev, [item.message.id]: "Will retry" }))
      const timer = window.setTimeout(() => {
        timersRef.current.delete(clientId)
        void flushOneRef.current(clientId)
      }, retryDelayMs(item.attempts))
      timersRef.current.set(clientId, timer)
    } catch {
      item.attempts += 1
      item.lastError = "Failed to send"
      if (item.attempts >= OUTBOX_ATTEMPT_LIMIT) {
        item.paused = true
        setSendNotes((prev) => ({
          ...prev,
          [item.message.id]: "Saved on this device. Will send when you return.",
        }))
      } else {
        const timer = window.setTimeout(() => {
          timersRef.current.delete(clientId)
          void flushOneRef.current(clientId)
        }, retryDelayMs(item.attempts))
        timersRef.current.set(clientId, timer)
      }
      persistOutbox()
    } finally {
      flushingRef.current.delete(clientId)
    }
  }

  wakeOutboxRef.current = () => {
    for (const item of outboxRef.current.values()) {
      if (item.lastError && !isRetryableSendError(item.lastError)) continue
      item.paused = false
      void flushOneRef.current(item.clientId)
    }
  }

  const queueSend = useCallback((item: QueuedSend) => {
    outboxRef.current.set(item.clientId, { ...item, attempts: 0, lastError: "", paused: false })
    persistOutbox()
    setSendNotes((prev) => ({ ...prev, [item.message.id]: "Sending…" }))
    void flushOneRef.current(item.clientId)
  }, [persistOutbox])

  useEffect(() => {
    if (readOnly || pendingSession) return
    const stored = readOutbox(sessionId)
    if (stored.length === 0) return
    for (const item of stored) outboxRef.current.set(item.clientId, { ...item, paused: false })
    persistOutbox()
    setMessages((prev) => {
      const ids = new Set(prev.map((message) => message.id))
      const extra = stored
        .map((item) => item.message)
        .filter((message) => !ids.has(message.id))
      return extra.length === 0 ? prev : [...prev, ...extra]
    })
    setSendNotes((prev) => {
      const next = { ...prev }
      for (const item of stored) next[item.message.id] = "Sending…"
      return next
    })
    wakeOutboxRef.current()
    return () => {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [persistOutbox, readOnly, sessionId, pendingSession])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length])

  useEffect(() => {
    if (pendingSession) return
    const room = connectChatRoom(sessionId, currentUserId, currentUserName)
    const unsubscribe = room.subscribe((incoming) => {
      setMessages((prev) => upsertLiveMessages(prev, incoming))
      setMessagesLoaded(true)
    })
    return () => {
      unsubscribe()
      room.disconnect()
    }
  }, [currentUserId, currentUserName, pendingSession, sessionId])

  useEffect(() => {
    if (initialMessages.length === 0) return
    setMessages((prev) => (prev.length === 0 ? initialMessages : prev))
    setMessagesLoaded(true)
  }, [initialMessages])

  useEffect(() => {
    if (readOnly || pendingSession) return
    let stopped = false
    const supabase = createClient()
    void supabase
      .from("ConetGroupMembers")
      .select("user_id, ConetUsers(id, name, role)")
      .eq("group_id", groupId)
      .then(({ data }) => {
        if (stopped || !data) return
        const people: MentionPerson[] = []
        for (const row of data as Array<{
          user_id: string
          ConetUsers:
            | { id: string; name: string; role: string }
            | { id: string; name: string; role: string }[]
            | null
        }>) {
          const person = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
          if (!person || person.role === "ai" || person.role === "teacher") continue
          const name = person.name?.trim()
          if (!name) continue
          people.push({ id: person.id || row.user_id, name })
        }
        people.sort((a, b) => a.name.localeCompare(b.name))
        setGroupPeople(people)
      })
    return () => {
      stopped = true
    }
  }, [groupId, pendingSession, readOnly])

  useEffect(() => {
    if (pendingSession) {
      setMessages(initialMessages)
      setMessagesLoaded(true)
      onReadyRef.current?.(initialMessages)
      return
    }

    const supabase = createClient()
    let stopped = false
    let roomReady = false
    let joinedBefore = false

    const refreshPresence = async () => {
      const users = await fetchSessionUsers(supabase, groupId)
      if (!stopped && users) setDbUsers(users)
    }

    const applyIncoming = async (messageId: string | undefined) => {
      if (!messageId) {
        const latest = await fetchSessionMessages(supabase, sessionId)
        if (!stopped && latest) setMessages((prev) => withPending(prev, latest))
        return
      }
      const row = await fetchMessageById(supabase, messageId)
      if (stopped || !row) return
      setMessages((prev) => {
        const message = rawToMessage(row, prev)
        publishChatMessage(sessionId, message)
        return mergeIncomingMessage(prev, message)
      })
    }

    const reconcileMessages = async () => {
      const latest = await fetchSessionMessages(supabase, sessionId)
      if (stopped || !latest) return
      setMessages((prev) => withPending(prev, latest))
    }

    const beat = async () => {
      if (document.visibilityState !== "visible") return
      if (!readOnly) await touchPresence(supabase, groupId, currentUserId, false)
      if (!roomReady) await refreshPresence()
    }

    const room = supabase.channel(`conet-room-${sessionId}`, {
      config: { presence: { key: currentUserId } },
    })

    let catching = false
    let catchAgain = false
    const catchUp = async () => {
      if (stopped || document.visibilityState === "hidden") return
      if (catching) {
        catchAgain = true
        return
      }
      catching = true
      try {
        await refreshRealtimeAuth(supabase)
        if (!readOnly) {
          await touchPresence(supabase, groupId, currentUserId, false)
          if (room.state === "joined") await room.track({ name: currentUserName, seminar: groupName, role: "student" })
        }
        await reconcileMessages()
        await refreshPresence()
        wakeOutboxRef.current()
      } catch {
        // The next wake or the 25s reconcile will try again.
      } finally {
        catching = false
        if (catchAgain && !stopped) {
          catchAgain = false
          void catchUp()
        }
      }
    }

    const markAway = async () => {
      if (readOnly || stopped) return
      await touchPresence(supabase, groupId, currentUserId, true)
      if (room.state === "joined") await room.untrack()
    }

    room
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ConetMessages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          void applyIncoming((payload.new as { id?: string }).id)
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ConetMessages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          void applyIncoming((payload.new as { id?: string }).id)
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "ConetMessages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id
          if (!id) return
          setMessages((prev) => prev.filter((message) => message.id !== id))
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = room.presenceState<{ name?: string; role?: string }>()
        const users = Object.entries(state)
          .filter(([, metas]) => metas[0]?.role !== "teacher")
          .map(([id, metas]) => ({
            id,
            name: metas[0]?.name || "Member",
            lastSeen: Date.now(),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
        if (stopped) return
        roomReady = true
        setLiveUsers(users)
      })
      .subscribe((status) => {
        if (stopped) return
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          roomReady = false
          setLinkStatus("reconnecting")
          return
        }
        if (status !== "SUBSCRIBED") return
        const recover = joinedBefore
        joinedBefore = true
        setLinkStatus("live")
        if (document.visibilityState === "hidden") return
        void (async () => {
          if (!readOnly) {
            await room.track({ name: currentUserName, seminar: groupName, role: "student" })
            await touchPresence(supabase, groupId, currentUserId, false)
          }
          await refreshPresence()
          roomReady = true
          if (recover) {
            await reconcileMessages()
            wakeOutboxRef.current()
          }
        })()
      })

    const presenceTable = supabase
      .channel(`conet-presence-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ConetPresence", filter: `group_id=eq.${groupId}` },
        () => {
          void refreshPresence()
        }
      )
      .subscribe()

    void fetchSessionMessages(supabase, sessionId).then((latest) => {
      if (stopped) return
      if (!latest) {
        setMessagesLoaded(true)
        return
      }
      setMessages((prev) => withPending(prev, latest))
      setMessagesLoaded(true)
      onReadyRef.current?.(latest)
    })
    // Presence + heartbeat run after first paint so opening a session feels instant.
    const startPresence = window.setTimeout(() => {
      if (stopped) return
      void beat()
    }, 0)

    const onWake = () => {
      if (document.visibilityState === "hidden") {
        setTabHidden(true)
        void markAway()
        return
      }
      setTabHidden(false)
      void catchUp()
    }
    const onOnline = () => {
      if (document.visibilityState === "hidden") return
      void catchUp()
    }
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("online", onOnline)
    window.addEventListener("focus", onOnline)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (stopped || (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN")) return
      const token = session?.access_token
      if (token) void supabase.realtime.setAuth(token)
      void catchUp()
    })

    const heartbeat = setInterval(() => {
      void beat()
    }, 12000)
    const reconcile = setInterval(() => {
      if (document.visibilityState !== "visible") return
      void reconcileMessages()
      void refreshPresence()
    }, 25000)
    const prune = setInterval(() => {
      setDbUsers((prev) => prev.filter((user) => Date.now() - user.lastSeen < AWAY_WINDOW_MS))
    }, 5000)

    return () => {
      stopped = true
      window.clearTimeout(startPresence)
      clearInterval(heartbeat)
      clearInterval(reconcile)
      clearInterval(prune)
      document.removeEventListener("visibilitychange", onWake)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("focus", onOnline)
      authListener.subscription.unsubscribe()
      supabase.removeChannel(room)
      supabase.removeChannel(presenceTable)
    }
  }, [groupId, groupName, sessionId, currentUserId, currentUserName, readOnly, pendingSession])

  if (messagesLoaded) {
    const replyIds = messages
      .filter((message) => message.is_ai && message.content !== NATE_THINKING)
      .map((message) => message.id)
    const thinkingVisible = messages.some((message) => message.is_ai && message.content === NATE_THINKING)
    if (seenNateReplyIds.current === null) {
      const waitingForHistory = messages.length === 0 && skipEmptyNateBaseline.current
      if (!waitingForHistory) {
        seenNateReplyIds.current = new Set(replyIds)
        nateTypeArmed.current = thinkingVisible
      }
    } else {
      if (thinkingVisible) nateTypeArmed.current = true
      for (const id of replyIds) {
        if (seenNateReplyIds.current.has(id)) continue
        if (nateTypeArmed.current) {
          revealIds.current.add(id)
          nateTypeArmed.current = false
        }
        seenNateReplyIds.current.add(id)
      }
    }
  }

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      if (message.authorRole === "teacher") return false
      if (!(message.is_ai && message.content === NATE_THINKING)) return true
      return !messages.some(
        (other) =>
          other.id !== message.id &&
          other.is_ai &&
          other.content !== NATE_THINKING &&
          other.created_at >= message.created_at
      )
    })
  }, [messages])

  const online = useMemo(() => {
    const byId = new Map<string, SessionUser>()
    for (const user of dbUsers) byId.set(user.id, user)
    for (const user of liveUsers) {
      byId.set(user.id, { ...user, away: false, lastSeen: Date.now() })
    }
    if (!readOnly && !byId.has(currentUserId)) {
      byId.set(currentUserId, {
        id: currentUserId,
        name: currentUserName,
        lastSeen: Date.now(),
        away: tabHidden,
      })
    }
    if (!readOnly && tabHidden) {
      const me = byId.get(currentUserId)
      if (me) byId.set(currentUserId, { ...me, away: true })
    }
    return [...byId.values()].sort((a, b) => {
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
      return a.name.localeCompare(b.name)
    })
  }, [currentUserId, currentUserName, dbUsers, liveUsers, readOnly, tabHidden])

  const mentionPeople = useMemo(() => {
    const byId = new Map<string, MentionPerson>()
    for (const person of groupPeople) byId.set(person.id, person)
    for (const person of online) {
      if (!byId.has(person.id) && person.name.trim()) {
        byId.set(person.id, { id: person.id, name: person.name.trim() })
      }
    }
    return [...byId.values()]
  }, [groupPeople, online])

  const mentionNames = useMemo(() => mentionPeople.map((person) => person.name), [mentionPeople])

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{groupName}</h2>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                linkStatus === "live" ? "text-brand-green" : "text-amber-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  linkStatus === "live" ? "animate-pulse bg-brand-green" : "bg-amber-500"
                }`}
              />
              {linkStatus === "live" ? "Live" : "Reconnecting"}
            </span>
          </div>
          <p className="text-xs text-slate-500">{visibleMessages.length} messages</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:items-end">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {online.length} online
          </p>
          <div className="flex max-h-24 w-full flex-wrap gap-1.5 overflow-y-auto sm:justify-end">
            {online.length === 0 && (
              <p className="text-xs text-slate-500">Waiting for people to join…</p>
            )}
            {online.map((person) => (
              <span
                key={person.id}
                className={`inline-flex items-center gap-1.5 rounded-full border bg-slate-50 py-1 pl-1 pr-2.5 ${
                  person.away ? "border-dashed border-slate-300 opacity-70" : "border-slate-200"
                }`}
                title={`${person.name}${person.away ? " · away" : ""} · CoNet Seminar`}
              >
                <SeminarIcon className="h-6 w-6" iconClassName="h-3 w-3" />
                <span className="max-w-[9rem] truncate text-xs font-semibold text-slate-700">
                  {person.id === currentUserId ? `${person.name} (you)` : person.name}
                  {person.away ? " · away" : ""}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-5 py-5">
          {!messagesLoaded && visibleMessages.length === 0 && (
            <div className="space-y-3" aria-hidden="true">
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="ml-10 h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          )}
          {messagesLoaded && visibleMessages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-lg font-bold tracking-tight text-slate-900">
                {pendingSession ? "Opening the group chat…" : "No messages yet."}
              </p>
            </div>
          )}
          {visibleMessages.map((msg) => {
            const mine = msg.user_id === currentUserId
            const thinking = msg.is_ai && msg.content === NATE_THINKING
            const pending = isTempMessageId(msg.id)
            if (msg.is_ai) {
              return thinking ? (
                <NateThinkingCard key={msg.id} />
              ) : (
                <NateReplyCard
                  key={msg.id}
                  content={msg.content}
                  createdAt={msg.created_at}
                  quote={msg.original_message ?? null}
                  reveal={revealIds.current.has(msg.id)}
                  onReply={readOnly ? undefined : () => setReplyingTo(msg)}
                />
              )
            }
            return (
              <div key={msg.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[min(100%,34rem)] gap-3 ${mine ? "flex-row-reverse" : ""} ${pending ? "opacity-80" : ""}`}>
                  <div className="mt-1">
                    <SeminarIcon />
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      mine
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-900"
                    }`}
                  >
                    {msg.original_message && (
                      <div className={`mb-2 border-l-2 pl-2 text-xs ${mine ? "border-white/40 text-white/80" : "border-slate-300 text-slate-500"}`}>
                        <p className="font-medium">{msg.original_message.user_name}</p>
                        <p className="truncate">{stripFigures(msg.original_message.content) || "Shared a figure"}</p>
                      </div>
                    )}
                    <MessageContent content={msg.content} mentionNames={mentionNames} />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className={`text-[11px] font-medium ${mine ? "text-white/70" : "text-slate-400"}`}>
                        {msg.name}
                        {sendNotes[msg.id] ? ` · ${sendNotes[msg.id]}` : ""}
                      </p>
                      {!readOnly && !mine && (
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          className="rounded-full p-1 opacity-0 transition group-hover:opacity-100 hover:bg-black/5"
                          aria-label={`Reply to ${msg.name}`}
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <footer className="relative z-10 border-t border-slate-100 bg-white px-5 py-4">
        {readOnly ? (
          <p className="text-sm text-slate-500">You are viewing this chat. Students write the messages here.</p>
        ) : pendingSession ? (
          <p className="text-sm text-slate-500">Opening the group chat…</p>
        ) : (
          <ChatInputForm
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            people={mentionPeople}
            replyingTo={replyingTo}
            onCancelReply={cancelReply}
            newintervene={newintervene}
            onOptimisticSend={handleOptimisticSend}
            onQueueSend={queueSend}
          />
        )}
      </footer>
    </section>
  )
}
