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
import { BookOpen, Check, Copy, Reply, SendHorizonal, X } from "lucide-react"

const ChatInputForm = memo(function ChatInputForm({
  currentUserId,
  currentUserName,
  replyingTo,
  onCancelReply,
  newintervene,
  onOptimisticSend,
  onQueueSend,
}: {
  currentUserId: string
  currentUserName: string
  replyingTo: Message | null
  onCancelReply: () => void
  newintervene: number
  onOptimisticSend: (message: Message) => void
  onQueueSend: (item: QueuedSend) => void
}) {
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputValue("")
  }, [replyingTo])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = inputValue.trim()
    if (!content) return

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
  const [linkStatus, setLinkStatus] = useState<"live" | "reconnecting">("live")
  const [tabHidden, setTabHidden] = useState(false)
  const [sendNotes, setSendNotes] = useState<Record<string, string>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const revealIds = useRef(new Set<string>())
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
  }, [])

  const handleSendConfirmed = useCallback((tempId: string, realId: string) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === tempId ? { ...message, id: realId } : message))
    )
    setSendNotes((prev) => {
      if (!prev[tempId]) return prev
      const next = { ...prev }
      delete next[tempId]
      return next
    })
  }, [])

  const handleThinking = useCallback(
    (thinkingId: string) => {
      const alreadyStarted = startedNateReplies.has(thinkingId)
      startedNateReplies.add(thinkingId)
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
    if (initialMessages.length === 0) return
    setMessages((prev) => (prev.length === 0 ? initialMessages : prev))
    setMessagesLoaded(true)
  }, [initialMessages])

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
      setMessages((prev) => mergeIncomingMessage(prev, rawToMessage(row, prev)))
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
          if (room.state === "joined") await room.track({ name: currentUserName, seminar: groupName })
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
            await room.track({ name: currentUserName, seminar: groupName })
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

      <footer className="border-t border-slate-100 bg-white px-5 py-4">
        {readOnly ? (
          <p className="text-sm text-slate-500">You are viewing this chat. Students write the messages here.</p>
        ) : pendingSession ? (
          <p className="text-sm text-slate-500">Opening the group chat…</p>
        ) : (
          <ChatInputForm
            currentUserId={currentUserId}
            currentUserName={currentUserName}
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
