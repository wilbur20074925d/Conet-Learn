"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Search, UserMinus, UserPlus, Users } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type ManageStudent = { id: string; name: string }

type Page = "add" | "remove"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ManageStudentsDialog({
  title,
  description,
  available,
  enrolled,
  onAdd,
  onMoveOut,
}: {
  title: string
  description: string
  available: ManageStudent[]
  enrolled: ManageStudent[]
  onAdd: (students: ManageStudent[]) => void
  onMoveOut: (students: ManageStudent[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<Page>("add")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  function resetState() {
    setPage("add")
    setQuery("")
    setSelected(new Set())
  }

  function openDialog() {
    resetState()
    setOpen(true)
  }

  function closeDialog() {
    setOpen(false)
    resetState()
  }

  function switchPage(next: Page) {
    setPage(next)
    setQuery("")
    setSelected(new Set())
  }

  const activeList = page === "add" ? available : enrolled

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activeList
    return activeList.filter((student) => student.name.toLowerCase().includes(q))
  }, [activeList, query])

  const filteredIds = useMemo(() => new Set(filtered.map((s) => s.id)), [filtered])
  const selectedInView = [...selected].filter((id) => filteredIds.has(id)).length
  const allInViewSelected = filtered.length > 0 && selectedInView === filtered.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllInView() {
    if (allInViewSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of filteredIds) next.delete(id)
        return next
      })
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of filteredIds) next.add(id)
      return next
    })
  }

  function chosen(ids: Set<string>, source: ManageStudent[]) {
    return source.filter((student) => ids.has(student.id))
  }

  function confirmAction() {
    if (selected.size === 0) return
    if (page === "add") {
      onAdd(chosen(selected, available))
    } else {
      onMoveOut(chosen(selected, enrolled))
    }
    closeDialog()
  }

  const totalEnrolled = enrolled.length
  const triggerLabel = totalEnrolled > 0 ? `Students (${totalEnrolled})` : "Students"

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        <Users className="h-3.5 w-3.5 text-slate-500" />
        {triggerLabel}
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : closeDialog())}>
        <DialogContent className="flex max-h-[min(88vh,640px)] max-w-md flex-col gap-0 overflow-hidden border-slate-200 p-0 sm:rounded-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-4 pr-12 text-left">
            <DialogTitle className="text-base font-bold leading-snug text-slate-900">{title}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-slate-500">{description}</DialogDescription>
          </DialogHeader>

          <nav className="flex shrink-0 gap-1 border-b border-slate-100 bg-white px-3 py-2">
            <TabButton
              active={page === "add"}
              onClick={() => switchPage("add")}
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label="Add in"
              count={available.length}
              tone="add"
            />
            <TabButton
              active={page === "remove"}
              onClick={() => switchPage("remove")}
              icon={<UserMinus className="h-3.5 w-3.5" />}
              label="Move out"
              count={enrolled.length}
              tone="remove"
            />
          </nav>

          <div className="shrink-0 px-4 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={page === "add" ? "Search students to add…" : "Search enrolled students…"}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-500/15"
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {page === "add"
                ? "Students you can place here from the parent list."
                : "Removing students here does not delete their account."}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {activeList.length === 0 ? (
              <EmptyState
                page={page}
                message={page === "add" ? "Everyone eligible is already here." : "No students here yet."}
              />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No matches for &ldquo;{query.trim()}&rdquo;</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                  <button
                    type="button"
                    onClick={toggleAllInView}
                    className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                  >
                    {allInViewSelected ? "Clear selection" : `Select all (${filtered.length})`}
                  </button>
                  {selectedInView > 0 && (
                    <span className="text-[11px] font-medium text-slate-500">{selectedInView} selected</span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {filtered.map((student) => {
                    const isSelected = selected.has(student.id)
                    return (
                      <li key={student.id}>
                        <button
                          type="button"
                          onClick={() => toggle(student.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition duration-150",
                            isSelected
                              ? page === "remove"
                                ? "border-red-200 bg-red-50/90 shadow-sm"
                                : "border-sky-200 bg-sky-50/90 shadow-sm"
                              : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                              isSelected
                                ? page === "remove"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-sky-100 text-sky-900"
                                : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {initials(student.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{student.name}</span>
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold transition",
                              isSelected
                                ? page === "remove"
                                  ? "border-red-500 bg-red-500 text-white"
                                  : "border-sky-600 bg-sky-600 text-white"
                                : "border-slate-300 bg-white text-transparent"
                            )}
                            aria-hidden
                          >
                            ✓
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-4 py-3">
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={confirmAction}
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40",
                page === "remove" ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"
              )}
            >
              {page === "add" ? <UserPlus className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
              {page === "add"
                ? selected.size === 0
                  ? "Add selected students"
                  : `Add ${selected.size} student${selected.size === 1 ? "" : "s"}`
                : selected.size === 0
                  ? "Move out selected"
                  : `Move out ${selected.size} student${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  tone,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  count: number
  tone: "add" | "remove"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition",
        active
          ? tone === "remove"
            ? "bg-red-600 text-white shadow-sm"
            : "bg-slate-900 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100"
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
          active ? "bg-white/20 text-inherit" : "bg-slate-200/80 text-slate-600"
        )}
      >
        {count}
      </span>
    </button>
  )
}

function EmptyState({ page, message }: { page: Page; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
      <div
        className={cn(
          "mb-3 flex h-12 w-12 items-center justify-center rounded-2xl",
          page === "add" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"
        )}
      >
        {page === "add" ? <UserPlus className="h-6 w-6" /> : <UserMinus className="h-6 w-6" />}
      </div>
      <p className="text-sm font-medium text-slate-800">{message}</p>
    </div>
  )
}
