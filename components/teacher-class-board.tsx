"use client"

import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Copy, Pencil, Plus, Trash2 } from "lucide-react"
import NateModeSwitch from "@/components/nate-mode-switch"
import PendingLink from "@/components/pending-link"
import SessionArtwork, { artworkIndexes } from "@/components/session-artwork"
import ManageStudentsDialog from "@/components/manage-students-dialog"
import SessionMaterialsButton from "@/components/session-materials-button"
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
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const Icon = icon === "copy" ? Copy : Plus

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
            ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
            : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
        }
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : close())}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{title}</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">{description}</DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Name</span>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={placeholder}
                maxLength={80}
                autoFocus
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!value.trim()}
                className="h-9 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {submitLabel}
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
      <button type="button" onClick={openDialog} className="inline-flex min-w-0 items-center gap-1.5 text-left">
        <span className="truncate">{value}</span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400" />
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

export default function TeacherClassBoard({
  classes,
  looseGroups,
  students,
  onOpen,
  openingId = null,
}: {
  classes: CatalogClass[]
  looseGroups: CatalogGroup[]
  students: { id: string; name: string }[]
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
        <CreateDialog
          label="Create class"
          title="Create class"
          description="Give the class a name. You can add sessions and groups after it is created."
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
                available={notYetPlaced(
                  students,
                  board.classes.flatMap((item) => item.students)
                )}
                enrolled={classroom.students}
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
                label="Create session"
                title="Create session"
                description={`This session will be added inside ${classroom.name}.`}
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
                label="Duplicate"
                title="Duplicate class"
                description={`Copies the sessions, groups, and materials in ${classroom.name}. Students and chat stay in the original. Place students in the copy yourself.`}
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
                    className="group/session grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 transition duration-300 hover:border-slate-300 hover:shadow-md grid-cols-[10.5rem_minmax(0,1fr)] sm:grid-cols-[14rem_minmax(0,1fr)] md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]"
                  >
                    <SessionArtwork index={art.get(session.id) ?? index} variant="side" />
                    <div className="min-w-0 flex-1 p-2.5 sm:p-3">
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
                              perform(
                                { type: "rename-session", id: session.id, title: next },
                                () => renameClassSession(session.id, next)
                              )
                            }}
                          />
                        </h3>
                      </div>
                      <SessionMaterialsButton role="teacher" sessionId={session.id} compact />
                      <ManageStudentsDialog
                        title={`Manage students in ${session.title}`}
                        description={`Add students from ${classroom.name}, or move them out of this session. A student can be in more than one session of their class.`}
                        available={notYetPlaced(classroom.students, session.students)}
                        enrolled={session.students}
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
                          perform(
                            { type: "remove-session-students", sessionId: session.id, userIds: ids },
                            async () => {
                              for (const id of ids) {
                                const result = await removeStudentFromSession(session.id, id)
                                if (!result.ok) return result
                              }
                              return { ok: true as const }
                            }
                          )
                        }}
                      />
                      <CreateDialog
                        label="Create group"
                        title="Create group"
                        description={`This group will be added inside ${session.title}.`}
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
                        label="Duplicate"
                        title="Duplicate session"
                        description={`Copies the groups and materials in ${session.title} into ${classroom.name}. Students and chat stay in the original. Place students in the copy yourself.`}
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
                      <StudentRoster students={session.students} empty="No students in this session yet." />
                    </div>

                    {session.groups.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">No groups in this session yet.</p>
                    ) : (
                      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
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
                              askConfirm(`Delete ${group.name}`, `Delete “${group.name}”? Students in it will need to be placed in a group again.`, () =>
                                perform({ type: "delete-group", id: group.id }, () => deleteGroup(group.id))
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
                                  perform(
                                    { type: "remove-member", groupId: group.id, userId },
                                    () => removeStudent(userId, group.id)
                                  ),
                                "Remove"
                              )
                            }}
                            place={
                              <ManageStudentsDialog
                                title={`Manage students in ${group.name}`}
                                description="Add students from this session, or move them out of this group. Each student can be in one group for this session."
                                available={session.students
                                  .filter((student) => !group.members.some((member) => member.id === student.id))
                                  .map((student) => {
                                    const current = session.groups.find(
                                      (item) => item.id !== group.id && item.members.some((member) => member.id === student.id)
                                    )
                                    return current ? { ...student, name: `${student.name} (in ${current.name})` } : student
                                  })}
                                enrolled={group.members.map((member) => ({ id: member.id, name: member.name }))}
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
                                  perform(
                                    { type: "remove-group-students", groupId: group.id, userIds: ids },
                                    async () => {
                                      for (const id of ids) {
                                        const result = await removeStudent(id, group.id)
                                        if (!result.ok) return result
                                      }
                                      return { ok: true as const }
                                    }
                                  )
                                }}
                              />
                            }
                          />
                        ))}
                      </ul>
                    )}
                    </div>
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
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
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

function rosterInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function StudentRoster({ students, empty }: { students: CatalogStudent[]; empty: string }) {
  if (students.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-500">
        {empty}
      </div>
    )
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {students.map((student) => (
        <li
          key={student.id}
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-white py-1 pl-1 pr-3 text-sm shadow-sm"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
            {rosterInitials(student.name)}
          </span>
          <span className="truncate font-medium text-slate-800">{student.name}</span>
        </li>
      ))}
    </ul>
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
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 transition duration-200 hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Group</p>
          <h4 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
            <NameEditor value={group.name} onSave={onRename} />
          </h4>
        </div>
        <button type="button" onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${group.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {place && <div className="mt-3">{place}</div>}
      <div className="mt-2 overflow-x-auto">
        <NateModeSwitch groupId={group.id} mode={group.newintervene} />
      </div>
      {onOpen ? (
        <button
          type="button"
          disabled={opening}
          onClick={() => onOpen(group.id, group.chatSessionId)}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {opening && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          {opening ? "Opening" : "Open"}
          {!opening && <ArrowRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <PendingLink
          href={`/dashboard?group=${group.id}&view=note${group.chatSessionId ? `&session=${group.chatSessionId}` : ""}`}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </PendingLink>
      )}
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Students</p>
        {group.members.length === 0 && <p className="mt-1 text-xs text-slate-500">No students in this group yet.</p>}
        <ul className="mt-2 space-y-1.5">
          {group.members.map((student) => (
            <li
              key={student.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-600 shadow-sm">
                  {rosterInitials(student.name)}
                </span>
                <p className="truncate text-sm font-medium text-slate-800">{student.name}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(student.id, student.name)}
                className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}
