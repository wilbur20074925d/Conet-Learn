"use client"

/**
 * Collaborative Documentation sessions panel for the Co-net collaboration page.
 * Structure follows StreamLearn-pro CollaborativeNotebook (document list + live Yjs session).
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { FileText, Plus, ArrowLeft, Trash2, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NoteWorkspaceEditor } from "@/components/collaborative-docs/NoteWorkspaceEditor"
import {
  createCollaborativeNote,
  deleteCollaborativeNote,
  listCollaborativeNotes,
  updateCollaborativeNote,
  type CollaborativeNote,
} from "@/lib/collaborative-notes"
import { previewFromStoredContent } from "@/lib/yjs/yjsNoteSchema"

function formatRelative(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function CollaborativeDocumentationPanel({
  groupId,
  currentUserId,
  currentUserName,
  initialNotes = [],
}: {
  groupId: string
  currentUserId: string
  currentUserName: string
  initialNotes?: CollaborativeNote[]
}) {
  const [notes, setNotes] = useState<CollaborativeNote[]>(initialNotes)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const active = useMemo(
    () => notes.find((note) => note.id === activeId) ?? null,
    [notes, activeId]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await listCollaborativeNotes(groupId)
      if (cancelled || !result.ok) return
      setNotes(result.notes)
    })()
    return () => {
      cancelled = true
    }
  }, [groupId])

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listCollaborativeNotes(groupId)
      if (result.ok) setNotes(result.notes)
    })
  }, [groupId])

  async function handleCreate() {
    setError(null)
    setCreating(true)
    const result = await createCollaborativeNote(groupId, draftTitle)
    setCreating(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotes((current) => [result.note, ...current.filter((n) => n.id !== result.note.id)])
    setDraftTitle("")
    setActiveId(result.note.id)
  }

  async function handleDelete(noteId: string) {
    const snapshot = notes
    setNotes((current) => current.filter((n) => n.id !== noteId))
    if (activeId === noteId) setActiveId(null)
    const result = await deleteCollaborativeNote(noteId)
    if (!result.ok) {
      setNotes(snapshot)
      setError(result.error)
    }
  }

  const persistMeta = useCallback(
    (noteId: string, patch: Partial<CollaborativeNote>) => {
      setNotes((current) =>
        current.map((note) =>
          note.id === noteId
            ? {
                ...note,
                ...patch,
                updated_at: patch.updated_at || new Date().toISOString(),
              }
            : note
        )
      )
      startTransition(async () => {
        const payload: Partial<Pick<CollaborativeNote, "title" | "content">> = {}
        if (typeof patch.title === "string") payload.title = patch.title
        if (typeof patch.content === "string") {
          // Prefer __NOTE_V1__ blobs from the editor; plain HTML still works via parseStoredNote.
          payload.content = patch.content
        }
        if (Object.keys(payload).length === 0) return
        await updateCollaborativeNote(noteId, payload)
      })
    },
    []
  )

  if (active) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-neutral-950">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2 text-xs font-semibold"
              onClick={() => {
                setActiveId(null)
                refresh()
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Sessions
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight">Documentation session</p>
              <p className="truncate text-[11px] text-neutral-500">
                Live co-editing with your group via Yjs
              </p>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <NoteWorkspaceEditor
            key={active.id}
            note={active}
            currentUser={{ id: currentUserId, name: currentUserName }}
            minHeight="calc(100vh - 14rem)"
            onNoteMetaChange={(patch) => persistMeta(active.id, patch)}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-neutral-950">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
            <StickyNote className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold tracking-tight">Collaborative Documentation</h2>
            <p className="truncate text-xs text-neutral-500">
              Create a document session, then co-author in real time.
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            New documentation session
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Documentation title"
              className="h-9 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate()
              }}
            />
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="h-9 gap-1.5 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? "Creating…" : "New Document"}
            </Button>
          </div>
          {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Group Documents</h3>
            <span className="text-[11px] font-medium text-neutral-500">
              {pending ? "Refreshing…" : `${notes.length} session${notes.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {notes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-neutral-300" />
              <p className="mt-3 text-sm font-semibold text-slate-800">No documents yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Create your first collaborative documentation session to get started.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li key={note.id}>
                  <article className="group flex items-stretch gap-2 rounded-xl border border-neutral-200 bg-white p-3 transition hover:border-neutral-400">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setActiveId(note.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{note.title}</p>
                          <p className="truncate text-[11px] text-neutral-500">
                            {previewFromStoredContent(note.content, 80) || "Empty document"} ·{" "}
                            {formatRelative(note.updated_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-neutral-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                      onClick={() => void handleDelete(note.id)}
                      aria-label="Delete session"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
