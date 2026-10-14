"use client"

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowRight, ChevronDown, Copy, Layers, Pencil, Plus, Trash2, Users } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import createIllustration from "@/components/figure/Create.png"
import { cn } from "@/lib/utils"
import NateModeSwitch from "@/components/nate-mode-switch"
import PendingLink from "@/components/pending-link"
import SessionArtwork, { artworkIndexes } from "@/components/session-artwork"
import ManageStudentsDialog, { type ManageStudent } from "@/components/manage-students-dialog"
import SessionMaterialsButton from "@/components/session-materials-button"
import TeacherExportDataDialog from "@/components/teacher-export-data-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  createClass,
  createClassSession,
  createSessionGroup,
  deleteClass,
  duplicateClass,
  duplicateClassSession,
  deleteClassSession,
  placeGroupInSession,
  placeStudentsInClass,
  placeStudentsInGroup,
  placeStudentsInSession,
  removeStudentFromClass,
  removeStudentFromSession,
  renameClass,
  renameClassSession,
  renameGroup,
} from "@/lib/class-actions"
import { deleteGroup, removeStudent } from "@/lib/classroom-actions"
import type { CatalogClass, CatalogGroup, CatalogSession, CatalogStudent } from "@/lib/catalog"

type Board = {
  classes: CatalogClass[]
  looseGroups: CatalogGroup[]
}

type BoardUpdate =
  | { type: "add-class"; classroom: CatalogClass }
  | { type: "rename-class"; id: string; name: string }
  | { type: "delete-class"; id: string }
  | { type: "add-session"; classId: string; session: CatalogSession }
  | { type: "rename-session"; id: string; title: string }
  | { type: "delete-session"; id: string }
  | { type: "duplicate-class"; classroom: CatalogClass }
  | { type: "add-group"; sessionId: string; group: CatalogGroup }
  | { type: "rename-group"; id: string; name: string }
  | { type: "delete-group"; id: string }
  | { type: "add-class-students"; classId: string; students: CatalogStudent[] }
  | { type: "add-session-students"; sessionId: string; students: CatalogStudent[] }
  | { type: "add-group-students"; sessionId: string; groupId: string; students: CatalogStudent[] }
  | { type: "remove-class-student"; classId: string; userId: string }
  | { type: "remove-class-students"; classId: string; userIds: string[] }
  | { type: "remove-session-student"; sessionId: string; userId: string }
  | { type: "remove-session-students"; sessionId: string; userIds: string[] }
  | { type: "remove-group-students"; groupId: string; userIds: string[] }
  | { type: "remove-member"; groupId: string; userId: string }
  | { type: "add-member"; groupId: string; member: { id: string; name: string; role: string } }
  | { type: "move-member"; fromGroupId: string; toGroupId: string; userId: string }
  | { type: "place-group"; groupId: string; sessionId: string }

function tempId() {
  return `temp-${crypto.randomUUID()}`
}

function mapGroups(board: Board, groupId: string, change: (group: CatalogGroup) => CatalogGroup): Board {
  return {
    classes: board.classes.map((classroom) => ({
      ...classroom,
      sessions: classroom.sessions.map((session) => ({
        ...session,
        groups: session.groups.map((group) => (group.id === groupId ? change(group) : group)),
      })),
    })),
    looseGroups: board.looseGroups.map((group) => (group.id === groupId ? change(group) : group)),
  }
}

function mergeStudents<T extends { id: string; name: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((student) => student.id))
  return [...current, ...incoming.filter((student) => !seen.has(student.id))].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

function placeMember(board: Board, groupId: string, member: { id: string; name: string; role: string }): Board {
  const inClass = board.classes.some((classroom) =>
    classroom.sessions.some((session) => session.groups.some((group) => group.id === groupId))
  )
  if (inClass) {
    return {
      ...board,
      classes: board.classes.map((classroom) => {
        const ownsGroup = classroom.sessions.some((session) => session.groups.some((group) => group.id === groupId))
        if (!ownsGroup) return classroom
        return {
          ...classroom,
          sessions: classroom.sessions.map((session) => ({
            ...session,
            groups: session.groups.map((group) => ({
              ...group,
              members:
                group.id === groupId
                  ? group.members.some((item) => item.id === member.id)
                    ? group.members
                    : [...group.members, member]
                  : group.members.filter((item) => item.id !== member.id),
            })),
          })),
        }
      }),
    }
  }
  return {
    ...board,
    looseGroups: board.looseGroups.map((group) => ({
      ...group,
      members:
        group.id === groupId
          ? group.members.some((item) => item.id === member.id)
            ? group.members
            : [...group.members, member]
          : group.members.filter((item) => item.id !== member.id),
    })),
  }
}

