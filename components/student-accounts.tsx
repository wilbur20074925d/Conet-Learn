"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { createStudentAccount, resetStudentPassword } from "@/lib/account-actions"
import type { BoardGroup, ClassroomStudent } from "@/lib/classroom"
import { INITIAL_STUDENT_PASSWORD } from "@/lib/student-password"

function groupLabel(groups: BoardGroup[], studentId: string) {
  for (const group of groups) {
    if (group.members.some((member) => member.id === studentId && member.role === "student")) return group.name
  }
  return "Not in a group yet"
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
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    setNotice("")
    const result = await createStudentAccount(name, email)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const createdEmail = email.trim()
    const createdName = name.trim()
    setName("")
    setEmail("")
    setNotice(
      result.pendingConfirm
        ? `${createdName} was created. Starting password is ${INITIAL_STUDENT_PASSWORD}. They need to open the confirmation email before signing in.`
        : `${createdName} can sign in with ${createdEmail} and ${INITIAL_STUDENT_PASSWORD}.`
    )
    router.refresh()
  }

  async function onReset(studentId: string, studentName: string) {
    if (pending || resettingId) return
    if (!window.confirm(`Reset ${studentName}'s password to ${INITIAL_STUDENT_PASSWORD}?`)) return
    setResettingId(studentId)
    setError("")
    setNotice("")
    const result = await resetStudentPassword(studentId)
    setResettingId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`${studentName}'s password is ${INITIAL_STUDENT_PASSWORD} again.`)
    router.refresh()
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-100 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Teacher</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Students</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Create a sign-in for each student. Their starting password is{" "}
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
            {INITIAL_STUDENT_PASSWORD}
          </span>.
        </p>
        <form onSubmit={onCreate} className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Student name"
            autoComplete="off"
            maxLength={80}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="student@email.com"
            type="email"
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="submit"
            disabled={pending || !name.trim() || !email.trim()}
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
        {students.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-slate-500">No student accounts yet.</p>
        )}
        {students.map((student) => (
          <section key={student.id} className="rounded-2xl border border-slate-200 px-3 py-3">
            <p className="text-sm font-semibold text-slate-900">{student.name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500" title={student.email || undefined}>
              {student.email || "No email saved"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">{groupLabel(groups, student.id)}</p>
            <button
              type="button"
              disabled={pending || resettingId !== null}
              onClick={() => onReset(student.id, student.name)}
              className="mt-2.5 h-8 w-full rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              {resettingId === student.id ? "Resetting..." : "Reset to Password123"}
            </button>
          </section>
        ))}
      </div>
    </aside>
  )
}
