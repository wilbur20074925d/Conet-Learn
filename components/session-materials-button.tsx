"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import Image from "next/image"
import {
  BookOpen,
  ExternalLink,
  FileText,
  Link2,
  ListChecks,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import materialsIllustration from "@/components/figure/meterials.png"
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
    <div className="space-y-2">
      {blocks.map((block, index) => (
        <div
          key={index}
          className="relative rounded-xl border border-neutral-100 bg-neutral-50/80 px-3 py-2.5 pl-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-neutral-900"
        >
          <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-800">{block}</p>
        </div>
      ))}
    </div>
  )
}

function SectionHeading({
  icon: Icon,
  title,
  badge,
}: {
  icon: typeof ListChecks
  title: string
  badge?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
          <Icon className="h-3.5 w-3.5 text-neutral-900" strokeWidth={2} aria-hidden />
        </span>
        <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-neutral-600">{title}</h3>
      </div>
      {badge ? (
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-neutral-400">{badge}</span>
      ) : null}
    </div>
  )
}

function MaterialsBriefPanel({
  entered,
  hasInstructions,
  hasMaterials,
  materialCount,
  instructions,
  materials,
}: {
  entered: boolean
  hasInstructions: boolean
  hasMaterials: boolean
  materialCount: number
  instructions: string
  materials: SessionMaterial[]
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm",
        entered && "animate-welcome-fade-up",
      )}
      style={entered ? { animationDelay: "180ms" } : undefined}
    >
      <div className="px-3.5 py-3 sm:px-4">
        <SectionHeading icon={ListChecks} title="Instructions" />
        <div className="mt-2">
          {hasInstructions ? (
            <InstructionCopy text={instructions} />
          ) : (
            <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-3 text-center text-xs text-neutral-500">
              No instructions for this session.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-100 px-3.5 py-3 sm:px-4">
        <SectionHeading
          icon={BookOpen}
          title="Related materials"
          badge={materialCount > 0 ? String(materialCount) : undefined}
        />
        <div className="mt-2">
          {hasMaterials ? (
            <div className="space-y-2">
              {materials.map((item, index) => (
                <MaterialCard key={item.id} item={item} index={index} entered={entered} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-3 text-center text-xs text-neutral-500">
              No related materials yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function MaterialsGridBackdrop({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 opacity-[0.4]", className)}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
      aria-hidden
    />
  )
}

function MaterialsIllustration({ compact = false, animate = false }: { compact?: boolean; animate?: boolean }) {
  return (
    <div
      className={cn(
        "relative mx-auto",
        compact ? "max-w-[72px]" : "max-w-[88px]",
        animate && "animate-welcome-float",
      )}
    >
      <Image
        src={materialsIllustration}
        alt=""
        className="h-auto w-full grayscale contrast-[1.06] brightness-[1.02]"
        priority={!compact}
      />
    </div>
  )
}

function MaterialCard({
  item,
  index,
  entered,
}: {
  item: SessionMaterial
  index: number
  entered: boolean
}) {
  const href = safeHref(item.url)
  const [expanded, setExpanded] = useState(false)
  const hasNote = Boolean(item.note?.trim())

  return (
    <article
      className={cn(
        "group flex items-start gap-2.5 rounded-xl border border-neutral-100 bg-neutral-50/50 p-2.5 transition-colors hover:border-neutral-300 hover:bg-white",
        entered && "animate-welcome-fade-up",
      )}
      style={entered ? { animationDelay: `${220 + index * 50}ms` } : undefined}
    >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-[11px] font-bold tabular-nums text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" strokeWidth={2} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug tracking-tight text-neutral-950">{item.title}</p>
              {item.fileName && !href && (
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">{item.fileName}</p>
              )}
              {hasNote && (
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="mt-1 text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 hover:underline"
                >
                  {expanded ? "Hide note" : "Note"}
                </button>
              )}
              {hasNote && expanded && (
                <p className="mt-1.5 text-xs leading-5 text-neutral-600">{item.note}</p>
              )}
            </div>
          </div>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-800 transition hover:border-neutral-950 hover:bg-neutral-950 hover:text-white"
            >
              <span className="truncate">{item.fileName ? item.fileName : "Open"}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
            </a>
          )}
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
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

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
  const hasInstructions = Boolean(brief.instructions.trim())
  const hasMaterials = brief.materials.length > 0
  const materialCount = brief.materials.length

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
            ? "border-neutral-950 bg-neutral-950 text-white"
            : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"
        )}
      >
        <BookOpen className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4 transition duration-200 group-hover:-rotate-6")} />
        {compact ? "Materials" : "Session Materials"}
        {loaded && hasContent && !open && (
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-950 animate-pulse" />
        )}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setEditing(false)
        }}
      >
        <DialogContent
          className={cn(
            "flex max-h-[calc(100dvh-1.25rem)] w-[calc(100%-1.5rem)] max-w-xl flex-col gap-0 overflow-y-auto rounded-2xl border-neutral-200 bg-white p-0 shadow-[0_28px_70px_-32px_rgba(0,0,0,0.45)]",
            "[&>button]:z-20 [&>button]:rounded-full [&>button]:border [&>button]:border-neutral-200 [&>button]:bg-white [&>button]:text-neutral-900 [&>button]:shadow-sm [&>button]:transition-transform [&>button]:hover:scale-105",
          )}
        >
          <div className="flex flex-col">
            <div className="relative shrink-0 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 pr-11">
              <div className="relative z-10 flex items-start gap-3">
                <MaterialsIllustration compact animate={entered} />
                <DialogHeader className="min-w-0 flex-1 space-y-0.5 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                    Session materials
                  </p>
                  <DialogTitle className="text-balance text-lg font-bold leading-tight tracking-tight text-neutral-950">
                    {editing ? "Edit session materials" : heading}
                  </DialogTitle>
                  <DialogDescription className="text-xs leading-snug text-neutral-500">
                    {editing
                      ? "Students see this as soon as you save."
                      : updatedLabel
                        ? `Updated ${updatedLabel}`
                        : "Instructions and files below."}
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            <div className="px-4 py-3 sm:px-4 sm:py-3">
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
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50" />
                <div className="h-12 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50" />
              </div>
            ) : error && !hasContent ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>
            ) : !hasContent ? (
              <div
                className={cn(
                  "relative overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-3 py-5 text-center",
                  entered && "animate-welcome-fade-up",
                )}
              >
                <MaterialsGridBackdrop className="opacity-25" />
                <div className="relative z-10">
                  <MaterialsIllustration compact animate={entered} />
                  <p className="mt-4 text-sm font-semibold text-neutral-900">Nothing posted yet</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-neutral-500">
                    {canEdit
                      ? "Add the instructions and materials students should use in this session."
                      : "Your teacher has not posted instructions for this session yet."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <MaterialsBriefPanel
                  entered={entered}
                  hasInstructions={hasInstructions}
                  hasMaterials={hasMaterials}
                  materialCount={materialCount}
                  instructions={brief.instructions}
                  materials={brief.materials}
                />
                {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
              </>
            )}
            </div>

            {canEdit && !needsSetup && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 bg-white px-4 py-2.5">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      setError("")
                    }}
                    className="h-9 rounded-xl px-3 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="session-materials-form"
                    disabled={pending}
                    className="group relative h-9 overflow-hidden rounded-xl border border-neutral-950 bg-neutral-950 px-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
                  >
                    <span
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:animate-welcome-shimmer group-hover:opacity-100"
                      style={{
                        background:
                          "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
                        backgroundSize: "200% 100%",
                      }}
                      aria-hidden
                    />
                    <span className="relative">{pending ? "Saving..." : "Save"}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="group inline-flex h-9 items-center gap-1.5 rounded-xl border border-neutral-950 bg-neutral-950 px-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  <Pencil className="h-3.5 w-3.5 transition group-hover:-rotate-6" />
                  Edit
                </button>
              )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
