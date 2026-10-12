"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { createChatSession, deleteChatSession } from "@/lib/classroom-actions"
import type { ChatSession } from "@/lib/classroom"

export default function SessionRail({
  groupId,
  sessions,
  activeSessionId,
  currentUserId,
}: {
  groupId: string
  sessions: ChatSession[]
  activeSessionId: string | null
  currentUserId: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function create(event: FormEvent) {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle || pending) return
    setPending(true)
    setError("")
    const result = await createChatSession(groupId, nextTitle)
    if (!result.ok) {
      setError(result.error)
      setPending(false)
      return
    }
    setTitle("")
    setPending(false)
    router.push(`/?session=${result.sessionId}`)
    router.refresh()
  }

  async function remove(sessionId: string) {
    if (pending) return
    if (!window.confirm("Delete this chat session and its messages?")) return
    setPending(true)
    setError("")
    const result = await deleteChatSession(sessionId)
    if (!result.ok) {
      setError(result.error)
      setPending(false)
      return
    }
    setPending(false)
    if (sessionId === activeSessionId) router.push("/")
    router.refresh()
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-100 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Chat sessions</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Start as many conversations as your group needs.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-500">No chat sessions yet.</p>
        )}
        {sessions.map((session) => {
          const active = session.id === activeSessionId
          const mine = session.createdBy === currentUserId
          return (
            <div key={session.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  router.push(`/?session=${session.id}`)
                  router.refresh()
                }}
                className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="block truncate">{session.title}</span>
              </button>
              {mine && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(session.id)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete ${session.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <form onSubmit={create} className="border-t border-slate-100 p-3">
        <label className="sr-only" htmlFor="session-title">
          New session title
        </label>
        <input
          id="session-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New session title"
          maxLength={80}
          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
        />
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {pending ? "Saving..." : "Create session"}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </form>
    </aside>
  )
}