function findGroup(board: Board, groupId: string) {
  for (const classroom of board.classes) {
    for (const session of classroom.sessions) {
      const group = session.groups.find((item) => item.id === groupId)
      if (group) return group
    }
  }
  return board.looseGroups.find((item) => item.id === groupId) || null
}

function updateBoard(board: Board, update: BoardUpdate): Board {
  switch (update.type) {
    case "add-class":
    case "duplicate-class":
      return { ...board, classes: [...board.classes, update.classroom] }
    case "rename-class":
      return {
        ...board,
        classes: board.classes.map((classroom) =>
          classroom.id === update.id ? { ...classroom, name: update.name } : classroom
        ),
      }
    case "delete-class":
      return { ...board, classes: board.classes.filter((classroom) => classroom.id !== update.id) }
    case "add-session":
      return {
        ...board,
        classes: board.classes.map((classroom) =>
          classroom.id === update.classId
            ? { ...classroom, sessions: [...classroom.sessions, update.session] }
            : classroom
        ),
      }
    case "rename-session":
      return {
        ...board,
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.map((session) =>
            session.id === update.id ? { ...session, title: update.title } : session
          ),
        })),
      }
    case "delete-session":
      return {
        ...board,
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.filter((session) => session.id !== update.id),
        })),
      }
    case "add-group":
      return {
        ...board,
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.map((session) =>
            session.id === update.sessionId ? { ...session, groups: [...session.groups, update.group] } : session
          ),
        })),
      }
    case "rename-group":
      return mapGroups(board, update.id, (group) => ({ ...group, name: update.name }))
    case "delete-group":
      return {
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.map((session) => ({
            ...session,
            groups: session.groups.filter((group) => group.id !== update.id),
          })),
        })),
        looseGroups: board.looseGroups.filter((group) => group.id !== update.id),
      }
    case "add-class-students":
      return {
        ...board,
        classes: board.classes.map((classroom) =>
          classroom.id === update.classId
            ? { ...classroom, students: mergeStudents(classroom.students, update.students) }
            : classroom
        ),
      }
    case "add-session-students":
      return {
        ...board,
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.map((session) =>
            session.id === update.sessionId
              ? { ...session, students: mergeStudents(session.students, update.students) }
              : session
          ),
        })),
      }
    case "add-group-students": {
      const incoming = new Set(update.students.map((student) => student.id))
      const members = update.students.map((student) => ({ ...student, role: "student" }))
      return {
        ...board,
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.map((session) => {
            if (session.id !== update.sessionId) return session
            return {
              ...session,
              groups: session.groups.map((group) => ({
                ...group,
                members:
                  group.id === update.groupId
                    ? mergeStudents(group.members, members)
                    : group.members.filter((member) => !incoming.has(member.id)),
              })),
            }
          }),
        })),
      }
    }
    case "remove-class-student":
      return {
        ...board,
        classes: board.classes.map((classroom) => {
          if (classroom.id !== update.classId) return classroom
          return {
            ...classroom,
            students: classroom.students.filter((student) => student.id !== update.userId),
            sessions: classroom.sessions.map((session) => ({
              ...session,
              students: session.students.filter((student) => student.id !== update.userId),
              groups: session.groups.map((group) => ({
                ...group,
                members: group.members.filter((member) => member.id !== update.userId),
              })),
            })),
          }
        }),
      }
    case "remove-class-students":
      return update.userIds.reduce(
        (next, userId) => updateBoard(next, { type: "remove-class-student", classId: update.classId, userId }),
        board
      )
    case "remove-session-student":
      return {
        ...board,
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.map((session) => {
            if (session.id !== update.sessionId) return session
            return {
              ...session,
              students: session.students.filter((student) => student.id !== update.userId),
              groups: session.groups.map((group) => ({
                ...group,
                members: group.members.filter((member) => member.id !== update.userId),
              })),
            }
          }),
        })),
      }
    case "remove-session-students":
      return update.userIds.reduce(
        (next, userId) => updateBoard(next, { type: "remove-session-student", sessionId: update.sessionId, userId }),
        board
      )
    case "remove-group-students":
      return mapGroups(board, update.groupId, (group) => ({
        ...group,
        members: group.members.filter((member) => !update.userIds.includes(member.id)),
      }))
    case "remove-member":
      return mapGroups(board, update.groupId, (group) => ({
        ...group,
        members: group.members.filter((member) => member.id !== update.userId),
      }))
    case "add-member":
      return placeMember(board, update.groupId, update.member)
    case "move-member": {
      const source = findGroup(board, update.fromGroupId)
      const member = source?.members.find((item) => item.id === update.userId)
      if (!member) return board
      const removed = mapGroups(board, update.fromGroupId, (group) => ({
        ...group,
        members: group.members.filter((item) => item.id !== update.userId),
      }))
      return placeMember(removed, update.toGroupId, member)
    }
    case "place-group": {
      const group = board.looseGroups.find((item) => item.id === update.groupId)
      if (!group) return board
      return {
        looseGroups: board.looseGroups.filter((item) => item.id !== update.groupId),
        classes: board.classes.map((classroom) => ({
          ...classroom,
          sessions: classroom.sessions.map((session) =>
            session.id === update.sessionId
              ? { ...session, groups: [...session.groups, { ...group, classSessionId: session.id }] }
              : session
          ),
        })),
      }
    }
  }
}

