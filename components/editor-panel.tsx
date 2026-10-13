"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { History } from "lucide-react"
import blockFigure from "@/components/figure/block.png"
import submitFigure from "@/components/figure/submit.png"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import InspiredByButton from "@/components/inspired-by-button"
import { listMyNoteSubmissions, saveDocumentSnapshot, submitFinalDocument } from "@/lib/actions"

type SaveStatus = "idle" | "saving" | "saved" | "error"

interface GroupMember {
  id: string
  name: string
  avatar_url?: string | null
}

interface StructuredContent {
  part1_concept1: string
  part1_concept2: string
  savedAt?: string
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function submittedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

type NotePart = "thoughts" | "insights"

type PastSubmission = {
  id: string
  concept1: string
  concept2: string
  part: NotePart | "both"
  createdAt: string
}

function partTitle(part: NotePart | "both") {
  if (part === "thoughts") return "Initial thoughts"
  if (part === "insights") return "Individual Reflection: New insights and supplementary points"
  return "Both parts"
}

function successCopy(part: NotePart | "both") {
  if (part === "thoughts") {
    return {
      partLabel: "Part 1",
      title: "Initial thoughts",
      body: "This part is locked. After the discussion, write your new insights below.",
    }
  }
  if (part === "insights") {
    return {
      partLabel: "Part 2",
      title: "New insights and supplementary points",
      body: "This part is locked and can no longer be changed.",
    }
  }
  return {
    partLabel: "Note",
    title: "Both parts",
    body: "This note is locked and can no longer be changed.",
  }
}

function localKey(groupId: string) {
  return `conet-in-class-essay:${groupId}`
}

type NoteLocks = { thoughts: boolean; insights: boolean }

function locksKey(groupId: string) {
  return `conet-note-locks:${groupId}`
}

function readNoteLocks(groupId: string): NoteLocks {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(locksKey(groupId)) || "{}") as Partial<NoteLocks>
    return { thoughts: Boolean(parsed.thoughts), insights: Boolean(parsed.insights) }
  } catch {
    return { thoughts: false, insights: false }
  }
}

function writeNoteLocks(groupId: string, locks: NoteLocks) {
  try {
    window.localStorage.setItem(locksKey(groupId), JSON.stringify(locks))
  } catch {
    // Best-effort; server submissions remain the source of truth after load.
  }
}

function locksFromSubmissions(submissions: PastSubmission[]): NoteLocks {
  return {
    thoughts: submissions.some((item) => item.part !== "insights"),
    insights: submissions.some((item) => item.part !== "thoughts"),
  }
}

function submissionsForPart(part: NotePart, submissions: PastSubmission[]) {
  return submissions.filter((item) => (part === "thoughts" ? item.part !== "insights" : item.part !== "thoughts"))
}

function PartHistoryButton({
  part,
  count,
  onClick,
}: {
  part: NotePart
  count: number
  onClick: () => void
}) {
  const label =
    part === "thoughts" ? "Previous initial thoughts submissions" : "Previous new insights submissions"
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
    >
      <History className="h-3.5 w-3.5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-950 px-1 text-[9px] font-semibold leading-none text-white">
          {count}
        </span>
      )}
    </button>
  )
}

function toPayload(next: StructuredContent) {
  return JSON.stringify({
    field1: next.part1_concept1 || "",
    field2: next.part1_concept2 || "",
    part1_concept1: next.part1_concept1 || "",
    part1_concept2: next.part1_concept2 || "",
    savedAt: next.savedAt || new Date().toISOString(),
  })
}

function parseContent(raw: string | null | undefined): StructuredContent | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    if (!parsed || typeof parsed !== "object") return null
    return {
      part1_concept1: parsed.part1_concept1 || parsed.field1 || "",
      part1_concept2: parsed.part1_concept2 || parsed.field2 || "",
      savedAt: parsed.savedAt || "",
    }
  } catch {
    return { part1_concept1: raw, part1_concept2: "", savedAt: "" }
  }
}

