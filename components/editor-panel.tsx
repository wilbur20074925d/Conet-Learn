"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import InspiredByButton from "@/components/inspired-by-button"
import { saveDocumentSnapshot, submitFinalDocument } from "@/lib/actions"

type SaveStatus = "idle" | "saving" | "saved" | "error"

interface GroupMember {
  id: string
  name: string
  avatar_url?: string | null
}

interface StructuredContent {
  part1_concept1: string
  part1_concept2: string
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
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
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    if (!initialContent) return
    try {
      const parsed = JSON.parse(initialContent) as Record<string, string>
      if (parsed && typeof parsed === "object") {
        setStructuredContent({
          part1_concept1: parsed.part1_concept1 || parsed.field1 || "",
          part1_concept2: parsed.part1_concept2 || parsed.field2 || "",
        })
        return
      }
    } catch {
      setStructuredContent({ part1_concept1: initialContent, part1_concept2: "" })
    }
  }, [initialContent])

  function debouncedSnapshotSave(next: StructuredContent) {
    setHasUnsavedChanges(true)
    setSaveStatus("saving")
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const payload = JSON.stringify({
        field1: next.part1_concept1 || "",
        field2: next.part1_concept2 || "",
        part1_concept1: next.part1_concept1 || "",
        part1_concept2: next.part1_concept2 || "",
      })
      const result = await saveDocumentSnapshot(payload, groupId)
      if (result?.success) {
        setSaveStatus("saved")
        setHasUnsavedChanges(false)
      } else {
        setSaveStatus("error")
      }
    }, 2000)
  }

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

  async function handleSubmitFinal() {
    setIsSubmitting(true)
    setSubmitStatus("idle")
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      const payload = JSON.stringify({
        field1: structuredContent.part1_concept1 || "",
        field2: structuredContent.part1_concept2 || "",
        part1_concept1: structuredContent.part1_concept1 || "",
        part1_concept2: structuredContent.part1_concept2 || "",
      })
      await saveDocumentSnapshot(payload, groupId)
    }
    const result = await submitFinalDocument(groupId)
    setSubmitStatus(result.error ? "error" : "success")
    setIsSubmitting(false)
    if (!result.error) {
      setSaveStatus("saved")
      setHasUnsavedChanges(false)
      setTimeout(() => setSubmitStatus("idle"), 3000)
    }
  }

  const statusLabel =
    saveStatus === "error" ? "Save failed" : hasUnsavedChanges || saveStatus === "saving" ? "Saving" : "Saved"

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-neutral-950">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight">Your essay</h2>
          <p className="truncate text-xs text-neutral-500">Both parts stay on screen. Autosaves as you type.</p>
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
          <Button
            type="button"
            onClick={handleSubmitFinal}
            disabled={isSubmitting}
            className="h-8 rounded-lg bg-neutral-950 px-3.5 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            {isSubmitting
              ? "Submitting..."
              : submitStatus === "success"
                ? "Submitted"
                : submitStatus === "error"
                  ? "Try again"
                  : "Submit final"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
        <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-900/15 bg-white">
          <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-950 text-[10px] font-bold text-white">
              1
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold">Initial thoughts on both sides</h3>
              <p className="truncate text-[11px] text-neutral-500">
                Should generative AI in social media content be regulated?
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
    </section>
  )
}
