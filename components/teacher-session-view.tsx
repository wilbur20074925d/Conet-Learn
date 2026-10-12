"use client"

import { useEffect, useState } from "react"
import ChatPanel from "@/components/chat-panel"
import CollaborativeDocumentationPanel from "@/components/collaborative-docs/CollaborativeDocumentationPanel"
import type { CollaborativeNote } from "@/lib/collaborative-notes"
import type { Message } from "@/lib/map-messages"

export type IndividualNoteView = {
  userId: string
  name: string
  concept1: string
  concept2: string
  submissions?: {
    id: string
    concept1: string
    concept2: string
    createdAt: string
  }[]
}

function submittedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function NoteText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value || "Nothing written yet."}</p>
    </div>
  )
}

function NoteReadout({ notes, unavailable }: { notes: IndividualNoteView[]; unavailable: boolean }) {
  if (unavailable) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-900">Individual notes are not readable yet</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Run supabase/conet-teacher-observe.sql in the Supabase SQL editor, then open this session again.
          </p>
        </div>
      </div>
    )
  }
  if (notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-900">No individual notes yet</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Each student’s submissions appear here after they submit in this group.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white px-4 py-4 sm:px-5">
      <ul className="space-y-3">
        {notes.map((note) => {
          const submissions = note.submissions || []
          const latest = submissions[0]
          const earlier = submissions.slice(1)
          return (
            <li key={note.userId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-900">{note.name}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {submissions.length === 0
                    ? "Not submitted"
                    : `${submissions.length} ${submissions.length === 1 ? "submission" : "submissions"}`}
                </p>
              </div>
              {latest ? (
                <div className="mt-3 space-y-3">
                  <p className="text-xs font-medium text-slate-500">
                    Latest · {submittedAt(latest.createdAt)}
                  </p>
                  <NoteText label="Initial thoughts" value={latest.concept1} />
                  <NoteText label="New insights and supplementary points" value={latest.concept2} />
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-xs font-medium text-slate-500">
                    {note.concept1 || note.concept2 ? "Current writing, not submitted yet." : "No submission yet."}
                  </p>
                  {(note.concept1 || note.concept2) && (
                    <>
                      <NoteText label="Initial thoughts" value={note.concept1} />
                      <NoteText label="New insights and supplementary points" value={note.concept2} />
                    </>
                  )}
                </div>
              )}
              {earlier.length > 0 && (
                <details className="mt-3 border-t border-slate-200 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                    {earlier.length} earlier {earlier.length === 1 ? "submission" : "submissions"}
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {earlier.map((item, index) => (
                      <li key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-xs font-semibold text-slate-700">
                          Submission {submissions.length - index - 1} · {submittedAt(item.createdAt)}
                        </p>
                        <div className="mt-2 space-y-3">
                          <NoteText label="Initial thoughts" value={item.concept1} />
                          <NoteText label="New insights and supplementary points" value={item.concept2} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function TeacherSessionView({
  groupId,
  groupName,
  sessionId,
  sessionTitle,
  view,
  initialMessages,
  initialNotes,
  individualNotes,
  notesUnavailable = false,
  currentUserId,
  currentUserName,
  newintervene,
  onBack,
  onViewChange,
}: {
  groupId: string
  groupName: string
  sessionId: string | null
  sessionTitle: string
  view: "note" | "post"
  initialMessages: Message[]
  initialNotes: CollaborativeNote[]
  individualNotes: IndividualNoteView[]
  notesUnavailable?: boolean
  currentUserId: string
  currentUserName: string
  newintervene: number
  onBack?: () => void
  onViewChange?: (view: "note" | "post") => void
}) {
  const [panel, setPanel] = useState(view)

  useEffect(() => {
    setPanel(view)
  }, [view])

  function show(next: "note" | "post") {
    setPanel(next)
    onViewChange?.(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Session · {sessionTitle}
          </p>
          <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{groupName}</h1>
          <p className="mt-0.5 text-xs text-slate-500">You stay hidden from the student chat and group document.</p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => show("note")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                panel === "note" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Individual Note
            </button>
            <button
              type="button"
              onClick={() => show("post")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                panel === "post" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Group Post
            </button>
          </nav>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 shrink-0 items-center rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Back to dashboard
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-2">
        <div className="conet-surface min-h-0 overflow-hidden">
          {sessionId ? (
            <ChatPanel
              key={sessionId}
              initialMessages={initialMessages}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              groupId={groupId}
              groupName={groupName}
              sessionId={sessionId}
              newintervene={newintervene}
              readOnly
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div>
                <p className="text-lg font-bold tracking-tight text-slate-900">No chat yet</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  This group’s chat appears when a student opens the session.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="conet-surface min-h-0 overflow-hidden">
          {panel === "note" ? (
            <NoteReadout notes={individualNotes} unavailable={notesUnavailable} />
          ) : (
            <CollaborativeDocumentationPanel
              key={groupId}
              groupId={groupId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              initialNotes={initialNotes}
              readOnly
            />
          )}
        </div>
      </div>
    </div>
  )
}
