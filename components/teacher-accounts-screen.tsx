"use client"

import { FormEvent, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileSpreadsheet, Upload } from "lucide-react"
import ClassroomHeader from "@/components/classroom-header"
import LoadingScreen from "@/components/loading-screen"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  createStudentAccount,
  createTeacherAccount,
  deleteStudentAccounts,
  importStudentAccounts,
  resetStudentPassword,
  type ImportRowResult,
  type ManagedAccount,
} from "@/lib/account-actions"
import { usernameFromName } from "@/lib/login-identity"
import { parseStudentSpreadsheet } from "@/lib/parse-student-spreadsheet"
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [studentName, setStudentName] = useState("")
  const [studentId, setStudentId] = useState("")
  const [teacherName, setTeacherName] = useState("")
  const [teacherEmail, setTeacherEmail] = useState("")
  const [teacherPassword, setTeacherPassword] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [importSummary, setImportSummary] = useState<ImportRowResult[] | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [pending, startTransition] = useTransition()
  const [importing, setImporting] = useState(false)

  const previewUsername = studentName.trim() ? usernameFromName(studentName) : ""

  function refreshLists() {
    router.refresh()
  }

  async function onCreateStudent(event: FormEvent) {
    event.preventDefault()
    setError("")
    setNotice("")
    startTransition(async () => {
      const createdName = studentName.trim()
      const createdId = studentId.trim()
      const result = await createStudentAccount(createdName, createdId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setStudentName("")
      setStudentId("")
      setNotice(
        result.pendingConfirm
          ? `${usernameFromName(createdName)} was created. They must confirm email before signing in. Password: ${createdId}.`
          : `${result.username} can sign in now. Password is their student ID (${createdId}).`
      )
      refreshLists()
    })
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

  async function onPickSpreadsheet(file: File | null) {
    if (!file || importing || pending) return
    setImporting(true)
    setError("")
    setNotice("")
    setImportSummary(null)
    try {
      const buffer = await file.arrayBuffer()
      const rows = parseStudentSpreadsheet(buffer)
      if (rows.length === 0) {
        setError("Could not read any student rows. Use columns for name and student ID in the first sheet.")
        return
      }
      const result = await importStudentAccounts(rows)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setImportSummary(result.results)
      setNotice(`Imported ${result.created} of ${result.results.length} students from the spreadsheet.`)
      refreshLists()
    } catch {
      setError("Could not read that file. Upload an .xlsx or .xls spreadsheet.")
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function onResetPassword(account: ManagedAccount) {
    if (pending || resettingId || deleting) return
    const label = account.studentId || INITIAL_STUDENT_PASSWORD
    if (!window.confirm(`Reset ${account.name}'s password to ${label}?`)) return
    setResettingId(account.id)
    setError("")
    setNotice("")
    const result = await resetStudentPassword(account.id)
    setResettingId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const password = account.studentId || result.fallbackPassword
    setNotice(`${account.name}'s password is ${password} again.`)
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

  if (importing) {
    return <LoadingScreen label="Importing" message="Creating student accounts from your spreadsheet…" />
  }

  return (
    <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
      <ClassroomHeader name={name} role="teacher" showMaterials={false} showAccountsLink={false} showDashboardLink />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Teacher</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Accounts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Upload a spreadsheet or add students one at a time. Usernames are the student&apos;s name without spaces in
            capital letters; passwords are their student ID (for example{" "}
            <span className="font-semibold text-slate-800">CHANTAIMEN</span> /{" "}
            <span className="font-semibold text-slate-800">2A00</span>).
          </p>
        </div>

        {setupError && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {setupError.includes("student_id")
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
            <section className="conet-surface grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Upload spreadsheet</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    First sheet with a header row: one column for name, one for student ID (.xlsx or .xls).
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="sr-only"
                  onChange={(event) => void onPickSpreadsheet(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  disabled={pending || importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Choose spreadsheet
                </button>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  Existing usernames are skipped with an error so you can fix the sheet and upload again.
                </p>
              </div>

              <form onSubmit={onCreateStudent} className="space-y-3 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <h2 className="text-lg font-bold text-slate-900">Add one student</h2>
                <input
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  placeholder="Chan Tai Men"
                  autoComplete="off"
                  maxLength={80}
                  className={fieldClass}
                />
                <input
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  placeholder="Student ID (password)"
                  autoComplete="off"
                  maxLength={64}
                  className={fieldClass}
                />
                {previewUsername && (
                  <p className="text-xs text-slate-500">
                    Username: <span className="font-mono font-semibold text-slate-800">{previewUsername}</span>
                  </p>
                )}
                <button
                  type="submit"
                  disabled={pending || !studentName.trim() || !studentId.trim()}
                  className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create student account"}
                </button>
              </form>
            </section>

            {importSummary && importSummary.some((row) => !row.ok) && (
              <section className="conet-surface overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-900">Import details</h3>
                </div>
                <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto text-sm">
                  {importSummary
                    .filter((row) => !row.ok)
                    .map((row) => (
                      <li key={`${row.name}-${row.studentId}`} className="px-4 py-2 text-red-700">
                        {row.name} ({row.studentId}): {row.error}
                      </li>
                    ))}
                </ul>
              </section>
            )}

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
              <th className="px-4 py-3">Login</th>
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
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{account.loginUsername}</td>
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