function blankGroup(name: string, sessionId: string): CatalogGroup {
  return {
    id: tempId(),
    name,
    newintervene: 1,
    classSessionId: sessionId,
    members: [],
    chatSessionId: null,
  }
}

function copySession(session: CatalogSession, classId: string, title: string): CatalogSession {
  const id = tempId()
  return {
    id,
    classId,
    title,
    createdAt: new Date().toISOString(),
    students: [],
    groups: session.groups.map((group) => blankGroup(group.name, id)),
  }
}

type CreateKind = "class" | "session" | "group" | "duplicate"

const CREATE_FLOW: Record<
  CreateKind,
  { step: number; items: { label: string; hint: string; icon: typeof Layers }[] }
> = {
  class: {
    step: 0,
    items: [
      { label: "Class", hint: "Name it", icon: Layers },
      { label: "Sessions", hint: "Add next", icon: Plus },
      { label: "Groups", hint: "Per session", icon: Users },
    ],
  },
  session: {
    step: 1,
    items: [
      { label: "Class", hint: "Ready", icon: Layers },
      { label: "Session", hint: "Name it", icon: Plus },
      { label: "Groups", hint: "Add next", icon: Users },
    ],
  },
  group: {
    step: 2,
    items: [
      { label: "Class", hint: "Set", icon: Layers },
      { label: "Session", hint: "Set", icon: Plus },
      { label: "Group", hint: "Name it", icon: Users },
    ],
  },
  duplicate: {
    step: 1,
    items: [
      { label: "Structure", hint: "Copied", icon: Copy },
      { label: "Students", hint: "Stay put", icon: Users },
      { label: "Materials", hint: "Included", icon: Layers },
    ],
  },
}

