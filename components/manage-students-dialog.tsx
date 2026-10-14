"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Filter, Search, UserMinus, UserPlus, Users } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type ManageStudent = {
  id: string
  name: string
  email?: string | null
  username?: string | null
  studentId?: string | null
  /** Current class/course enrollment label for filtering and display */
  courseName?: string | null
}

type Page = "add" | "remove"
type CourseFilter = "all" | "unassigned" | "in-this-course" | "in-other-course"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function matchesQuery(student: ManageStudent, q: string) {
  const haystack = [
    student.name,
    student.email ?? "",
    student.username ?? "",
    student.studentId ?? "",
    student.courseName ?? "",
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(q)
}

export default function ManageStudentsDialog({
  title,
  description,
  available,
  enrolled,
  onAdd,
  onMoveOut,
  currentCourseId,
  currentCourseName,
  courseOptions = [],
  context = "class",
  isRowSelectable,
  compactTrigger = false,
}: {
  title: string
  description: string
  available: ManageStudent[]
  enrolled: ManageStudent[]
  onAdd: (students: ManageStudent[]) => void
  onMoveOut: (students: ManageStudent[]) => void
  /** Class (course) this dialog manages — used for course filters */
  currentCourseId?: string
  currentCourseName?: string
  courseOptions?: { id: string; name: string }[]
  context?: "class" | "session" | "group"
  /** When false, row is visible (e.g. for course filters) but cannot be selected */
  isRowSelectable?: (student: ManageStudent) => boolean
  compactTrigger?: boolean
}) {
  const canSelect = isRowSelectable ?? (() => true)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<Page>("add")
  const [query, setQuery] = useState("")
  const [courseFilter, setCourseFilter] = useState<CourseFilter>("all")
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  function resetState() {
    setPage("add")
    setQuery("")
    setCourseFilter("all")
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
    setCourseFilter("all")
    setSelected(new Set())
  }

  const activeList = page === "add" ? available : enrolled

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeList.filter((student) => {
      if (q && !matchesQuery(student, q)) return false

      if (context === "class" && page === "add" && courseFilter !== "all") {
        const inThis = student.courseName === currentCourseName
        const unassigned = !student.courseName
        if (courseFilter === "unassigned" && !unassigned) return false
        if (courseFilter === "in-this-course" && !inThis) return false
        if (courseFilter === "in-other-course" && (unassigned || inThis)) return false
      }

      if (context === "class" && page === "remove" && courseFilter === "in-this-course") {
        if (student.courseName !== currentCourseName) return false
      }

      return true
    })
  }, [activeList, query, courseFilter, context, page, currentCourseName])

  const filteredIds = useMemo(() => new Set(filtered.map((s) => s.id)), [filtered])
  const selectedInView = [...selected].filter((id) => filteredIds.has(id)).length
  const allInViewSelected = filtered.length > 0 && selectedInView === filtered.length

  function toggle(id: string) {
    const student = activeList.find((item) => item.id === id)
    if (student && !canSelect(student)) return
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
      for (const id of filteredIds) {
        const student = activeList.find((item) => item.id === id)
        if (student && canSelect(student)) next.add(id)
      }
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

  const showCourseFilter = context === "class" && courseOptions.length > 0

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={cn(
          "inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white font-semibold text-neutral-800 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50",
          compactTrigger ? "h-7 px-2 text-[11px]" : "h-9 rounded-xl px-3 text-xs",
        )}
      >
        <Users className={cn("text-neutral-500", compactTrigger ? "h-3 w-3" : "h-3.5 w-3.5")} />
        {triggerLabel}
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : closeDialog())}>
        <DialogContent className="flex max-h-[min(92vh,860px)] w-[min(100vw-2rem,56rem)] max-w-none flex-col gap-0 overflow-hidden border-slate-200 p-0 sm:rounded-2xl">
          <DialogHeader className="shrink-0 space-y-2 border-b border-slate-200 bg-white px-6 py-5 pr-12 text-left">
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{title}</DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-relaxed text-slate-500">{description}</DialogDescription>
            {currentCourseName && (
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Course · {currentCourseName}
              </p>
            )}
          </DialogHeader>

          <nav className="flex shrink-0 gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <TabButton
              active={page === "add"}
              onClick={() => switchPage("add")}
              icon={<UserPlus className="h-4 w-4" />}
              label="Add in"
              count={available.length}
              tone="add"
            />
            <TabButton
              active={page === "remove"}
              onClick={() => switchPage("remove")}
              icon={<UserMinus className="h-4 w-4" />}
              label="Move out"
              count={enrolled.length}
              tone="remove"
            />
          </nav>

          <div className="shrink-0 space-y-3 border-b border-slate-100 bg-white px-6 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, username, or student ID…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showCourseFilter && (
                <label className="inline-flex min-w-[12rem] flex-1 items-center gap-2 sm:flex-none sm:min-w-[14rem]">
                  <Filter className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <select
                    value={courseFilter}
                    onChange={(e) => setCourseFilter(e.target.value as CourseFilter)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800"
                  >
                    <option value="all">All students in list</option>
                    {page === "add" && (
                      <>
                        <option value="unassigned">Not in any course</option>
                        <option value="in-other-course">In another course</option>
                      </>
                    )}
                    <option value="in-this-course">In this course only</option>
                  </select>
                </label>
              )}
              <p className="text-xs text-slate-500">
                {page === "add"
                  ? "Pick students to place here. Accounts are not deleted when you move someone out."
                  : "Removing students here does not delete their login."}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {activeList.length === 0 ? (
              <EmptyState
                page={page}
                message={page === "add" ? "Everyone eligible is already here." : "No students here yet."}
              />
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">
                No matches{query.trim() ? ` for “${query.trim()}”` : " with this filter"}.
              </p>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={toggleAllInView}
                    className="text-xs font-semibold text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                  >
                    {allInViewSelected ? "Clear selection" : `Select all (${filtered.length})`}
                  </button>
                  <span className="text-xs font-medium text-slate-500">
                    {selectedInView} selected · {filtered.length} shown
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-10 px-3 py-3" aria-label="Select" />
                        <th className="px-3 py-3">Student</th>
                        <th className="hidden px-3 py-3 sm:table-cell">Email</th>
                        <th className="hidden px-3 py-3 md:table-cell">Username</th>
                        <th className="hidden px-3 py-3 lg:table-cell">Student ID</th>
                        {showCourseFilter && <th className="px-3 py-3">Course</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filtered.map((student) => {
                        const isSelected = selected.has(student.id)
                        const selectable = canSelect(student)
                        return (
                          <tr
                            key={student.id}
                            className={cn(
                              "transition",
                              selectable ? "cursor-pointer hover:bg-slate-50/90" : "cursor-not-allowed opacity-55",
                              isSelected && (page === "remove" ? "bg-red-50/50" : "bg-slate-50")
                            )}
                            onClick={() => toggle(student.id)}
                          >
                            <td className="px-3 py-3 align-middle">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!selectable}
                                onChange={() => toggle(student.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select ${student.name}`}
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:opacity-40"
                              />
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                  {initials(student.name)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-slate-900">{student.name}</p>
                                  <p className="truncate text-xs text-slate-500 sm:hidden">{student.email || "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="hidden max-w-[14rem] truncate px-3 py-3 align-middle font-mono text-xs text-slate-600 sm:table-cell">
                              {student.email || "—"}
                            </td>
                            <td className="hidden px-3 py-3 align-middle font-mono text-xs text-slate-600 md:table-cell">
                              {student.username || "—"}
                            </td>
                            <td className="hidden px-3 py-3 align-middle font-mono text-xs text-slate-600 lg:table-cell">
                              {student.studentId || "—"}
                            </td>
                            {showCourseFilter && (
                              <td className="px-3 py-3 align-middle text-xs text-slate-600">
                                {student.courseName ? (
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full px-2 py-0.5 font-medium",
                                      student.courseName === currentCourseName
                                        ? "bg-slate-900 text-white"
                                        : "bg-slate-100 text-slate-700"
                                    )}
                                  >
                                    {student.courseName}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Not placed</span>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={confirmAction}
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40",
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
        "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition",
        active
          ? tone === "remove"
            ? "bg-red-600 text-white shadow-sm"
            : "bg-slate-900 text-white shadow-sm"
          : "text-slate-600 hover:bg-white"
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
        {page === "add" ? <UserPlus className="h-6 w-6" /> : <UserMinus className="h-6 w-6" />}
      </div>
      <p className="text-sm font-medium text-slate-800">{message}</p>
    </div>
  )
}
