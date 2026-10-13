"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import ClassroomHeader from "@/components/classroom-header"
import StudentImportDialog from "@/components/student-import-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  createTeacherAccount,
  deleteStudentAccounts,
  resetStudentPassword,
  type ManagedAccount,
} from "@/lib/account-actions"
import { INITIAL_STUDENT_PASSWORD } from "@/lib/student-password"

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"

export default function TeacherAccountsScreen({
  name,
  profileId,
  students,
  teachers,
  setupError,
}: {
  name: string
  profileId: string
  students: ManagedAccount[]
  teachers: ManagedAccount[]
  setupError?: string
}) {
  const router = useRouter()
  const [teacherName, setTeacherName] = useState("")
  const [teacherEmail, setTeacherEmail] = useState("")
  const [teacherPassword, setTeacherPassword] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [pending, startTransition] = useTransition()

  function refreshLists() {
    router.refresh()
  }

  async function onCreateTeacher(event: FormEvent) {
    event.preventDefault()
    setError("")
    setNotice("")
    startTransition(async () => {
      const result = await createTeacherAccount(teacherName, teacherEmail, teacherPassword)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setTeacherName("")
      setTeacherEmail("")
      setTeacherPassword("")
      setNotice(
        result.pendingConfirm
          ? `${teacherEmail.trim()} was created. They need to confirm email before signing in.`
          : `${teacherName.trim()} can sign in with ${teacherEmail.trim()}.`
      )
      refreshLists()
    })
  }

  async function onResetPassword(account: ManagedAccount) {
    if (pending || resettingId || deleting) return
    if (!window.confirm(`Reset ${account.name}'s password to ${INITIAL_STUDENT_PASSWORD}?`)) return
    setResettingId(account.id)
    setError("")
    setNotice("")
    const result = await resetStudentPassword(account.id)
    setResettingId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`${account.name}'s password is ${result.fallbackPassword} again. Share it with them securely.`)
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllStudentIds(allSelected: boolean, ids: string[]) {
    setSelectedIds(allSelected ? new Set() : new Set(ids))
  }

  async function onDeleteSelected() {
    if (pending || resettingId || deleting || selectedIds.size === 0) return
    const names = students.filter((s) => selectedIds.has(s.id)).map((s) => s.name)
    const preview =
      names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
    if (
      !window.confirm(
        `Delete ${selectedIds.size} student account${selectedIds.size === 1 ? "" : "s"}? ${preview} will lose login access and class data tied to those accounts.`
      )
    ) {
      return
    }
    setDeleting(true)
    setError("")
    setNotice("")
    const result = await deleteStudentAccounts([...selectedIds])
    setDeleting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelectedIds(new Set())
    setNotice(`Deleted ${result.deleted} student account${result.deleted === 1 ? "" : "s"}.`)
    refreshLists()
  }

  async function onDeleteOne(account: ManagedAccount) {
    if (pending || resettingId || deleting) return
    if (
      !window.confirm(
        `Delete ${account.name}'s account? They will lose login access and any class data tied to this account.`
      )
    ) {
      return
    }
    setDeleting(true)
    setError("")
    setNotice("")
    const result = await deleteStudentAccounts([account.id])
    setDeleting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelectedIds((prev) => {
      if (!prev.has(account.id)) return prev
      const next = new Set(prev)
      next.delete(account.id)
      return next
    })
    setNotice(`Deleted ${account.name}'s account.`)
    refreshLists()
  }

  return (
    <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
      <ClassroomHeader name={name} role="teacher" showMaterials={false} showAccountsLink={false} showDashboardLink />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Teacher</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Accounts</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
              Create student logins with email and password. Usernames are separate labels for your class roster; students
              sign in with their email.
            </p>
          </div>
          <StudentImportDialog
            disabled={pending || deleting || resettingId !== null}
            onImported={() => {
              refreshLists()
              setNotice("Student list updated.")
            }}
          />
        </div>

        {setupError && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {setupError.includes("student_id") || setupError.includes("username")
              ? "Run the latest supabase/conet-accounts.sql in the Supabase SQL editor, then refresh this page."
              : setupError}
          </p>
        )}

        {(error || notice) && (
          <div className="mb-4 space-y-2">
            {error && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            )}
            {notice && (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {notice}
              </p>
            )}
          </div>
        )}

        <Tabs defaultValue="students" className="gap-4">
          <TabsList className="h-10 rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="students" className="rounded-lg px-4 text-sm">
              Students ({students.length})
            </TabsTrigger>
            <TabsTrigger value="teachers" className="rounded-lg px-4 text-sm">
              Teachers ({teachers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="mt-0 space-y-4">
            <AccountTable
              accounts={students}
              emptyLabel="No student accounts yet."
              onReset={onResetPassword}
              onDelete={onDeleteOne}
              onDeleteSelected={onDeleteSelected}
              resettingId={resettingId}
              deleting={deleting}
              pending={pending}
              selectable
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onToggleSelectAll={() =>
                toggleSelectAllStudentIds(
                  students.length > 0 && students.every((s) => selectedIds.has(s.id)),
                  students.map((s) => s.id)
                )
              }
            />
          </TabsContent>

          <TabsContent value="teachers" className="mt-0 space-y-4">
            <section className="conet-surface p-5">
              <h2 className="text-lg font-bold text-slate-900">Add teacher</h2>
              <p className="mt-1 text-sm text-slate-500">Teachers sign in with their email and the password you set here.</p>
              <form onSubmit={onCreateTeacher} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  value={teacherName}
                  onChange={(event) => setTeacherName(event.target.value)}
                  placeholder="Display name"
                  autoComplete="off"
                  maxLength={80}
                  className={fieldClass}
                />
                <input
                  value={teacherEmail}
                  onChange={(event) => setTeacherEmail(event.target.value)}
                  placeholder="teacher@school.edu"
                  type="email"
                  autoComplete="off"
                  className={fieldClass}
                />
                <input
                  value={teacherPassword}
                  onChange={(event) => setTeacherPassword(event.target.value)}
                  placeholder="Password (min. 8 characters)"
                  type="password"
                  autoComplete="new-password"
                  className={`${fieldClass} sm:col-span-2`}
                />
                <button
                  type="submit"
                  disabled={pending || !teacherName.trim() || !teacherEmail.trim() || teacherPassword.length < 8}
                  className="h-10 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:col-span-2"
                >
                  {pending ? "Creating…" : "Create teacher account"}
                </button>
              </form>
            </section>

            <AccountTable accounts={teachers} emptyLabel="No other teacher accounts yet." showStudentId={false} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function AccountTable({
  accounts,
  emptyLabel,
  onReset,
  onDelete,
  onDeleteSelected,
  resettingId,
  deleting,
  pending,
  showStudentId = true,
  selectable,
  selectedIds,
  onToggleSelected,
  onToggleSelectAll,
}: {
  accounts: ManagedAccount[]
  emptyLabel: string
  onReset?: (account: ManagedAccount) => void
  onDelete?: (account: ManagedAccount) => void
  onDeleteSelected?: () => void
  resettingId?: string | null
  deleting?: boolean
  pending?: boolean
  showStudentId?: boolean
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelected?: (id: string) => void
  onToggleSelectAll?: () => void
}) {
  if (accounts.length === 0) {
    return (
      <section className="conet-surface px-4 py-12 text-center text-sm text-slate-500">{emptyLabel}</section>
    )
  }

  const allSelected =
    selectable && selectedIds && accounts.length > 0 && accounts.every((account) => selectedIds.has(account.id))
  const selectedCount = selectedIds?.size ?? 0
  const actionsDisabled = pending || resettingId !== null || deleting
  const showActions = onReset || onDelete

  return (
    <section className="conet-surface overflow-hidden">
      {selectable && onDeleteSelected && selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <p className="text-xs font-medium text-slate-600">
            {selectedCount} selected
          </p>
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => onDeleteSelected()}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : `Delete selected (${selectedCount})`}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    aria-label="Select all"
                    disabled={actionsDisabled}
                    onChange={() => onToggleSelectAll?.()}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  />
                </th>
              )}
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Email</th>
              {showStudentId && <th className="px-4 py-3">Student ID</th>}
              {showActions && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <tr key={account.id} className="bg-white">
                {selectable && (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(account.id) ?? false}
                      aria-label={`Select ${account.name}`}
                      disabled={actionsDisabled}
                      onChange={() => onToggleSelected?.(account.id)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-slate-900">{account.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{account.username || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{account.email || "—"}</td>
                {showStudentId && (
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{account.studentId || "—"}</td>
                )}
                {showActions && (
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      {onReset && (
                        <button
                          type="button"
                          disabled={actionsDisabled}
                          onClick={() => onReset(account)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {resettingId === account.id ? "Resetting…" : "Reset password"}
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          disabled={actionsDisabled}
                          onClick={() => onDelete(account)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
