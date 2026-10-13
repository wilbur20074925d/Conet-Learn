"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { createStudentAccount, deleteStudentAccounts, resetStudentPassword } from "@/lib/account-actions"
import type { BoardGroup, ClassroomStudent } from "@/lib/classroom"
import { INITIAL_STUDENT_PASSWORD } from "@/lib/student-password"

function groupLabel(groups: BoardGroup[], studentId: string) {
  const names = groups
    .filter((group) => group.members.some((member) => member.id === studentId && member.role === "student"))
    .map((group) => group.name)
  if (names.length === 0) return "Not in a group yet"
  return names.join(", ")
}

export default function StudentAccounts({
  students,
  groups,
}: {
  students: ClassroomStudent[]
  groups: BoardGroup[]
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [studentId, setStudentId] = useState("")
  const [pending, setPending] = useState(false)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    setNotice("")
    const result = await createStudentAccount({
      name: name.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
      studentId: studentId.trim() || null,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName("")
    setUsername("")
    setEmail("")
    setPassword("")
    setStudentId("")
    setNotice(
      result.pendingConfirm
        ? `${email.trim()} was created. They must confirm email before signing in.`
        : `${result.email} can sign in with the password you set.`
    )
    router.refresh()
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onDeleteMany(ids: string[], label: string) {
    if (pending || resettingId || deleting || ids.length === 0) return
    if (!window.confirm(`Delete ${label}? They will lose login access and class data tied to those accounts.`)) return
    setDeleting(true)
    setError("")
    setNotice("")
    const result = await deleteStudentAccounts(ids)
    setDeleting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelectedIds(new Set())
    setNotice(`Deleted ${result.deleted} student account${result.deleted === 1 ? "" : "s"}.`)
    router.refresh()
  }

  async function onReset(studentUserId: string, studentName: string) {
    if (pending || resettingId || deleting) return
    if (!window.confirm(`Reset ${studentName}'s password to ${INITIAL_STUDENT_PASSWORD}?`)) return
    setResettingId(studentUserId)
    setError("")
    setNotice("")
    const result = await resetStudentPassword(studentUserId)
    setResettingId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`${studentName}'s password is ${result.fallbackPassword} again.`)
    router.refresh()
  }

  const canCreate =
    name.trim() && username.trim() && email.trim() && password.length >= 8

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-100 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Teacher</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Students</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Students sign in with email and password. Username is for your records in this panel.
        </p>
        <form onSubmit={onCreate} className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Display name"
            autoComplete="off"
            maxLength={80}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              autoComplete="off"
              maxLength={64}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
            />
            <input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="Student ID (optional)"
              autoComplete="off"
              maxLength={64}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password (min. 8 characters)"
            type="password"
            autoComplete="new-password"
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="submit"
            disabled={pending || !canCreate}
            className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Creating..." : "Create account"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {notice && (
          <p className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
            {notice}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {students.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={students.every((s) => selectedIds.has(s.id))}
                disabled={pending || resettingId !== null || deleting}
                onChange={() => {
                  const all = students.every((s) => selectedIds.has(s.id))
                  setSelectedIds(all ? new Set() : new Set(students.map((s) => s.id)))
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Select all
            </label>
            {selectedIds.size > 0 && (
              <button
                type="button"
                disabled={pending || resettingId !== null || deleting}
                onClick={() =>
                  void onDeleteMany(
                    [...selectedIds],
                    `${selectedIds.size} student account${selectedIds.size === 1 ? "" : "s"}`
                  )
                }
                className="text-xs font-semibold text-red-700 hover:text-red-800 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : `Delete (${selectedIds.size})`}
              </button>
            )}
          </div>
        )}
        {students.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-slate-500">No student accounts yet.</p>
        )}
        {students.map((student) => (
          <section key={student.id} className="rounded-2xl border border-slate-200 px-3 py-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(student.id)}
                disabled={pending || resettingId !== null || deleting}
                onChange={() => toggleSelected(student.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                aria-label={`Select ${student.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500" title={student.email || undefined}>
                  {student.email || "No email saved"}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{groupLabel(groups, student.id)}</p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    disabled={pending || resettingId !== null || deleting}
                    onClick={() => onReset(student.id, student.name)}
                    className="h-8 flex-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    {resettingId === student.id ? "Resetting..." : "Reset password"}
                  </button>
                  <button
                    type="button"
                    disabled={pending || resettingId !== null || deleting}
                    onClick={() => void onDeleteMany([student.id], `${student.name}'s account`)}
                    className="h-8 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}
