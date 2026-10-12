"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { BookOpen, ExternalLink, Link2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { uploadSessionFile } from "@/lib/upload-session-file"
import { getSessionBrief, saveSessionBrief } from "@/lib/session-materials-actions"
import { EMPTY_SESSION_BRIEF, type SessionBrief, type SessionMaterial } from "@/lib/session-materials"
import { createClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

function safeHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : ""
}

function formatUpdated(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function InstructionCopy({ text }: { text: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <p key={index} className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {block}
        </p>
      ))}
    </div>
  )
}

function MaterialCard({ item, index }: { item: SessionMaterial; index: number }) {
  const href = safeHref(item.url)
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight text-slate-900">{item.title}</p>
          {item.note && <p className="mt-1 text-sm leading-6 text-slate-600">{item.note}</p>}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
            >
              {item.fileName ? item.fileName : "Open material"}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

export default function SessionMaterialsButton({
  role,
  sessionId = "current",
  compact = false,
}: {
  role: "teacher" | "student" | "ai"
  sessionId?: string
  compact?: boolean
}) {
  const canEdit = role === "teacher"
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState<SessionBrief>(EMPTY_SESSION_BRIEF)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SessionBrief>(EMPTY_SESSION_BRIEF)
  const [pending, setPending] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [needsSetup, setNeedsSetup] = useState(false)

  const refreshBrief = useCallback(async () => {
    const result = await getSessionBrief(sessionId)
    setLoaded(true)
    if (!result.ok) {
      setNeedsSetup(Boolean(result.needsSetup))
      setError(result.error)
      return
    }
    setNeedsSetup(false)
    setError("")
    setBrief(result.brief)
  }, [sessionId])

  useEffect(() => {
    void refreshBrief()
    const supabase = createClient()
    const channel = supabase
      .channel(`conet-session-brief-${sessionId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ConetSessionBrief", filter: `id=eq.${sessionId}` },
        () => {
          void refreshBrief()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refreshBrief])

  function startEdit() {
    setDraft({
      title: brief.title,
      instructions: brief.instructions,
      materials: brief.materials.map((item) => ({ ...item })),
      updatedAt: brief.updatedAt,
    })
    setError("")
    setEditing(true)
  }

  function updateMaterial(id: string, patch: Partial<SessionMaterial>) {
    setDraft((current) => ({
      ...current,
      materials: current.materials.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  function addMaterial() {
    setDraft((current) => ({
      ...current,
      materials: [...current.materials, { id: crypto.randomUUID(), title: "", url: "", note: "" }],
    }))
  }

  async function onUpload(id: string, file: File | undefined) {
    if (!file || uploadingId) return
    setUploadingId(id)
    setError("")
    const result = await uploadSessionFile(sessionId, file)
    setUploadingId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDraft((current) => ({
      ...current,
      materials: current.materials.map((item) =>
        item.id === id
          ? {
              ...item,
              url: result.url,
              fileName: result.fileName,
              title: item.title.trim() || result.fileName,
            }
          : item
      ),
    }))
  }

  function removeMaterial(id: string) {
    setDraft((current) => ({
      ...current,
      materials: current.materials.filter((item) => item.id !== id),
    }))
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const materials = draft.materials.filter(
      (item) => item.title.trim() || item.url.trim() || item.note.trim() || item.fileName
    )
    if (materials.some((item) => !item.title.trim())) {
      setError("Give each material a title, or remove the empty one.")
      return
    }
    setPending(true)
    setError("")
    const result = await saveSessionBrief({
      title: draft.title,
      instructions: draft.instructions,
      sessionId,
      materials,
    })
    setPending(false)
    if (!result.ok) {
      setNeedsSetup(Boolean(result.needsSetup))
      setError(result.error)
      return
    }
    setBrief(result.brief)
    setEditing(false)
  }

  const hasContent = Boolean(brief.title || brief.instructions || brief.materials.length)
  const updatedLabel = formatUpdated(brief.updatedAt)
  const heading = brief.title || "This session"

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setOpen(true)
          void refreshBrief()
        }}
        className={cn(
          "group inline-flex items-center gap-2 border font-semibold shadow-sm transition duration-200 active:scale-[0.98]",
          compact ? "h-8 rounded-lg px-2.5 text-xs" : "h-9 rounded-full px-3.5 text-sm hover:-translate-y-px hover:shadow-md",
          open
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
        )}
      >
        <BookOpen className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4 transition duration-200 group-hover:-rotate-6")} />
        {compact ? "Materials" : "Session Materials"}
        {loaded && hasContent && !open && <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setEditing(false)
        }}
      >
        <DialogContent className="max-h-[min(40rem,calc(100dvh-2.5rem))] gap-0 overflow-hidden rounded-3xl border-slate-200 bg-[#f7f8fa] p-0 shadow-2xl sm:max-w-[32rem]">
          <div className="border-b border-slate-200 bg-white px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Current session</p>
              <DialogTitle className="text-xl font-bold tracking-tight text-slate-950">
                {editing ? "Edit session materials" : heading}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                {editing
                  ? "Students see this as soon as you save."
                  : updatedLabel
                    ? `Updated ${updatedLabel}`
                    : "Instructions and files for this session."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="max-h-[min(30rem,calc(100dvh-11rem))] overflow-y-auto px-5 py-4">
            {needsSetup ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                {canEdit
                  ? "Session materials are not in the database yet. Run supabase/conet-session-materials.sql in the Supabase SQL editor, then refresh."
                  : "Your teacher has not posted session materials yet."}
              </p>
            ) : editing ? (
              <form id="session-materials-form" onSubmit={onSave} className="space-y-4">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Title</span>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    maxLength={120}
                    placeholder="For example, Week 3 seminar"
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Instructions
                  </span>
                  <textarea
                    value={draft.instructions}
                    onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
                    maxLength={8000}
                    rows={6}
                    placeholder="What should students do in this session?"
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  />
                </label>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Related materials
                    </span>
                    <button
                      type="button"
                      onClick={addMaterial}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                  {draft.materials.length === 0 && (
                    <p className="mt-2 text-sm text-slate-500">Add a reading, slide deck, or link.</p>
                  )}
                  <div className="mt-2 space-y-2">
                    {draft.materials.map((item, index) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Material {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMaterial(item.id)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove material ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <input
                          value={item.title}
                          onChange={(event) => updateMaterial(item.id, { title: event.target.value })}
                          maxLength={120}
                          placeholder="Title"
                          className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-slate-400"
                        />
                        <div className="relative mt-2">
                          <Link2 className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                          <input
                            value={item.url}
                            onChange={(event) => updateMaterial(item.id, { url: event.target.value })}
                            maxLength={500}
                            placeholder="https://"
                            className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-2.5 text-sm outline-none focus:border-slate-400"
                          />
                        </div>
                        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                          <Paperclip className="h-3.5 w-3.5" />
                          {uploadingId === item.id
                            ? "Uploading..."
                            : item.fileName
                              ? item.fileName
                              : "Upload a file"}
                          <input
                            type="file"
                            className="sr-only"
                            disabled={uploadingId !== null}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              event.target.value = ""
                              void onUpload(item.id, file)
                            }}
                          />
                        </label>
                        <textarea
                          value={item.note}
                          onChange={(event) => updateMaterial(item.id, { note: event.target.value })}
                          maxLength={400}
                          rows={2}
                          placeholder="Optional note"
                          className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-slate-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </form>
            ) : !loaded ? (
              <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-white" />
                <div className="h-16 animate-pulse rounded-2xl bg-white" />
              </div>
            ) : error && !hasContent ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>
            ) : !hasContent ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
                <BookOpen className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-3 text-sm font-semibold text-slate-800">Nothing posted yet</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {canEdit
                    ? "Add the instructions and materials students should use in this session."
                    : "Your teacher has not posted instructions for this session yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Instructions</h3>
                  {brief.instructions ? (
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                      <InstructionCopy text={brief.instructions} />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No instructions for this session.</p>
                  )}
                </section>
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Related materials
                  </h3>
                  {brief.materials.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {brief.materials.map((item, index) => (
                        <MaterialCard key={item.id} item={item} index={index} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No related materials yet.</p>
                  )}
                </section>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            )}
          </div>

          {canEdit && !needsSetup && (
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      setError("")
                    }}
                    className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="session-materials-form"
                    disabled={pending}
                    className="h-9 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {pending ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
