"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import NateModeSwitch from "@/components/nate-mode-switch"
import { createGroup, deleteGroup, moveStudent, removeStudent } from "@/lib/classroom-actions"
import type { BoardGroup } from "@/lib/classroom"

export default function TeacherBoard({
  groups,
  waiting,
  activeGroupId,
  onSelectGroup,
  onPrefetchGroup,
}: {
  groups: BoardGroup[]
  waiting: { id: string; name: string }[]
  activeGroupId: string | null
  onSelectGroup: (groupId: string) => void
  onPrefetchGroup: (groupId: string) => void
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [moves, setMoves] = useState<Record<string, string>>({})

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName || pending) return
    setPending(true)
    setError("")
    const result = await createGroup(nextName)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName("")
    router.refresh()
  }

  async function onDeleteGroup(groupId: string, groupName: string) {
    if (pending) return
    if (!window.confirm(`Delete “${groupName}”? Students in it will need to join a group again.`)) return
    setPending(true)
    setError("")
    const result = await deleteGroup(groupId)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push("/")
    router.refresh()
  }

  async function onMove(userId: string) {
    const groupId = moves[userId]
    if (!groupId || pending) return
    setPending(true)
    setError("")
    const result = await moveStudent(userId, groupId)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function onRemove(userId: string, studentName: string) {
    if (pending) return
    if (!window.confirm(`Remove ${studentName} from their group? They will need to join a group again.`)) return
    setPending(true)
    setError("")
    const result = await removeStudent(userId)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-100 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Teacher</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Groups</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Create groups for students to join. Each group has one chat.
        </p>
        <form onSubmit={onCreate} className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New group name"
            maxLength={80}
            className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="h-10 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            Create
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {waiting.length > 0 && (
          <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Waiting to join</p>
            <ul className="mt-2 space-y-1">
              {waiting.map((student) => (
                <li key={student.id} className="text-sm font-medium text-slate-700">
                  {student.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-slate-500">Create a group and students can join it.</p>
        )}

        {groups.map((group) => {
          const students = group.members.filter((member) => member.role === "student")
          const others = groups.filter((item) => item.id !== group.id)
          return (
            <section
              key={group.id}
              className={`rounded-2xl border p-3 ${
                group.id === activeGroupId ? "border-slate-900" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onPointerEnter={() => onPrefetchGroup(group.id)}
                  onFocus={() => onPrefetchGroup(group.id)}
                  onClick={() => onSelectGroup(group.id)}
                  className={`min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left text-base font-bold tracking-tight transition ${
                    group.id === activeGroupId ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span className="block truncate">{group.name}</span>
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onDeleteGroup(group.id, group.name)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete ${group.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 overflow-x-auto">
                <NateModeSwitch groupId={group.id} mode={group.newintervene} />
              </div>

              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Students</p>
                {students.length === 0 && <p className="mt-1 text-xs text-slate-500">No students have joined.</p>}
                <ul className="mt-2 space-y-2">
                  {students.map((student) => (
                    <li key={student.id} className="rounded-xl bg-slate-50 px-2.5 py-2">
                      <p className="text-sm font-semibold text-slate-800">{student.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {others.length > 0 && (
                          <>
                            <select
                              value={moves[student.id] || ""}
                              onChange={(event) =>
                                setMoves((current) => ({ ...current, [student.id]: event.target.value }))
                              }
                              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                            >
                              <option value="">Move to...</option>
                              {others.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={pending || !moves[student.id]}
                              onClick={() => onMove(student.id)}
                              className="h-8 rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              Move
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onRemove(student.id, student.name)}
                          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

            </section>
          )
        })}
      </div>
    </aside>
  )
}