function CreateFlowStrip({ kind, entered }: { kind: CreateKind; entered: boolean }) {
  const flow = CREATE_FLOW[kind]
  return (
    <ol
      className={cn(
        "grid grid-cols-3 gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50/90 p-2",
        entered && "animate-welcome-fade-up",
      )}
      style={entered ? { animationDelay: "160ms" } : undefined}
    >
      {flow.items.map((item, index) => {
        const StepIcon = item.icon
        const active = index === flow.step
        return (
          <li
            key={item.label}
            className={cn(
              "flex flex-col items-center rounded-lg px-1 py-2 text-center transition-colors",
              active ? "bg-neutral-950 text-white shadow-sm" : "text-neutral-600",
            )}
          >
            <span
              className={cn(
                "mb-1 flex h-7 w-7 items-center justify-center rounded-lg border",
                active ? "border-white/20 bg-white/10" : "border-neutral-200 bg-white",
              )}
            >
              <StepIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide">{item.label}</span>
            <span className={cn("mt-0.5 text-[9px] font-medium leading-tight", active ? "text-white/75" : "text-neutral-400")}>
              {item.hint}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function CreateDialog({
  label,
  title,
  description,
  placeholder,
  onCreate,
  initialValue = "",
  submitLabel = "Create",
  tone = "primary",
  icon = "plus",
  kind = "class",
  fieldLabel,
}: {
  label: string
  title: string
  description: string
  placeholder: string
  onCreate: (value: string) => void
  initialValue?: string
  submitLabel?: string
  tone?: "primary" | "quiet"
  icon?: "plus" | "copy"
  kind?: CreateKind
  fieldLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [entered, setEntered] = useState(false)
  const Icon = icon === "copy" ? Copy : Plus
  const flowKind: CreateKind = icon === "copy" ? "duplicate" : kind
  const nameLabel =
    fieldLabel || (kind === "class" ? "Class name" : kind === "session" ? "Session name" : kind === "group" ? "Group name" : "Name")

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

  function close() {
    setOpen(false)
    setValue("")
  }

  function openDialog() {
    setValue(initialValue)
    setOpen(true)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = value.trim()
    if (!next) return
    close()
    onCreate(next)
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={
          tone === "quiet"
            ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50"
            : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-neutral-950 bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800"
        }
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : close())}>
        <DialogContent
          className={cn(
            "max-h-[calc(100dvh-1.25rem)] w-[calc(100%-1.5rem)] max-w-md gap-0 overflow-y-auto rounded-2xl border-neutral-200 bg-white p-0 shadow-[0_28px_70px_-32px_rgba(0,0,0,0.45)]",
            "[&>button]:z-20 [&>button]:rounded-full [&>button]:border [&>button]:border-neutral-200 [&>button]:bg-white [&>button]:text-neutral-900 [&>button]:shadow-sm [&>button]:transition-transform [&>button]:hover:scale-105",
          )}
        >
          <div className="relative shrink-0 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 pr-11">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              aria-hidden
            />
            <div className="relative z-10 flex items-start gap-3">
              <div className={cn("w-[72px] shrink-0", entered && "animate-welcome-float")}>
                <Image
                  src={createIllustration}
                  alt=""
                  className="h-auto w-full grayscale contrast-[1.06] brightness-[1.02]"
                  priority
                />
              </div>
              <DialogHeader className="min-w-0 flex-1 space-y-0.5 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Teacher setup</p>
                <DialogTitle className="text-balance text-lg font-bold leading-tight tracking-tight text-neutral-950">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-xs leading-snug text-neutral-500">{description}</DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-3 px-4 py-3 sm:px-4">
            <CreateFlowStrip kind={flowKind} entered={entered} />

            <label
              className={cn("block", entered && "animate-welcome-fade-up")}
              style={entered ? { animationDelay: "220ms" } : undefined}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{nameLabel}</span>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={placeholder}
                maxLength={80}
                autoFocus
                className="mt-1.5 h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
              />
            </label>

            <div
              className={cn("flex justify-end gap-2 border-t border-neutral-100 pt-3", entered && "animate-welcome-fade-up")}
              style={entered ? { animationDelay: "280ms" } : undefined}
            >
              <button
                type="button"
                onClick={close}
                className="h-9 rounded-xl px-3 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!value.trim()}
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
                <span className="relative">{submitLabel}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function NameEditor({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)

  function openDialog() {
    setDraft(value)
    setOpen(true)
  }

  function close() {
    setOpen(false)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = draft.trim()
    close()
    if (!next || next === value) return
    onSave(next)
  }

  return (
    <>
      <button type="button" onClick={openDialog} className="inline-flex min-w-0 items-start gap-1.5 text-left">
        <span className="min-w-0 text-pretty break-words">{value}</span>
        <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : close())}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">Edit name</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">
                The new name shows right away.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Name</span>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={80}
                autoFocus
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!draft.trim()}
                className="h-9 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function notYetPlaced(students: CatalogStudent[], placed: { id: string }[]) {
  const ids = new Set(placed.map((student) => student.id))
  return students.filter((student) => !ids.has(student.id))
}

function classNameByStudentId(classes: CatalogClass[]) {
  const map = new Map<string, string>()
  for (const classroom of classes) {
    for (const student of classroom.students) {
      map.set(student.id, classroom.name)
    }
  }
  return map
}

function toManageStudent(
  student: { id: string; name: string; email?: string | null; username?: string | null; studentId?: string | null },
  profiles: Map<string, CatalogStudent>,
  courseByStudent: Map<string, string>,
  courseOverride?: string | null
): ManageStudent {
  const profile = profiles.get(student.id)
  return {
    id: student.id,
    name: profile?.name ?? student.name,
    email: profile?.email ?? student.email ?? null,
    username: profile?.username ?? student.username ?? null,
    studentId: profile?.studentId ?? student.studentId ?? null,
    courseName: courseOverride !== undefined ? courseOverride : courseByStudent.get(student.id) ?? null,
  }
}

export default function TeacherClassBoard({
  classes,
  looseGroups,
  students,
  onOpen,
  openingId = null,
}: {
  classes: CatalogClass[]
  looseGroups: CatalogGroup[]
  students: CatalogStudent[]
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  openingId?: string | null
}) {
  const router = useRouter()
  const [placements, setPlacements] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState("")
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)
  const propsBoard = useRef({ classes, looseGroups })
  propsBoard.current = { classes, looseGroups }
  const [board, setBoard] = useState(propsBoard.current)
  const generation = useRef(0)

  useEffect(() => {
    if (generation.current === 0) setBoard({ classes, looseGroups })
  }, [classes, looseGroups])

  const allSessions = board.classes.flatMap((item) => item.sessions)
  const art = artworkIndexes(board.classes)
  const studentProfiles = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])
  const courseByStudent = useMemo(() => classNameByStudentId(board.classes), [board.classes])
  const courseOptions = useMemo(
    () => board.classes.map((classroom) => ({ id: classroom.id, name: classroom.name })),
    [board.classes]
  )

  function manageStudents(
    list: CatalogStudent[],
    courseOverride?: string | null
  ): ManageStudent[] {
    return list.map((student) => toManageStudent(student, studentProfiles, courseByStudent, courseOverride))
  }

  function showNotice(message: string) {
    setNotice(message)
  }

  function askConfirm(title: string, description: string, onConfirm: () => void, confirmLabel = "Delete") {
    setConfirm({ title, description, confirmLabel, onConfirm })
  }

  function stillSaving(id: string) {
    if (!id.startsWith("temp-")) return false
    showNotice("That change is still saving. Wait a moment, then try again.")
    return true
  }

  function perform(update: BoardUpdate, action: () => Promise<{ ok: boolean; error?: string }>) {
    generation.current += 1
    setBoard((current) => updateBoard(current, update))
    void (async () => {
      let failed = false
      try {
        const result = await action()
        if (!result.ok) {
          failed = true
          showNotice(result.error || "Something went wrong.")
        }
      } catch {
        failed = true
        showNotice("Something went wrong.")
      } finally {
        generation.current -= 1
        if (generation.current === 0) {
          if (failed) setBoard(propsBoard.current)
          void router.refresh()
        }
      }
    })()
  }

  function teacherSessionBody(session: CatalogSession, index: number, classroom: CatalogClass) {
    return (
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Session</p>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">
              <NameEditor
                value={session.title}
                onSave={(next) => {
                  if (stillSaving(session.id)) return
                  perform({ type: "rename-session", id: session.id, title: next }, () =>
                    renameClassSession(session.id, next)
                  )
                }}
              />
            </h3>
          </div>
          <SessionMaterialsButton role="teacher" sessionId={session.id} compact />
          <ManageStudentsDialog
            title={`Manage students in ${session.title}`}
            description={`Add students from ${classroom.name}, or move them out of this session. A student can be in more than one session of their class.`}
            context="session"
            currentCourseName={classroom.name}
            available={manageStudents(notYetPlaced(classroom.students, session.students), classroom.name)}
            enrolled={manageStudents(session.students, classroom.name)}
            onAdd={(chosen) => {
              if (stillSaving(session.id) || chosen.length === 0) return
              perform(
                { type: "add-session-students", sessionId: session.id, students: chosen },
                () => placeStudentsInSession(session.id, chosen.map((student) => student.id))
              )
            }}
            onMoveOut={(chosen) => {
              if (stillSaving(session.id) || chosen.length === 0) return
              const ids = chosen.map((student) => student.id)
              perform({ type: "remove-session-students", sessionId: session.id, userIds: ids }, async () => {
                for (const id of ids) {
                  const result = await removeStudentFromSession(session.id, id)
                  if (!result.ok) return result
                }
                return { ok: true as const }
              })
            }}
          />
          <CreateDialog
            kind="group"
            label="Create group"
            title="Create group"
            description={`Add a group inside “${session.title}”, then place students in it.`}
            placeholder="Group name"
            onCreate={(name) => {
              if (stillSaving(session.id)) return
              perform(
                { type: "add-group", sessionId: session.id, group: blankGroup(name, session.id) },
                () => createSessionGroup(session.id, name)
              )
            }}
          />
          <CreateDialog
            kind="session"
            label="Duplicate"
            title="Duplicate session"
            description={`Copy groups and materials from “${session.title}”. Students and chat stay in the original.`}
            placeholder="Session name"
            initialValue={`Copy of ${session.title}`.slice(0, 80)}
            submitLabel="Duplicate"
            tone="quiet"
            icon="copy"
            onCreate={(title) => {
              if (stillSaving(session.id)) return
              perform(
                {
                  type: "add-session",
                  classId: classroom.id,
                  session: copySession(session, classroom.id, title),
                },
                () => duplicateClassSession(session.id, title)
              )
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (stillSaving(session.id)) return
              askConfirm(`Delete ${session.title}`, `Delete “${session.title}” and the groups inside it?`, () =>
                perform({ type: "delete-session", id: session.id }, () => deleteClassSession(session.id))
              )
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
            aria-label={`Delete ${session.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3">
          <StudentRoster
            students={studentsNotInSessionGroups(session)}
            variant="unassigned"
            empty={
              session.students.length === 0
                ? "No students in this session yet."
                : "Everyone in this session is placed in a group."
            }
          />
        </div>

        {session.groups.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No groups in this session yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {session.groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onRename={(next) => {
                  if (stillSaving(group.id)) return
                  perform({ type: "rename-group", id: group.id, name: next }, () => renameGroup(group.id, next))
                }}
                onDelete={() => {
                  if (stillSaving(group.id)) return
                  askConfirm(
                    `Delete ${group.name}`,
                    `Delete “${group.name}”? Students in it will need to be placed in a group again.`,
                    () => perform({ type: "delete-group", id: group.id }, () => deleteGroup(group.id))
                  )
                }}
                onOpen={onOpen}
                opening={openingId === group.id}
                onRemove={(userId, studentName) => {
                  if (stillSaving(group.id)) return
                  askConfirm(
                    `Remove ${studentName}`,
                    `Remove ${studentName} from ${group.name}? They stay in this session and can be placed in another group.`,
                    () =>
                      perform({ type: "remove-member", groupId: group.id, userId }, () =>
                        removeStudent(userId, group.id)
                      ),
                    "Remove"
                  )
                }}
                place={
                  <ManageStudentsDialog
                    title={`Manage students in ${group.name}`}
                    description="Add students from this session, or move them out of this group. Each student can be in one group for this session."
                    context="group"
                    compactTrigger
                    currentCourseName={classroom.name}
                    available={manageStudents(
                      session.students
                        .filter((student) => !group.members.some((member) => member.id === student.id))
                        .map((student) => {
                          const current = session.groups.find(
                            (item) =>
                              item.id !== group.id && item.members.some((member) => member.id === student.id)
                          )
                          return current ? { ...student, name: `${student.name} (in ${current.name})` } : student
                        }),
                      classroom.name
                    )}
                    enrolled={manageStudents(
                      group.members.map((member) => ({ id: member.id, name: member.name })),
                      classroom.name
                    )}
                    onAdd={(chosen) => {
                      if (stillSaving(group.id) || chosen.length === 0) return
                      const clean = chosen.map((student) => {
                        const source = session.students.find((item) => item.id === student.id)
                        return { id: student.id, name: source?.name || student.name }
                      })
                      perform(
                        { type: "add-group-students", sessionId: session.id, groupId: group.id, students: clean },
                        () => placeStudentsInGroup(group.id, clean.map((student) => student.id))
                      )
                    }}
                    onMoveOut={(chosen) => {
                      if (stillSaving(group.id) || chosen.length === 0) return
                      const ids = chosen.map((student) => student.id)
                      perform({ type: "remove-group-students", groupId: group.id, userIds: ids }, async () => {
                        for (const id of ids) {
                          const result = await removeStudent(id, group.id)
                          if (!result.ok) return result
                        }
                        return { ok: true as const }
                      })
                    }}
                  />
                }
              />
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Dashboard</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Classes</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Place each student in one class. Inside that class, place them in one or more sessions, then in one group for each session.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeacherExportDataDialog classes={board.classes} looseGroups={board.looseGroups} />
          <CreateDialog
            kind="class"
            label="Create class"
            title="Create class"
            description="Name the class first. Then add sessions and groups inside it."
            placeholder="Class name"
            onCreate={(name) =>
              perform(
                {
                  type: "add-class",
                  classroom: { id: tempId(), name, createdAt: new Date().toISOString(), students: [], sessions: [] },
                },
                () => createClass(name)
              )
            }
          />
        </div>
      </div>

      {board.classes.length === 0 && board.looseGroups.length === 0 && (
        <div className="conet-surface mt-6 px-6 py-10 text-center">
          <p className="text-lg font-bold tracking-tight text-slate-900">No classes yet</p>
          <p className="mt-2 text-sm text-slate-500">Create a class, then add a session and the groups inside it.</p>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {board.classes.map((classroom) => (
          <section key={classroom.id} className="conet-surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Class</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  <NameEditor
                    value={classroom.name}
                    onSave={(next) => {
                      if (stillSaving(classroom.id)) return
                      perform({ type: "rename-class", id: classroom.id, name: next }, () => renameClass(classroom.id, next))
                    }}
                  />
                </h2>
              </div>
              <ManageStudentsDialog
                title={`Manage students in ${classroom.name}`}
                description="Add students into this class, or move students out. A student can belong to only one class. Moving a student out also removes them from its sessions and groups."
                context="class"
                currentCourseId={classroom.id}
                currentCourseName={classroom.name}
                courseOptions={courseOptions}
                available={manageStudents(
                  students.filter((student) => courseByStudent.get(student.id) !== classroom.name)
                )}
                isRowSelectable={(student) => !student.courseName}
                enrolled={manageStudents(classroom.students, classroom.name)}
                onAdd={(chosen) => {
                  if (stillSaving(classroom.id) || chosen.length === 0) return
                  perform(
                    { type: "add-class-students", classId: classroom.id, students: chosen },
                    () => placeStudentsInClass(classroom.id, chosen.map((student) => student.id))
                  )
                }}
                onMoveOut={(chosen) => {
                  if (stillSaving(classroom.id) || chosen.length === 0) return
                  const ids = chosen.map((student) => student.id)
                  perform(
                    { type: "remove-class-students", classId: classroom.id, userIds: ids },
                    async () => {
                      for (const id of ids) {
                        const result = await removeStudentFromClass(classroom.id, id)
                        if (!result.ok) return result
                      }
                      return { ok: true as const }
                    }
                  )
                }}
              />
              <CreateDialog
                kind="session"
                label="Create session"
                title="Create session"
                description={`Add a session inside “${classroom.name}”, then create groups for it.`}
                placeholder="Session name"
                onCreate={(title) => {
                  if (stillSaving(classroom.id)) return
                  perform(
                    {
                      type: "add-session",
                      classId: classroom.id,
                      session: {
                        id: tempId(),
                        classId: classroom.id,
                        title,
                        createdAt: new Date().toISOString(),
                        students: [],
                        groups: [],
                      },
                    },
                    () => createClassSession(classroom.id, title)
                  )
                }}
              />
              <CreateDialog
                kind="class"
                label="Duplicate"
                title="Duplicate class"
                description={`Copy sessions, groups, and materials from “${classroom.name}”. Students stay in the original.`}
                placeholder="Class name"
                initialValue={`Copy of ${classroom.name}`.slice(0, 80)}
                submitLabel="Duplicate"
                tone="quiet"
                icon="copy"
                onCreate={(name) => {
                  if (stillSaving(classroom.id)) return
                  const id = tempId()
                  perform(
                    {
                      type: "duplicate-class",
                      classroom: {
                        id,
                        name,
                        createdAt: new Date().toISOString(),
                        students: [],
                        sessions: classroom.sessions.map((session) => copySession(session, id, session.title)),
                      },
                    },
                    () => duplicateClass(classroom.id, name)
                  )
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (stillSaving(classroom.id)) return
                  askConfirm(`Delete ${classroom.name}`, `Delete “${classroom.name}” and every session and group inside it?`, () =>
                    perform({ type: "delete-class", id: classroom.id }, () => deleteClass(classroom.id))
                  )
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Delete ${classroom.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <StudentRoster students={classroom.students} empty="No students in this class yet." />
              {classroom.sessions.length === 0 && (
                <p className="text-sm text-slate-500">Add a session to this class, then add groups inside it.</p>
              )}

              <ol className="space-y-4">
                {classroom.sessions.map((session, index) => (
                  <li
                    key={session.id}
                    className="group/session overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 transition duration-300 hover:border-slate-300 hover:shadow-md"
                  >
                    <SessionArtwork index={art.get(session.id) ?? index} className="h-32 sm:h-40" />
                    {teacherSessionBody(session, index, classroom)}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ))}
      </div>

      {board.looseGroups.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Groups not in a session</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {board.looseGroups.map((group) => (
              <li key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-bold text-slate-900">{group.name}</p>
                <div className="mt-3 flex gap-2">
                  <select
                    value={placements[group.id] || ""}
                    onChange={(event) => setPlacements((current) => ({ ...current, [group.id]: event.target.value }))}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm"
                  >
                    <option value="">Place in a session...</option>
                    {allSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {board.classes.find((item) => item.id === session.classId)?.name} / {session.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!placements[group.id]}
                    onClick={() => {
                      const sessionId = placements[group.id]
                      if (!sessionId || stillSaving(group.id) || stillSaving(sessionId)) return
                      perform(
                        { type: "place-group", groupId: group.id, sessionId },
                        () => placeGroupInSession(group.id, sessionId)
                      )
                    }}
                    className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Place
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={Boolean(notice)} onOpenChange={(open) => !open && setNotice("")}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">Please try again</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">{notice}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end px-5 py-4">
            <button
              type="button"
              onClick={() => setNotice("")}
              className="h-9 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              OK
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{confirm?.title}</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">{confirm?.description}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4">
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const action = confirm?.onConfirm
                setConfirm(null)
                action?.()
              }}
              className="h-9 rounded-xl bg-red-600 px-3.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              {confirm?.confirmLabel || "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function studentsNotInSessionGroups(session: CatalogSession): CatalogStudent[] {
  const inGroup = new Set<string>()
  for (const group of session.groups) {
    for (const member of group.members) {
      inGroup.add(member.id)
    }
  }
  return session.students.filter((student) => !inGroup.has(student.id))
}

function rosterInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function RosterStudentCard({ student }: { student: CatalogStudent }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50/60 px-2 py-1.5 transition hover:border-neutral-300 hover:bg-white">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-[9px] font-bold leading-none text-white"
        title={student.name}
      >
        {rosterInitials(student.name)}
      </span>
      <span className="min-w-0 flex-1 text-pretty text-xs font-medium leading-snug text-neutral-900 sm:text-[13px]">
        {student.name}
      </span>
    </li>
  )
}

function StudentRoster({
  students,
  empty,
  variant = "default",
}: {
  students: CatalogStudent[]
  empty: string
  variant?: "default" | "unassigned"
}) {
  const isUnassigned = variant === "unassigned"
  const header = isUnassigned
    ? {
        title: "Not in a group",
        hint: "Place them using Manage students on a group below.",
      }
    : {
        title: "Students in this class",
        hint: "Enrolled here — assign to sessions and groups below.",
      }

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/80 px-3 py-3 text-sm text-neutral-500">
        {empty}
      </div>
    )
  }

  return (
    <Collapsible defaultOpen={false} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-50 sm:px-3.5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950/15 focus-visible:ring-offset-2",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700">
          <Users className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">{header.title}</span>
          <span className="mt-0.5 block text-xs font-medium text-neutral-800">
            {students.length} {students.length === 1 ? "student" : "students"}
            <span className="font-normal text-neutral-400 group-data-[state=open]:hidden"> · Click to expand</span>
            <span className="hidden font-normal text-neutral-400 group-data-[state=open]:inline"> · Click to fold</span>
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-neutral-800">
          {students.length}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-neutral-100 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <p className="border-b border-neutral-50 bg-neutral-50/60 px-3 py-2 text-[11px] leading-snug text-neutral-400 sm:px-3.5">
          {header.hint}
        </p>
        <ul
          className={cn(
            "grid gap-1.5 p-2.5 sm:p-3",
            isUnassigned
              ? "max-h-48 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3"
              : "max-h-56 overflow-y-auto sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {students.map((student) => (
            <RosterStudentCard key={student.id} student={student} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function GroupMemberRow({
  name,
  onRemove,
}: {
  name: string
  onRemove: () => void
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-lg border border-neutral-100 bg-white/90 px-2 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-950 text-[9px] font-bold leading-none text-white">
        {rosterInitials(name)}
      </span>
      <p className="min-w-0 flex-1 text-pretty text-xs font-medium leading-snug text-neutral-900">
        {name}
      </p>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm font-semibold text-neutral-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
        aria-label={`Remove ${name}`}
      >
        ×
      </button>
    </li>
  )
}

function GroupCard({
  group,
  onRename,
  onDelete,
  onRemove,
  onOpen,
  opening = false,
  place,
}: {
  group: CatalogGroup
  onRename: (next: string) => void
  onDelete: () => void
  onRemove: (userId: string, name: string) => void
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  opening?: boolean
  place?: ReactNode
}) {
  const memberCount = group.members.length

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition duration-200 hover:border-neutral-300 hover:shadow-md">
      <div className="border-b border-neutral-100 bg-neutral-50/80 px-2.5 py-2">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-500">Group</p>
              <span className="rounded-full border border-neutral-200 bg-white px-1.5 py-px text-[9px] font-bold tabular-nums text-neutral-600">
                {memberCount}
              </span>
            </div>
            <h4 className="mt-0.5 text-sm font-bold leading-snug tracking-tight text-neutral-950">
              <NameEditor value={group.name} onSave={onRename} />
            </h4>
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1 text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
            aria-label={`Delete ${group.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-2">
        {place && <div className="min-w-0">{place}</div>}

        <div className="w-full rounded-lg border border-neutral-100 bg-neutral-50/50 px-2 py-1.5">
          <NateModeSwitch groupId={group.id} mode={group.newintervene} compact />
        </div>

        {onOpen ? (
          <button
            type="button"
            disabled={opening}
            onClick={() => onOpen(group.id, group.chatSessionId)}
            className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-950 bg-neutral-950 text-[11px] font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {opening && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {opening ? "Opening" : "Open"}
            {!opening && <ArrowRight className="h-3 w-3" />}
          </button>
        ) : (
          <PendingLink
            href={`/dashboard?group=${group.id}&view=note${group.chatSessionId ? `&session=${group.chatSessionId}` : ""}`}
            className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-950 bg-neutral-950 text-[11px] font-semibold text-white transition hover:bg-neutral-800"
          >
            Open
            <ArrowRight className="h-3 w-3" />
          </PendingLink>
        )}

        <div className="rounded-lg border border-neutral-100 bg-neutral-50/40 px-2 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-500">Members</p>
          {memberCount === 0 ? (
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">None yet</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {group.members.map((student) => (
                <GroupMemberRow
                  key={student.id}
                  name={student.name}
                  onRemove={() => onRemove(student.id, student.name)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
}
