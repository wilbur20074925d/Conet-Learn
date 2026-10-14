"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { Download, FileArchive, FileSpreadsheet, MessageSquare, SlidersHorizontal } from "lucide-react"
import exportDataIllustration from "@/components/figure/Export Data.png"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CatalogClass, CatalogGroup } from "@/lib/catalog"
import { cn } from "@/lib/utils"

type ExportKind = "chat" | "submissions"

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
}

const TAB_COPY: Record<
  ExportKind,
  { title: string; hint: string; bullets: string[] }
> = {
  chat: {
    title: "Chat messages",
    hint: "CSV inside the ZIP — one file per group plus a combined sheet.",
    bullets: [
      "AI mode tags (Nate / Remy / Off)",
      "Who each message was for (AI, a student, or the whole group)",
      "Full message text and reply context",
    ],
  },
  submissions: {
    title: "Submissions & docs",
    hint: "CSV inside the ZIP — notes, group posts, and who wrote each part.",
    bullets: [
      "Individual notes (drafts and each submit)",
      "Every version of the group post",
      "Authored sections per student per version",
    ],
  },
}

function FilterCheckbox({
  checked,
  onCheckedChange,
  label,
  sublabel,
}: {
  checked: boolean
  onCheckedChange: () => void
  label: string
  sublabel?: string
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition",
        checked ? "border-slate-900/15 bg-white shadow-sm" : "border-transparent bg-white/60 hover:bg-white"
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {sublabel ? <span className="mt-0.5 block text-xs text-slate-500">{sublabel}</span> : null}
      </span>
    </label>
  )
}

