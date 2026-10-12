"use client"

import { useEffect, useRef, useState } from "react"
import { History } from "lucide-react"
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

type PastSubmission = {
  id: string
  concept1: string
  concept2: string
  createdAt: string
}

function localKey(groupId: string) {
  return `conet-in-class-essay:${groupId}`
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [successOpen, setSuccessOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [submissions, setSubmissions] = useState<PastSubmission[]>([])
  const [selectedSubmission, setSelectedSubmission] = useState<PastSubmission | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydrated = useRef(false)
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
    setStructuredContent((prev) => {
      const next = { ...prev, [field]: value }
      debouncedSnapshotSave(next)
      return next
    })
  }

  function addInspiration(field: keyof StructuredContent, name: string) {
    const note = `(inspired by ${name})`
    const current = structuredContent[field] || ""
    updateField(field, current ? `${current} ${note}` : note)
  }

  async function refreshSubmissions() {
    const result = await listMyNoteSubmissions(groupId)
    if (!result.error) setSubmissions(result.submissions)
  }

  useEffect(() => {
    void refreshSubmissions()
  }, [groupId])

  async function handleSubmitFinal() {
    setIsSubmitting(true)
    setSubmitError("")
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const stamped = { ...structuredContent, savedAt: new Date().toISOString() }
    const payload = toPayload(stamped)
    try {
      window.localStorage.setItem(localKey(groupId), payload)
    } catch {
      // The server copy is the one that is submitted.
    }
    const result = await submitFinalDocument(groupId, payload)
    setIsSubmitting(false)
    if ("error" in result) {
      setSubmitError(result.error)
      return
    }
    setStructuredContent(stamped)
    setSaveStatus("saved")
    setHasUnsavedChanges(false)
    setSubmissions((current) => [result.submission, ...current.filter((item) => item.id !== result.submission.id)])
    setSuccessOpen(true)
  }

  const statusLabel =
    saveStatus === "error" ? "Save failed" : hasUnsavedChanges || saveStatus === "saving" ? "Saving" : "Saved"

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-neutral-950">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight">Your essay</h2>
          <p className="truncate text-xs text-neutral-500">Your writing stays here. Submit again whenever you want.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Previous submissions"
            title="Previous submissions"
            onClick={() => {
              setSelectedSubmission(null)
              setHistoryOpen(true)
              void refreshSubmissions()
            }}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
          >
            <History className="h-3.5 w-3.5" />
            {submissions.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-950 px-1 text-[9px] font-semibold leading-none text-white">
                {submissions.length}
              </span>
            )}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                saveStatus === "error" ? "bg-neutral-400" : hasUnsavedChanges ? "bg-neutral-400" : "bg-neutral-950"
              }`}
            />
            {statusLabel}
          </span>
          <Button
            type="button"
            onClick={handleSubmitFinal}
            disabled={isSubmitting}
            className="h-8 rounded-lg bg-neutral-950 px-3.5 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
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
                Your initial thoughts on the given question
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
              {wordCount(structuredContent.part1_concept1)} words
            </span>
          </div>
          <Textarea
            value={structuredContent.part1_concept1}
            onChange={(event) => updateField("part1_concept1", event.target.value)}
            placeholder="Set out the question, then sketch the case for regulation and the case against it."
            className="h-0 min-h-0 flex-1 basis-0 resize-none rounded-none border-0 bg-white px-3 py-2 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </article>

        <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-900/15 bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-950 text-[10px] font-bold">
              2
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold">New insights and supplementary points</h3>
              <p className="truncate text-[11px] text-neutral-500">
                What did the discussion change? Mark where ideas came from.
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
              {wordCount(structuredContent.part1_concept2)} words
            </span>
          </div>
          <div className="shrink-0 border-b border-neutral-100 px-3 py-1.5">
            <InspiredByButton
              groupMembers={groupMembers}
              onSelect={(name) => addInspiration("part1_concept2", name)}
            />
          </div>
          <Textarea
            value={structuredContent.part1_concept2}
            onChange={(event) => updateField("part1_concept2", event.target.value)}
            placeholder="What did the conversation add? Which claim still feels thin?"
            className="h-0 min-h-0 flex-1 basis-0 resize-none rounded-none border-0 bg-neutral-50 px-3 py-2 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </article>
      </div>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">Submitted successfully</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">
                Your note was submitted. The writing stays on this page, so you can keep editing and submit again.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end px-5 py-4">
            <button
              type="button"
              onClick={() => setSuccessOpen(false)}
              className="h-9 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
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
          if (!open) setSelectedSubmission(null)
        }}
      >
        <DialogContent className="max-h-[min(36rem,calc(100dvh-2.5rem))] max-w-lg gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
                {selectedSubmission ? "Previous submission" : "Previous submissions"}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">
                {selectedSubmission
                  ? submittedAt(selectedSubmission.createdAt)
                  : "Each submit is kept. Opening one does not change what you are writing now."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[min(24rem,calc(100dvh-12rem))] overflow-y-auto px-5 py-4">
            {selectedSubmission ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Initial thoughts</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {selectedSubmission.concept1 || "Nothing written."}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    New insights and supplementary points
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {selectedSubmission.concept2 || "Nothing written."}
                  </p>
                </div>
              </div>
            ) : submissions.length === 0 ? (
              <p className="text-sm text-slate-500">You have not submitted this note yet.</p>
            ) : (
              <ul className="space-y-2">
                {submissions.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSubmission(item)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <span className="text-sm font-semibold text-slate-900">Submission {submissions.length - index}</span>
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
