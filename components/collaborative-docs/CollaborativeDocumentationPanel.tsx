"use client"

/**
 * One shared collaborative document per group. Opens straight into the editor.
 */

import { useCallback, useEffect, useState, useTransition } from "react"
import { DocumentSessionLoader } from "@/components/collaborative-docs/DocumentSessionLoader"
import { NoteWorkspaceEditor } from "@/components/collaborative-docs/NoteWorkspaceEditor"
import {
  ensureCollaborativeNote,
  updateCollaborativeNote,
  type CollaborativeNote,
} from "@/lib/collaborative-notes"

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
  const initial = [...initialNotes].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
  const [note, setNote] = useState<CollaborativeNote | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (note) return
    let cancelled = false
    ;(async () => {
      const result = await ensureCollaborativeNote(groupId)
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNote(result.note)
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, note])

  const persistMeta = useCallback((noteId: string, patch: Partial<CollaborativeNote>) => {
    setNote((current) =>
      current && current.id === noteId
        ? { ...current, ...patch, updated_at: patch.updated_at || new Date().toISOString() }
        : current
    )
    startTransition(async () => {
      const payload: Partial<Pick<CollaborativeNote, "title" | "content">> = {}
      if (typeof patch.title === "string") payload.title = patch.title
      if (typeof patch.content === "string") payload.content = patch.content
      if (Object.keys(payload).length === 0) return
      await updateCollaborativeNote(noteId, payload)
    })
  }, [])

  if (!note) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
        {error ? (
          <p className="px-6 py-4 text-center text-sm text-red-600">{error}</p>
        ) : (
          <DocumentSessionLoader
            stage="finding"
            sessionTitle="Group document"
            userName={currentUserName}
          />
        )}
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-neutral-950">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <NoteWorkspaceEditor
          key={note.id}
          note={note}
          currentUser={{ id: currentUserId, name: currentUserName }}
          minHeight="calc(100vh - 12rem)"
          onNoteMetaChange={(patch) => persistMeta(note.id, patch)}
        />
      </div>
    </section>
  )
}