export default function TeacherExportDataDialog({
  classes,
  looseGroups,
}: {
  classes: CatalogClass[]
  looseGroups: CatalogGroup[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<ExportKind>("chat")
  const [exportAll, setExportAll] = useState(true)
  const [classIds, setClassIds] = useState<string[]>([])
  const [sessionIds, setSessionIds] = useState<string[]>([])
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const sessions = useMemo(
    () =>
      classes.flatMap((classroom) =>
        classroom.sessions.map((session) => ({
          ...session,
          className: classroom.name,
        }))
      ),
    [classes]
  )

  const placedGroups = useMemo(
    () =>
      classes.flatMap((classroom) =>
        classroom.sessions.flatMap((session) =>
          session.groups.map((group) => ({
            ...group,
            className: classroom.name,
            sessionTitle: session.title,
          }))
        )
      ),
    [classes]
  )

  const selectionCount = exportAll
    ? "All classes, sessions, and groups"
    : [
        classIds.length ? `${classIds.length} class${classIds.length === 1 ? "" : "es"}` : null,
        sessionIds.length ? `${sessionIds.length} session${sessionIds.length === 1 ? "" : "s"}` : null,
        groupIds.length ? `${groupIds.length} group${groupIds.length === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Pick at least one filter below"

  async function download(kind: ExportKind) {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/teacher-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          exportAll,
          classIds,
          sessionIds,
          groupIds,
        }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        setError(payload?.error || "Export failed.")
        return
      }
      const blob = await response.blob()
      const disposition = response.headers.get("Content-Disposition") || ""
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] || `conet-${kind}-export.zip`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Export failed.")
    } finally {
      setBusy(false)
    }
  }

  function scopePanel(kind: ExportKind) {
    const copy = TAB_COPY[kind]
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              {kind === "chat" ? (
                <MessageSquare className="h-5 w-5" aria-hidden />
              ) : (
                <FileSpreadsheet className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{copy.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{copy.hint}</p>
              <ul className="mt-2.5 space-y-1">
                {copy.bullets.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Scope</p>
          </div>

          <button
            type="button"
            onClick={() => setExportAll(true)}
            className={cn(
              "w-full rounded-2xl border px-4 py-3 text-left transition",
              exportAll
                ? "border-slate-900 bg-slate-900 text-white shadow-md"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
            )}
          >
            <p className="text-sm font-semibold">Export everything</p>
            <p className={cn("mt-0.5 text-xs", exportAll ? "text-slate-300" : "text-slate-500")}>
              All classes, sessions, and groups in your dashboard
            </p>
          </button>

          <button
            type="button"
            onClick={() => setExportAll(false)}
            className={cn(
              "w-full rounded-2xl border px-4 py-3 text-left transition",
              !exportAll
                ? "border-slate-900 bg-white shadow-sm ring-1 ring-slate-900/10"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
            )}
          >
            <p className="text-sm font-semibold">Choose what to include</p>
            <p className="mt-0.5 text-xs text-slate-500">{selectionCount}</p>
          </button>
        </div>

        {!exportAll && (
          <ScrollArea className="h-52 rounded-2xl border border-slate-200 bg-slate-50/50">
            <div className="space-y-4 p-3">
              {classes.length > 0 && (
                <div>
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Classes</p>
                  <ul className="mt-1.5 space-y-1">
                    {classes.map((classroom) => (
                      <li key={classroom.id}>
                        <FilterCheckbox
                          checked={classIds.includes(classroom.id)}
                          onCheckedChange={() => setClassIds((current) => toggleId(current, classroom.id))}
                          label={classroom.name}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {sessions.length > 0 && (
                <div>
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Sessions</p>
                  <ul className="mt-1.5 space-y-1">
                    {sessions.map((session) => (
                      <li key={session.id}>
                        <FilterCheckbox
                          checked={sessionIds.includes(session.id)}
                          onCheckedChange={() => setSessionIds((current) => toggleId(current, session.id))}
                          label={session.title}
                          sublabel={session.className}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(placedGroups.length > 0 || looseGroups.length > 0) && (
                <div>
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Groups</p>
                  <ul className="mt-1.5 space-y-1">
                    {placedGroups.map((group) => (
                      <li key={group.id}>
                        <FilterCheckbox
                          checked={groupIds.includes(group.id)}
                          onCheckedChange={() => setGroupIds((current) => toggleId(current, group.id))}
                          label={group.name}
                          sublabel={`${group.className} · ${group.sessionTitle}`}
                        />
                      </li>
                    ))}
                    {looseGroups.map((group) => (
                      <li key={group.id}>
                        <FilterCheckbox
                          checked={groupIds.includes(group.id)}
                          onCheckedChange={() => setGroupIds((current) => toggleId(current, group.id))}
                          label={group.name}
                          sublabel="Not in a session"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
      >
        <FileArchive className="h-3.5 w-3.5" />
        Export data
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(92vh,720px)] max-w-xl gap-0 overflow-hidden rounded-3xl border-slate-200 p-0 sm:max-w-2xl">
          <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-slate-100/90">
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-slate-200/40 blur-3xl"
              aria-hidden
            />
            <div className="flex items-center gap-4 px-5 py-5 pr-12">
              <div className="relative shrink-0 self-center">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm">
                  <Image
                    src={exportDataIllustration}
                    alt=""
                    width={128}
                    height={96}
                    className="h-auto w-[108px] sm:w-[128px]"
                    priority
                  />
                </div>
              </div>
              <DialogHeader className="min-w-0 flex-1 space-y-1 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Teacher tools</p>
                <DialogTitle className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-xl">
                  Export data
                </DialogTitle>
                <DialogDescription className="text-sm leading-snug text-slate-500">
                  Download chat messages or student submissions as separate ZIP files. Filter by class, session, or
                  group—or export everything in one go.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as ExportKind)} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-slate-100 px-5 pt-4">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-slate-100/90 p-1">
                <TabsTrigger
                  value="chat"
                  className="gap-2 rounded-lg text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  Chat messages
                </TabsTrigger>
                <TabsTrigger
                  value="submissions"
                  className="gap-2 rounded-lg text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <FileSpreadsheet className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  Submissions
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="max-h-[min(52vh,420px)]">
              <div className="px-5 py-4">
                <TabsContent value="chat" className="mt-0 focus-visible:outline-none">
                  {scopePanel("chat")}
                </TabsContent>
                <TabsContent value="submissions" className="mt-0 focus-visible:outline-none">
                  {scopePanel("submissions")}
                </TabsContent>
              </div>
            </ScrollArea>

            <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void download(tab)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                {busy ? "Preparing ZIP…" : `Download ${tab === "chat" ? "chat" : "submissions"} ZIP`}
              </button>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