function preferNewer(server: StructuredContent | null, local: StructuredContent | null): StructuredContent {
  const empty: StructuredContent = { part1_concept1: "", part1_concept2: "" }
  if (!local) return server || empty
  if (!server) return local
  const serverStamp = Date.parse(server.savedAt || "") || 0
  const localStamp = Date.parse(local.savedAt || "") || 0
  if (localStamp && serverStamp) return localStamp >= serverStamp ? local : server
  if (localStamp && !serverStamp && (local.part1_concept1 || local.part1_concept2)) return local
  return server
}

export default function EditorPanel({
  initialContent,
  groupId,
  groupMembers,
}: {
  initialContent: string
  groupId: string
  groupMembers: GroupMember[]
}) {
  const [structuredContent, setStructuredContent] = useState<StructuredContent>({
    part1_concept1: "",
    part1_concept2: "",
  })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [successPart, setSuccessPart] = useState<NotePart | "both">("both")
  const [successOpen, setSuccessOpen] = useState(false)
  const [historyPart, setHistoryPart] = useState<NotePart | null>(null)
  const [submissions, setSubmissions] = useState<PastSubmission[]>([])
  const [submissionsReady, setSubmissionsReady] = useState(false)
  const [cachedLocks, setCachedLocks] = useState<NoteLocks>(() =>
    typeof window === "undefined" ? { thoughts: false, insights: false } : readNoteLocks(groupId)
  )
  const [serverDraft, setServerDraft] = useState<{ concept1: string; concept2: string; savedAt: string } | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<PastSubmission | null>(null)
  const thoughtsSubmission = submissions.find((item) => item.part !== "insights")
  const insightsSubmission = submissions.find((item) => item.part !== "thoughts")
  const thoughtsLocked =
    Boolean(thoughtsSubmission) || (!submissionsReady && cachedLocks.thoughts)
  const insightsLocked =
    Boolean(insightsSubmission) || (!submissionsReady && cachedLocks.insights)
  const thoughtsEditable = submissionsReady && !thoughtsLocked
  const insightsEditable = thoughtsLocked && !insightsLocked
  const showPart2Block = submissionsReady && !thoughtsLocked && !insightsLocked
  const showPart2Loading = !submissionsReady && !thoughtsLocked && !insightsLocked
  const showPart2Editor = insightsLocked || insightsEditable
  const thoughtsHistoryCount = submissionsForPart("thoughts", submissions).length
  const insightsHistoryCount = submissionsForPart("insights", submissions).length
  const historySubmissions = historyPart ? submissionsForPart(historyPart, submissions) : []

  function openPartHistory(part: NotePart) {
    setSelectedSubmission(null)
    setHistoryPart(part)
    void refreshSubmissions()
  }
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydrated = useRef(false)
  const sawLock = useRef(false)
  const submittingRef = useRef<NotePart | null>(null)
  const latestRef = useRef(structuredContent)
  latestRef.current = structuredContent

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    let local: StructuredContent | null = null
    try {
      local = parseContent(window.localStorage.getItem(localKey(groupId)))
    } catch {
      local = null
    }
    const next = preferNewer(parseContent(initialContent), local)
    setStructuredContent(next)
  }, [initialContent, groupId])

  async function persistNow(next: StructuredContent) {
    const stamped = { ...next, savedAt: new Date().toISOString() }
    const payload = toPayload(stamped)
    try {
      window.localStorage.setItem(localKey(groupId), payload)
    } catch {
      // Private mode or a full disk should not block the Supabase save.
    }
    const result = await saveDocumentSnapshot(payload, groupId)
    if (result?.success) {
      setSaveStatus("saved")
      setHasUnsavedChanges(false)
      return true
    }
    setSaveStatus("error")
    return false
  }

  function debouncedSnapshotSave(next: StructuredContent) {
    const stamped = { ...next, savedAt: new Date().toISOString() }
    setHasUnsavedChanges(true)
    setSaveStatus("saving")
    try {
      window.localStorage.setItem(localKey(groupId), toPayload(stamped))
    } catch {
      // Local copy is best-effort; Supabase still saves on the debounce.
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void persistNow(stamped)
    }, 800)
  }

  useEffect(() => {
    const flush = () => {
      if (!hydrated.current) return
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        void persistNow(latestRef.current)
      }
    }
    const onHide = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onHide)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [groupId])

  function updateField(field: keyof StructuredContent, value: string) {
    if (field === "part1_concept1" && !thoughtsEditable) return
    if (field === "part1_concept2" && !insightsEditable) return
    setStructuredContent((prev) => {
      const next = { ...prev, [field]: value, savedAt: new Date().toISOString() }
      debouncedSnapshotSave(next)
      return next
    })
  }

  function addInspiration(field: keyof StructuredContent, name: string) {
    const note = `(inspired by ${name})`
    const current = structuredContent[field] || ""
    updateField(field, current ? `${current} ${note}` : note)
  }

  async function refreshSubmissions(options?: { silent?: boolean }) {
    const result = await listMyNoteSubmissions(groupId)
    if (!result.error) {
      setSubmissions((current) => {
        const pending = current.filter((item) => item.id.startsWith("pending-"))
        const stillPending = pending.filter(
          (item) => !result.submissions.some((row) => row.part === item.part || row.part === "both")
        )
        const merged = [...stillPending, ...result.submissions]
        const locks = locksFromSubmissions(merged)
        setCachedLocks(locks)
        writeNoteLocks(groupId, locks)
        return merged
      })
      setServerDraft(result.draft)
    }
    setSubmissionsReady(true)
  }

  useEffect(() => {
    setCachedLocks(readNoteLocks(groupId))
    setSubmissions([])
    setSubmissionsReady(false)
    void refreshSubmissions()
    const timer = window.setInterval(() => {
      void refreshSubmissions({ silent: true })
    }, 6000)
    const onFocus = () => {
      void refreshSubmissions()
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [groupId])

  useEffect(() => {
    if (!submissionsReady) return
    const prev = latestRef.current
    const serverStamp = Date.parse(serverDraft?.savedAt || "") || 0
    const localStamp = Date.parse(prev.savedAt || "") || 0
    const serverCleared = Boolean(serverDraft && !serverDraft.concept1.trim() && !serverDraft.concept2.trim())
    const localHasText = Boolean(prev.part1_concept1.trim() || prev.part1_concept2.trim())
    const teacherReset =
      !thoughtsLocked &&
      !insightsLocked &&
      serverCleared &&
      ((sawLock.current && serverStamp > 0) || (localHasText && localStamp > 0 && serverStamp > localStamp))
    if (teacherReset) {
      sawLock.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const empty: StructuredContent = { part1_concept1: "", part1_concept2: "", savedAt: new Date().toISOString() }
      setStructuredContent(empty)
      setCachedLocks({ thoughts: false, insights: false })
      writeNoteLocks(groupId, { thoughts: false, insights: false })
      try {
        window.localStorage.removeItem(localKey(groupId))
      } catch {
        // The cleared server copy is what matters after a teacher reset.
      }
      void persistNow(empty)
      return
    }
    if (thoughtsLocked || insightsLocked) sawLock.current = true
    const part1_concept1 = thoughtsLocked ? thoughtsSubmission?.concept1 || prev.part1_concept1 : prev.part1_concept1
    const part1_concept2 = insightsLocked ? insightsSubmission?.concept2 || prev.part1_concept2 : prev.part1_concept2
    if (part1_concept1 === prev.part1_concept1 && part1_concept2 === prev.part1_concept2) return
    setStructuredContent({ ...prev, part1_concept1, part1_concept2 })
  }, [submissionsReady, thoughtsLocked, insightsLocked, thoughtsSubmission?.concept1, insightsSubmission?.concept2, serverDraft?.savedAt, serverDraft?.concept1, serverDraft?.concept2, groupId])

  function handleSubmitPart(part: NotePart) {
    if (submittingRef.current) return
    if (part === "thoughts" && !thoughtsEditable) return
    if (part === "insights" && !insightsEditable) return
    const text = part === "thoughts" ? structuredContent.part1_concept1 : structuredContent.part1_concept2
    if (!text.trim()) {
      setSubmitError(part === "thoughts" ? "Write your initial thoughts before submitting." : "Write your new insights before submitting.")
      return
    }
    submittingRef.current = part
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const stamped = { ...structuredContent, savedAt: new Date().toISOString() }
    const payload = toPayload(stamped)
    const pendingId = `pending-${part}`
    const pending: PastSubmission = {
      id: pendingId,
      concept1: stamped.part1_concept1,
      concept2: stamped.part1_concept2,
      part,
      createdAt: stamped.savedAt || new Date().toISOString(),
    }
    try {
      window.localStorage.setItem(localKey(groupId), payload)
    } catch {
      // The server copy is the one that is submitted.
    }
    setSubmitError("")
    setStructuredContent(stamped)
    setSaveStatus("saved")
    setHasUnsavedChanges(false)
    setSubmissions((current) => {
      const merged = [pending, ...current.filter((item) => item.id !== pendingId && item.part !== part)]
      const locks = locksFromSubmissions(merged)
      setCachedLocks(locks)
      writeNoteLocks(groupId, locks)
      return merged
    })
    setSuccessPart(part)
    setSuccessOpen(true)

    void (async () => {
      try {
        const result = await submitFinalDocument(groupId, payload, part)
        if ("error" in result) {
          if (/already submitted/i.test(result.error || "")) {
            void refreshSubmissions({ silent: true })
            return
          }
          setSubmissions((current) => {
            const merged = current.filter((item) => item.id !== pendingId)
            const locks = locksFromSubmissions(merged)
            setCachedLocks(locks)
            writeNoteLocks(groupId, locks)
            return merged
          })
          setSuccessOpen(false)
          setSubmitError(result.error || "Failed to submit, please try again.")
          return
        }
        setSubmissions((current) => {
          const merged = [result.submission, ...current.filter((item) => item.id !== pendingId && item.id !== result.submission.id)]
          const locks = locksFromSubmissions(merged)
          setCachedLocks(locks)
          writeNoteLocks(groupId, locks)
          return merged
        })
      } catch {
        setSubmissions((current) => {
          const merged = current.filter((item) => item.id !== pendingId)
          const locks = locksFromSubmissions(merged)
          setCachedLocks(locks)
          writeNoteLocks(groupId, locks)
          return merged
        })
        setSuccessOpen(false)
        setSubmitError("Failed to submit, please try again.")
      } finally {
        submittingRef.current = null
      }
    })()
  }

  const statusLabel =
    saveStatus === "error" ? "Save failed" : hasUnsavedChanges || saveStatus === "saving" ? "Saving" : "Saved"
  const success = successCopy(successPart)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-neutral-950">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight">Your essay</h2>
          <p className="truncate text-xs text-neutral-500">Submit initial thoughts first. Each part locks after you submit it.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                saveStatus === "error" ? "bg-neutral-400" : hasUnsavedChanges ? "bg-neutral-400" : "bg-neutral-950"
              }`}
            />
            {statusLabel}
          </span>
        </div>
      </header>
      {submitError && <p className="shrink-0 px-4 pt-2 text-xs font-medium text-red-600">{submitError}</p>}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
        <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-900/15 bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-950 text-[10px] font-bold text-white">
              1
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold">Initial thoughts</h3>
              <p className="truncate text-[11px] text-neutral-500">
                {thoughtsLocked ? "Submitted. This part can no longer be changed." : "Write this first, then submit it once."}
              </p>
            </div>
            <PartHistoryButton part="thoughts" count={thoughtsHistoryCount} onClick={() => openPartHistory("thoughts")} />
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
              {wordCount(structuredContent.part1_concept1)} words
            </span>
            {thoughtsLocked ? (
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">
                Submitted
              </span>
            ) : (
              <Button
                type="button"
                onClick={() => void handleSubmitPart("thoughts")}
                disabled={!thoughtsEditable}
                className="h-7 shrink-0 rounded-lg bg-neutral-950 px-2.5 text-[11px] font-semibold text-white hover:bg-neutral-800"
              >
                Submit
              </Button>
            )}
          </div>
          <Textarea
            value={structuredContent.part1_concept1}
            onChange={(event) => updateField("part1_concept1", event.target.value)}
            readOnly={!thoughtsEditable}
            placeholder="Set out the question, then sketch the case for regulation and the case against it."
            className={`h-0 min-h-0 flex-1 basis-0 resize-none rounded-none border-0 px-3 py-2 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 ${
              thoughtsEditable ? "bg-white" : "bg-neutral-50 text-neutral-700"
            }`}
          />
        </article>

        <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-900/15 bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-950 text-[10px] font-bold">
              2
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold">Individual Reflection: New insights and supplementary points</h3>
              <p className="truncate text-[11px] text-neutral-500">
                {insightsLocked
                  ? "Submitted. This part can no longer be changed."
                  : insightsEditable
                    ? "What did the discussion change? Mark where ideas came from."
                    : showPart2Loading
                      ? "Loading your note…"
                      : "Opens after you submit your initial thoughts."}
              </p>
            </div>
            {(showPart2Editor || showPart2Loading) && (
              <PartHistoryButton part="insights" count={insightsHistoryCount} onClick={() => openPartHistory("insights")} />
            )}
            {showPart2Editor && (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
                {wordCount(structuredContent.part1_concept2)} words
              </span>
            )}
            {insightsLocked ? (
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">
                Submitted
              </span>
            ) : insightsEditable ? (
              <Button
                type="button"
                onClick={() => void handleSubmitPart("insights")}
                className="h-7 shrink-0 rounded-lg bg-neutral-950 px-2.5 text-[11px] font-semibold text-white hover:bg-neutral-800"
              >
                Submit
              </Button>
            ) : null}
          </div>
          {insightsEditable && (
            <div className="shrink-0 border-b border-neutral-100 px-3 py-1.5">
              <InspiredByButton
                groupMembers={groupMembers}
                onSelect={(name) => addInspiration("part1_concept2", name)}
              />
            </div>
          )}
          {showPart2Editor ? (
            <Textarea
              value={structuredContent.part1_concept2}
              onChange={(event) => updateField("part1_concept2", event.target.value)}
              readOnly={!insightsEditable}
              placeholder="What did the conversation add? Which claim still feels thin?"
              className={`h-0 min-h-0 flex-1 basis-0 resize-none rounded-none border-0 px-3 py-2 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 ${
                insightsEditable ? "bg-neutral-50" : "bg-neutral-50 text-neutral-700"
              }`}
            />
          ) : showPart2Loading ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-neutral-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-neutral-500">Loading your note…</p>
            </div>
          ) : showPart2Block ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden bg-white px-4 py-3 text-center">
              <div className="relative h-[min(220px,58%)] min-h-[140px] w-full max-w-[320px] flex-1">
                <Image
                  src={blockFigure}
                  alt="This part is currently blocked"
                  fill
                  sizes="320px"
                  className="object-contain"
                />
              </div>
              <p className="max-w-sm shrink-0 text-sm font-medium leading-6 text-neutral-600">
                Write and submit your initial thoughts first. This part opens after that submission.
              </p>
            </div>
          ) : null}
        </article>
      </div>

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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {success.partLabel}
              </p>
              <DialogTitle className="text-base font-bold tracking-tight text-slate-900">
                {success.title}
              </DialogTitle>
              <DialogDescription className="max-w-xs text-sm leading-6 text-slate-500">
                {success.body}
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
        open={historyPart !== null}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryPart(null)
            setSelectedSubmission(null)
          }
        }}
      >
        <DialogContent className="max-h-[min(36rem,calc(100dvh-2.5rem))] max-w-lg gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
                {selectedSubmission
                  ? "Previous submission"
                  : historyPart
                    ? partTitle(historyPart)
                    : "Previous submissions"}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">
                {selectedSubmission
                  ? submittedAt(selectedSubmission.createdAt)
                  : "Each submit is kept for this part only. Opening one does not change what you are writing now."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[min(24rem,calc(100dvh-12rem))] overflow-y-auto px-5 py-4">
            {selectedSubmission && historyPart ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {partTitle(historyPart)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {(historyPart === "thoughts" ? selectedSubmission.concept1 : selectedSubmission.concept2) ||
                    "Nothing written."}
                </p>
              </div>
            ) : historySubmissions.length === 0 ? (
              <p className="text-sm text-slate-500">You have not submitted this part yet.</p>
            ) : (
              <ul className="space-y-2">
                {historySubmissions.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSubmission(item)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <span className="text-sm font-semibold text-slate-900">
                        Submission {historySubmissions.length - index}
                      </span>
                      <span className="text-xs font-medium text-slate-500">{submittedAt(item.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selectedSubmission && (
            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                All submissions
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
