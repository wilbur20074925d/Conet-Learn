"use client"

/**
 * Inline Google Docs-style note editor for Collaborative Documentation.
 * Ported from StreamLearn-pro NoteWorkspaceEditor for Co-net Learn.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import Image from "next/image"
import { Clock, History, Wifi, WifiOff } from "lucide-react"
import submitFigure from "@/components/figure/submit.png"
import { CollaborativeNoteEditor } from "@/components/collaborative-docs/CollaborativeNoteEditor"
import {
  DocumentSessionLoader,
  type LoadStage,
} from "@/components/collaborative-docs/DocumentSessionLoader"
import { SubmissionBody, submittedAt } from "@/components/collaborative-docs/group-post-history"
import { StudentFigureAvatar } from "@/components/student-figure-avatar"
import {
  buildStudentFigureIndexMap,
  studentFigureIndexForUserId,
} from "@/lib/student-figure-avatars"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useYjsNoteCollaboration } from "@/hooks/useYjsNoteCollaboration"
import type { CollaborativeNote } from "@/lib/collaborative-notes"
import { extractAuthoredSectionsFromHtml } from "@/lib/collaborative-author-mark"
import { listGroupPostSubmissions, submitGroupPost, type GroupPostSubmission } from "@/lib/group-post-submissions"
import { getYjsWsUrl } from "@/lib/yjs/normalizeYjsWsOrigin"
import {
  collapseRepeatedTitle,
  commentsToArray,
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
  readOnly?: boolean
}

const EDIT_LOG_COOLDOWN_MS = 45_000

export function NoteWorkspaceEditor({
  note,
  currentUser,
  onNoteMetaChange,
  onActivity,
  minHeight = "300px",
  showTitle = true,
  readOnly = false,
}: NoteWorkspaceEditorProps) {
  const seed = parseStoredNote(note.content)
  const initialFigureIndex = useMemo(
    () => studentFigureIndexForUserId(currentUser.id),
    [currentUser.id],
  )
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
    silent: readOnly,
    figureIndex: initialFigureIndex,
  })

  const [loadStage, setLoadStage] = useState<LoadStage>("finding")
  const [sessionReady, setSessionReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [successOpen, setSuccessOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [submissions, setSubmissions] = useState<GroupPostSubmission[]>([])
  const [historyError, setHistoryError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
    if (!ed || !ydoc || readOnly) return
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
  }, [ydoc, displayTitle, note.title, currentUser.id, onNoteMetaChange, logEditSession, readOnly])

  useEffect(() => {
    if (readOnly) return
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

  async function refreshSubmissions() {
    const result = await listGroupPostSubmissions(note.group_id)
    if (result.error) {
      setHistoryError(result.error)
      return
    }
    setHistoryError("")
    setSubmissions(result.submissions)
  }

  useEffect(() => {
    void refreshSubmissions()
  }, [note.group_id])

  async function handleSubmit() {
    if (readOnly || submitting) return
    const html = editorRef.current?.getHTML() || ""
    const plain = editorRef.current?.getText().trim() || ""
    if (!plain) {
      setSubmitError("Write something in the group post before submitting.")
      return
    }
    setSubmitting(true)
    setSubmitError("")
    const contributorMap = new Map<string, { userId: string; userName: string }>()
    contributorMap.set(currentUser.id, { userId: currentUser.id, userName: currentUser.name })
    for (const collaborator of collaborators) {
      contributorMap.set(collaborator.userId, {
        userId: collaborator.userId,
        userName: collaborator.userName || "User",
      })
    }
    const result = await submitGroupPost({
      groupId: note.group_id,
      noteId: note.id,
      title: displayTitle || note.title || "Group document",
      html,
      meta: {
        submittedBy: { userId: currentUser.id, userName: currentUser.name },
        contributors: [...contributorMap.values()],
        comments: ydoc ? commentsToArray(ydoc) : [],
        authoredSections: extractAuthoredSectionsFromHtml(html),
      },
    })
    setSubmitting(false)
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    setSuccessOpen(true)
    await refreshSubmissions()
  }

  const selected = submissions.find((item) => item.id === selectedId) || null

  const figureIndexByUserId = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>()
    byId.set(currentUser.id, { id: currentUser.id, name: currentUser.name || "User" })
    for (const collaborator of collaborators) {
      byId.set(collaborator.userId, {
        id: collaborator.userId,
        name: collaborator.userName || "User",
      })
    }
    return buildStudentFigureIndexMap([...byId.values()])
  }, [collaborators, currentUser.id, currentUser.name])

  const currentUserFigureIndex =
    figureIndexByUserId.get(currentUser.id) ?? initialFigureIndex

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
            readOnly={readOnly}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="min-w-[12rem] flex-1 bg-transparent text-2xl font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
            placeholder="Session name"
            aria-label="Session name"
          />
        )}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {collaborators.slice(0, 5).map((c) => (
              <StudentFigureAvatar
                key={c.clientId}
                figureIndex={
                  figureIndexByUserId.get(c.userId) ?? studentFigureIndexForUserId(c.userId)
                }
                size="sm"
                title={c.userName}
              />
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
          {!readOnly && (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="inline-flex h-7 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          )}
          <button
            type="button"
            aria-label="Previous submissions"
            title="Previous submissions"
            onClick={() => {
              setSelectedId(null)
              setHistoryOpen(true)
              void refreshSubmissions()
            }}
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            <History className="h-3.5 w-3.5" />
            {submissions.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-slate-900 px-0.5 text-[8px] font-semibold leading-none text-white">
                {submissions.length}
              </span>
            )}
          </button>
        </div>
      </div>
      {submitError && <p className="text-xs font-medium text-red-600">{submitError}</p>}

      <CollaborativeNoteEditor
        ydoc={ydoc}
        fragment={fragment}
        awareness={awareness}
        user={{
          userId: currentUser.id,
          name: currentUser.name || "User",
          color: userColor,
          figureIndex: currentUserFigureIndex,
        }}
        editable={!readOnly}
        publishPresence={!readOnly}
        documentTitle={displayTitle}
        seedHtml={seedHtmlOnce || undefined}
        onSeedConsumed={consumeSeedHtml}
        onEditorReady={handleEditorReady}
        minHeight={minHeight}
      />

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-[24rem] gap-0 overflow-hidden rounded-[28px] border-slate-200 p-0 shadow-xl">
          <div className="border-b border-slate-100 bg-slate-50 px-6 pb-1 pt-8">
            <div className="relative mx-auto h-52 w-full max-w-[280px]">
              <Image
                src={submitFigure}
                alt="Submitted successfully"
                fill
                sizes="280px"
                className="object-contain object-center"
              />
            </div>
          </div>
          <div className="px-6 pb-6 pt-4">
            <DialogHeader className="items-center space-y-1.5 text-center sm:text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Group post</p>
              <DialogTitle className="text-base font-bold tracking-tight text-slate-900">Submitted successfully</DialogTitle>
              <DialogDescription className="max-w-xs text-sm leading-6 text-slate-500">
                This copy is saved. The group post stays on the page, so anyone in the group can keep writing and submit
                again.
              </DialogDescription>
            </DialogHeader>
            <button
              type="button"
              onClick={() => setSuccessOpen(false)}
              className="mt-4 h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
            >
              OK
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open)
          if (!open) setSelectedId(null)
        }}
      >
        <DialogContent className="max-h-[min(40rem,calc(100dvh-2.5rem))] max-w-lg gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
                {selected ? "Previous submission" : "Previous submissions"}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">
                {selected
                  ? `${selected.authorName} · ${submittedAt(selected.createdAt)}`
                  : "Each submit is kept. Opening one does not change the live group post."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[min(28rem,calc(100dvh-12rem))] overflow-y-auto bg-slate-50 px-5 py-4">
            {selected ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{selected.title}</p>
                <div className="mt-2">
                  <SubmissionBody html={selected.html} />
                </div>
              </div>
            ) : historyError ? (
              <p className="text-sm leading-6 text-amber-900">{historyError}</p>
            ) : submissions.length === 0 ? (
              <p className="text-sm text-slate-500">No one has submitted this group post yet.</p>
            ) : (
              <ul className="space-y-2">
                {submissions.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                        {item.authorName.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {item.authorName}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          Submission {submissions.length - index} · {submittedAt(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected && (
            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                All submissions
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
