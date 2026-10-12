"use client"

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmojiPicker } from "@/components/ui/emoji-picker"
import { finishNateReply, type Message } from "@/lib/actions"
import { mapMessageRows, type RawMessage } from "@/lib/map-messages"
import { NATE_THINKING, NATE_USER_ID } from "@/lib/nate"
import {
  fetchSessionMessages,
  fetchMessageById,
  fetchSessionUsers,
  isTempMessageId,
  mergeIncomingMessage,
  ONLINE_WINDOW_MS,
  sendGroupMessage,
  touchPresence,
  type SessionUser,
} from "@/lib/seminar-sync"
import { createClient } from "@/lib/supabase/browser"
import { BookOpen, Check, Copy, Reply, SendHorizonal, X } from "lucide-react"

const ChatInputForm = memo(function ChatInputForm({
  groupId,
  sessionId,
  currentUserId,
  currentUserName,
  replyingTo,
  onCancelReply,
  newintervene,
  onOptimisticSend,
  onSendConfirmed,
  onSendFailed,
  onThinking,
}: {
  groupId: string
  sessionId: string
  currentUserId: string
  currentUserName: string
  replyingTo: Message | null
  onCancelReply: () => void
  newintervene: number
  onOptimisticSend: (message: Message) => void
  onSendConfirmed: (tempId: string, realId: string) => void
  onSendFailed: (tempId: string, error: string) => void
  onThinking: (thinkingId: string) => void
}) {
  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputValue("")
    setError("")
  }, [replyingTo])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = inputValue.trim()
    if (!content) return

    const tempId = `temp-${crypto.randomUUID()}`
    const reply = replyingTo
    const optimistic: Message = {
      id: tempId,
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

    setError("")
    setInputValue("")
    onCancelReply()
    onOptimisticSend(optimistic)
    queueMicrotask(() => inputRef.current?.focus())

    void (async () => {
      try {
        const result = await sendGroupMessage(createClient(), {
          groupId,
          sessionId,
          userId: currentUserId,
          content,
          replyTo: reply && !isTempMessageId(reply.id) ? reply.id : null,
          replyTargetsNate: Boolean(reply?.is_ai),
          nateMode: newintervene,
        })

        if (!result.ok) {
          onSendFailed(tempId, result.error)
          setError(result.error)
          return
        }

        onSendConfirmed(tempId, result.messageId)
        if (result.thinkingId) onThinking(result.thinkingId)
      } catch {
        onSendFailed(tempId, "Failed to send message, please try again.")
        setError("Failed to send message, please try again.")
      }
    })()
  }

  return (
    <div>
      {replyingTo && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
            <Reply className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Reply to {replyingTo.name}: {replyingTo.content.slice(0, 80)}
            </span>
          </div>
          <button type="button" onClick={onCancelReply} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            name="message"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder={
              replyingTo
                ? `Reply to ${replyingTo.name}...`
                : newintervene === 3
                  ? "Write to your group..."
                  : "Write to your group, or mention @NATE"
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
          disabled={!inputValue.trim()}
          className="h-11 w-11 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
        >
          <SendHorizonal className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderMarkdown(raw: string) {
  let text = escapeHtml(raw)
  text = text.replace(/^###\s*(.+)$/gm, '<h3 class="mt-2 mb-1 text-sm font-semibold">$1</h3>')
  text = text.replace(/^##\s*(.+)$/gm, '<h2 class="mt-3 mb-1 text-base font-semibold">$1</h2>')
  text = text.replace(/^#\s*(.+)$/gm, '<h1 class="mt-3 mb-1 text-lg font-semibold">$1</h1>')
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>")
  text = text.replace(/`(.*?)`/g, '<code class="rounded bg-black/5 px-1 py-0.5 text-[0.85em]">$1</code>')
  text = text.replace(/\n/g, "<br>")
  return text
}

const MessageContent = memo(function MessageContent({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(content), [content])
  return <div className={className ?? "text-sm leading-relaxed break-words"} dangerouslySetInnerHTML={{ __html: html }} />
})

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

const NATE_THINKING_STEPS = [
  { label: "Reading your question", detail: "Picking out the key ideas" },
  { label: "Looking back at this chat", detail: "Connecting to earlier turns" },
  { label: "Drafting a reply", detail: "Keeping it clear and concise" },
]

function nextTypedLength(text: string, index: number) {
  if (index >= text.length) return text.length
  const rest = text.slice(index)
  if (rest.startsWith("```")) {
    const end = rest.indexOf("```", 3)
    return end === -1 ? text.length : index + end + 3
  }
  const match = rest.match(/^(\s*\S+\s*)/)
  return match ? index + Math.min(match[1].length, 28) : index + 1
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

function NateAvatar({ thinking = false }: { thinking?: boolean }) {
  return (
    <div className="relative mt-0.5 h-8 w-8 shrink-0">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-slate-900 text-[11px] font-bold text-white ring-1 ring-slate-200">
        N
      </div>
      {thinking && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-white bg-slate-700" />
      )}
    </div>
  )
}

function NateThinkingCard({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const tick = () => {
      const started = new Date(startedAt).getTime()
      setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)))
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  const step = Math.floor(elapsed / 2.2) % NATE_THINKING_STEPS.length
  const current = NATE_THINKING_STEPS[step]

  return (
    <div className="flex justify-start gap-2.5">
      <NateAvatar thinking />
      <div
        className="min-w-0 max-w-[min(92%,34rem)] flex-1 overflow-hidden rounded-2xl rounded-bl-md border border-slate-200 bg-white shadow-sm"
        role="status"
        aria-live="polite"
        aria-label="NATE is preparing a reply"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-800">NATE</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Working
            </span>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-slate-400">{elapsed}s</span>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-sm font-medium text-slate-800">{current.label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{current.detail}</p>
          <div className="mt-2 flex items-center gap-1.5">
            {NATE_THINKING_STEPS.map((item, index) => (
              <span
                key={item.label}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${index <= step ? "bg-slate-700" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
              style={{ animationDelay: `${dot * 0.12}s` }}
            />
          ))}
        </div>
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

  useEffect(() => {
    if (!reveal) {
      setShown(content)
      setTyping(false)
      return
    }
    let index = 0
    setTyping(true)
    setShown("")
    const timer = window.setInterval(() => {
      index = nextTypedLength(content, index)
      setShown(content.slice(0, index))
      if (index >= content.length) {
        window.clearInterval(timer)
        setTyping(false)
      }
    }, 24)
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
    <div className="group flex justify-start gap-2.5">
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
              <p className="truncate">{quote.content}</p>
            </div>
          )}
          <MessageContent content={shown} className="text-[15px] leading-relaxed break-words" />
          {typing && <span className="ml-0.5 inline-block h-4 w-[1.5px] translate-y-0.5 bg-slate-800 align-middle animate-pulse" />}
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
  sessionTitle,
  newintervene,
  readOnly = false,
}: {
  initialMessages: Message[]
  currentUserId: string
  currentUserName: string
  groupId: string
  groupName: string
  sessionId: string
  sessionTitle: string
  newintervene: number
  readOnly?: boolean
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [liveUsers, setLiveUsers] = useState<SessionUser[]>([])
  const [dbUsers, setDbUsers] = useState<SessionUser[]>([])
  const [presenceReady, setPresenceReady] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const revealIds = useRef(new Set<string>())

  const cancelReply = useCallback(() => setReplyingTo(null), [])

  const handleOptimisticSend = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message])
  }, [])

  const handleSendConfirmed = useCallback((tempId: string, realId: string) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === tempId ? { ...message, id: realId } : message))
    )
  }, [])

  const handleSendFailed = useCallback((tempId: string, _error: string) => {
    setMessages((prev) => prev.filter((message) => message.id !== tempId))
  }, [])

  const handleThinking = useCallback(
    (thinkingId: string) => {
      setMessages((prev) => {
        if (prev.some((message) => message.id === thinkingId)) return prev
        return [
          ...prev,
          {
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
          },
        ]
      })
      void finishNateReply(groupId, sessionId, thinkingId)
    },
    [groupId, sessionId]
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length])

  useEffect(() => {
    const supabase = createClient()
    let stopped = false
    let roomReady = false

    const refreshPresence = async () => {
      const users = await fetchSessionUsers(supabase, groupId)
      if (!stopped && users) setDbUsers(users)
    }

    const applyIncoming = async (messageId: string | undefined) => {
      if (!messageId) {
        const latest = await fetchSessionMessages(supabase, sessionId)
        if (!stopped && latest) {
          setMessages((prev) => {
            const temps = prev.filter((message) => isTempMessageId(message.id))
            if (temps.length === 0) return latest
            let merged = latest
            for (const temp of temps) {
              if (!merged.some((message) => message.user_id === temp.user_id && message.content === temp.content)) {
                merged = [...merged, temp]
              }
            }
            return merged.sort((a, b) => a.created_at.localeCompare(b.created_at))
          })
        }
        return
      }
      const row = await fetchMessageById(supabase, messageId)
      if (stopped || !row) return
      setMessages((prev) => mergeIncomingMessage(prev, rawToMessage(row, prev)))
    }

    const beat = async () => {
      if (!readOnly) await touchPresence(supabase, groupId, currentUserId)
      if (!roomReady) await refreshPresence()
    }

    const room = supabase.channel(`conet-room-${sessionId}`, {
      config: { presence: { key: currentUserId } },
    })

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
        const state = room.presenceState<{ name?: string }>()
        const users = Object.entries(state)
          .map(([id, metas]) => ({
            id,
            name: metas[0]?.name || "Member",
            lastSeen: Date.now(),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
        if (stopped) return
        roomReady = true
        setLiveUsers(users)
        setPresenceReady(true)
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || stopped) return
        if (readOnly) {
          void refreshPresence()
          return
        }
        void room.track({ name: currentUserName, seminar: groupName }).then(() => beat())
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

    void beat()
    void refreshPresence()

    const heartbeat = setInterval(() => {
      void beat()
    }, 12000)
    const reconcile = setInterval(() => {
      void fetchSessionMessages(supabase, sessionId).then((latest) => {
        if (stopped || !latest) return
        setMessages((prev) => {
          const temps = prev.filter((message) => isTempMessageId(message.id))
          if (temps.length === 0) return latest
          let merged = latest
          for (const temp of temps) {
            if (!merged.some((message) => message.user_id === temp.user_id && message.content === temp.content)) {
              merged = [...merged, temp]
            }
          }
          return merged.sort((a, b) => a.created_at.localeCompare(b.created_at))
        })
      })
      void refreshPresence()
    }, 25000)
    const prune = setInterval(() => {
      setDbUsers((prev) => prev.filter((user) => Date.now() - user.lastSeen < ONLINE_WINDOW_MS))
    }, 5000)

    return () => {
      stopped = true
      clearInterval(heartbeat)
      clearInterval(reconcile)
      clearInterval(prune)
      supabase.removeChannel(room)
      supabase.removeChannel(presenceTable)
    }
  }, [groupId, groupName, sessionId, currentUserId, currentUserName, readOnly])

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
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

  const rosterSource = presenceReady && liveUsers.length > 0 ? liveUsers : dbUsers
  const online = (rosterSource.length > 0
    ? rosterSource
    : readOnly
      ? []
      : [{ id: currentUserId, name: currentUserName, lastSeen: Date.now() }]
  )
    .slice()
    .sort((a, b) => {
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
      return a.name.localeCompare(b.name)
    })

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="shrink-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{groupName}</p>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" />
              Live
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{sessionTitle}</h2>
          <p className="text-xs text-slate-500">{visibleMessages.length} messages</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:items-end">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {online.length} in this session
          </p>
          <div className="flex max-h-24 w-full flex-wrap gap-1.5 overflow-y-auto sm:justify-end">
            {online.length === 0 && (
              <p className="text-xs text-slate-500">Waiting for people to join…</p>
            )}
            {online.map((person) => (
              <span
                key={person.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2.5"
                title={`${person.name} · CoNet Seminar`}
              >
                <SeminarIcon className="h-6 w-6" iconClassName="h-3 w-3" />
                <span className="max-w-[9rem] truncate text-xs font-semibold text-slate-700">
                  {person.id === currentUserId ? `${person.name} (you)` : person.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-5 py-5">
          {visibleMessages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-lg font-bold tracking-tight text-slate-900">This session is empty.</p>
            </div>
          )}
          {visibleMessages.map((msg) => {
            const mine = msg.user_id === currentUserId
            const thinking = msg.is_ai && msg.content === NATE_THINKING
            if (thinking) revealIds.current.add(msg.id)
            const pending = isTempMessageId(msg.id)
            if (msg.is_ai) {
              return thinking ? (
                <NateThinkingCard key={msg.id} startedAt={msg.created_at} />
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
                        <p className="truncate">{msg.original_message.content}</p>
                      </div>
                    )}
                    <MessageContent content={msg.content} />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className={`text-[11px] font-medium ${mine ? "text-white/70" : "text-slate-400"}`}>
                        {msg.name}
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

      <footer className="border-t border-slate-100 bg-white px-5 py-4">
        {readOnly ? (
          <p className="text-sm text-slate-500">You are viewing this session. Students write the messages here.</p>
        ) : (
          <ChatInputForm
            groupId={groupId}
            sessionId={sessionId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            replyingTo={replyingTo}
            onCancelReply={cancelReply}
            newintervene={newintervene}
            onOptimisticSend={handleOptimisticSend}
            onSendConfirmed={handleSendConfirmed}
            onSendFailed={handleSendFailed}
            onThinking={handleThinking}
          />
        )}
      </footer>
    </section>
  )
}
