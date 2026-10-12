"use client"

/**
 * Inline Google Docs-style note editor for Collaborative Documentation.
 * Ported from StreamLearn-pro NoteWorkspaceEditor for Co-net Learn.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { Clock, Wifi, WifiOff } from "lucide-react"
import { CollaborativeNoteEditor } from "@/components/collaborative-docs/CollaborativeNoteEditor"
import {
  DocumentSessionLoader,
  type LoadStage,
} from "@/components/collaborative-docs/DocumentSessionLoader"
import { useYjsNoteCollaboration } from "@/hooks/useYjsNoteCollaboration"
import type { CollaborativeNote } from "@/lib/collaborative-notes"
import { getYjsWsUrl } from "@/lib/yjs/normalizeYjsWsOrigin"
import {
  collapseRepeatedTitle,
  getMetaMap,
  parseStoredNote,
  serializeNoteDocForStorage,
} from "@/lib/yjs/yjsNoteSchema"

const MIN_LOAD_MS = 900
const MAX_LOAD_MS = 10_000

export interface NoteActivityEvent {
  eventType: string
  description: string
  noteTitle?: string
  meta?: Record<string, unknown>
}

interface NoteWorkspaceEditorProps {
  note: CollaborativeNote
  currentUser: { id: string; name: string }
  onNoteMetaChange?: (patch: Partial<CollaborativeNote>) => void
  onActivity?: (event: NoteActivityEvent) => void
  minHeight?: string
  showTitle?: boolean
}

const EDIT_LOG_COOLDOWN_MS = 45_000

export function NoteWorkspaceEditor({
  note,
  currentUser,
  onNoteMetaChange,
  onActivity,
  minHeight = "300px",
  showTitle = true,
}: NoteWorkspaceEditorProps) {
  const seed = parseStoredNote(note.content)
  const {
    isConnected,
    isSynced,
    title,
    setTitle,
    collaborators,
    ydoc,
    fragment,
    awareness,
    userColor,
    seedHtmlOnce,
    consumeSeedHtml,
  } = useYjsNoteCollaboration({
    noteId: note.id,
    userId: currentUser.id,
    userName: currentUser.name || "User",
    wsUrl: getYjsWsUrl(),
    enabled: true,
    seedTitle: collapseRepeatedTitle(note.title || ""),
    seedHtml: seed.html || note.content || "",
  })

  const [loadStage, setLoadStage] = useState<LoadStage>("finding")
  const [sessionReady, setSessionReady] = useState(false)
  const loadStartedAt = useRef(Date.now())
  const htmlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const lastEditLogAt = useRef(0)
  const titleBeforeEdit = useRef(collapseRepeatedTitle(note.title || ""))
  const displayTitle = collapseRepeatedTitle(title || "")
  const onActivityRef = useRef(onActivity)
  onActivityRef.current = onActivity

  const handleEditorReady = useCallback((ed: Editor) => {
    editorRef.current = ed
  }, [])

  useEffect(() => {
    loadStartedAt.current = Date.now()
    setSessionReady(false)
    setLoadStage("finding")
    const timer = window.setTimeout(() => setLoadStage("opening"), 220)
    return () => window.clearTimeout(timer)
  }, [note.id])

  useEffect(() => {
    if (ydoc && fragment && awareness) {
      setLoadStage((stage) => (stage === "finding" || stage === "opening" ? "joining" : stage))
    }
  }, [ydoc, fragment, awareness])

  useEffect(() => {
    if (isConnected) setLoadStage("connecting")
  }, [isConnected])

  useEffect(() => {
    if (!isSynced || !ydoc || !awareness) return
    const wait = Math.max(0, MIN_LOAD_MS - (Date.now() - loadStartedAt.current))
    const timer = window.setTimeout(() => setSessionReady(true), wait)
    return () => window.clearTimeout(timer)
  }, [isSynced, ydoc, awareness])

  useEffect(() => {
    const timer = window.setTimeout(() => setSessionReady(true), MAX_LOAD_MS)
    return () => window.clearTimeout(timer)
  }, [note.id])

  const logEditSession = useCallback(() => {
    const now = Date.now()
    if (now - lastEditLogAt.current < EDIT_LOG_COOLDOWN_MS) return
    lastEditLogAt.current = now
    onActivityRef.current?.({
      eventType: "notebook_edit",
      description: "Edited document content",
      noteTitle: displayTitle || note.title,
    })
  }, [displayTitle, note.title])

  useEffect(() => {
    const ed = editorRef.current
    if (!ed || !ydoc) return
    const onUpdate = () => {
      if (htmlTimer.current) clearTimeout(htmlTimer.current)
      htmlTimer.current = setTimeout(() => {
        const html = ed.getHTML()
        getMetaMap(ydoc).set("lastHtml", html)
        // Persist __NOTE_V1__ + Yjs update so cold reload restores CRDT state
        // (same durable format as StreamLearn / yjs-websocket-server).
        onNoteMetaChange?.({
          title: displayTitle || note.title,
          content: serializeNoteDocForStorage(ydoc, html),
          updated_at: new Date().toISOString(),
          last_edited_by: currentUser.id,
        })
        logEditSession()
      }, 1500)
    }
    ed.on("update", onUpdate)
    return () => {
      ed.off("update", onUpdate)
      if (htmlTimer.current) clearTimeout(htmlTimer.current)
    }
  }, [ydoc, displayTitle, note.title, currentUser.id, onNoteMetaChange, logEditSession])

  useEffect(() => {
    const cleaned = collapseRepeatedTitle(title || "")
    if (cleaned && cleaned !== note.title) {
      onNoteMetaChange?.({ title: cleaned })
    }
    // seed title only on change from yjs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])

  const handleTitleChange = (value: string) => {
    const previous = titleBeforeEdit.current
    setTitle(value)
    const cleaned = collapseRepeatedTitle(value)
    if (cleaned && cleaned !== previous && cleaned !== note.title) {
      window.clearTimeout((handleTitleChange as { _t?: number })._t)
      ;(handleTitleChange as { _t?: number })._t = window.setTimeout(() => {
        if (cleaned === titleBeforeEdit.current) return
        onActivityRef.current?.({
          eventType: "notebook_rename",
          description: `Renamed from “${titleBeforeEdit.current || previous}” to “${cleaned}”`,
          noteTitle: cleaned,
          meta: {
            changes: [
              {
                field: "title",
                before: titleBeforeEdit.current || previous,
                after: cleaned,
              },
            ],
          },
        })
        titleBeforeEdit.current = cleaned
      }, 1200)
    }
  }

  if (!sessionReady || !ydoc || !fragment || !awareness) {
    return (
      <DocumentSessionLoader
        stage={loadStage}
        sessionTitle={displayTitle || note.title || "Group document"}
        userName={currentUser.name || "you"}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showTitle && (
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="min-w-[12rem] flex-1 bg-transparent text-2xl font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
            placeholder="Session name"
            aria-label="Session name"
          />
        )}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {collaborators.slice(0, 5).map((c) => (
              <div
                key={c.clientId}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-white"
                style={{ backgroundColor: c.color }}
                title={c.userName}
              >
                {(c.userName || "U")[0].toUpperCase()}
              </div>
            ))}
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
              isConnected && isSynced
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {isConnected && isSynced ? (
              <>
                <Wifi className="h-3 w-3" /> Live
              </>
            ) : isConnected ? (
              <>
                <Clock className="h-3 w-3" /> Syncing
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" /> Offline
              </>
            )}
          </span>
        </div>
      </div>

      <CollaborativeNoteEditor
        ydoc={ydoc}
        fragment={fragment}
        awareness={awareness}
        user={{
          name: currentUser.name || "User",
          color: userColor,
        }}
        documentTitle={displayTitle}
        seedHtml={seedHtmlOnce || undefined}
        onSeedConsumed={consumeSeedHtml}
        onEditorReady={handleEditorReady}
        minHeight={minHeight}
      />
    </div>
  )
}
