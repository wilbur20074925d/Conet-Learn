"use client"

import { FormEvent, useCallback, useMemo, useRef, useState } from "react"
import { CheckCircle2, ClipboardPaste, FileSpreadsheet, Loader2, PenLine, Upload, UserPlus, XCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createStudentAccount, type CreateStudentInput, type ImportRowResult } from "@/lib/account-actions"
import {
  draftRowsFromMatrix,
  guessStudentImportColumnsFromMatrix,
  matrixColumnLabels,
  matrixLikelyHasHeaderRow,
  parseDelimitedClipboard,
  readStudentFileMatrix,
  type ParsedStudentDraft,
  type StudentImportColumns,
} from "@/lib/parse-student-spreadsheet"
import { INITIAL_STUDENT_PASSWORD } from "@/lib/student-password"

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5"

const primaryBtn =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"

const secondaryBtn =
  "inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"

const DEFAULT_COLUMNS: StudentImportColumns = {
  nameCol: 0,
  usernameCol: null,
  emailCol: 1,
  passwordCol: null,
  studentIdCol: 2,
}

type ImportPhase = "idle" | "importing" | "done"

export default function StudentImportDialog({
  disabled,
  onImported,
}: {
  disabled?: boolean
  onImported: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("upload")

  const [matrix, setMatrix] = useState<string[][] | null>(null)
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [columns, setColumns] = useState<StudentImportColumns>(DEFAULT_COLUMNS)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [pasteText, setPasteText] = useState("")
  const [parseError, setParseError] = useState("")

  const [manualName, setManualName] = useState("")
  const [manualUsername, setManualUsername] = useState("")
  const [manualEmail, setManualEmail] = useState("")
  const [manualPassword, setManualPassword] = useState("")
  const [manualStudentId, setManualStudentId] = useState("")

  const [phase, setPhase] = useState<ImportPhase>("idle")
  const [progress, setProgress] = useState({ done: 0, total: 0, currentLabel: "" })
  const [results, setResults] = useState<ImportRowResult[]>([])
  const [importError, setImportError] = useState("")

  const columnLabels = useMemo(
    () => (matrix ? matrixColumnLabels(matrix, hasHeaderRow) : []),
    [matrix, hasHeaderRow]
  )

  const drafts = useMemo(() => {
    if (!matrix) return []
    return draftRowsFromMatrix(matrix, { hasHeaderRow, columns })
  }, [matrix, hasHeaderRow, columns])

  const draftKey = (row: ParsedStudentDraft) => String(row.sourceIndex)

  const selectedDrafts = useMemo(
    () => drafts.filter((row) => selectedKeys.has(draftKey(row))),
    [drafts, selectedKeys]
  )

  function selectAllDraftKeys(source: ParsedStudentDraft[]) {
    setSelectedKeys(new Set(source.map((row) => draftKey(row))))
  }

  function setColumn<K extends keyof StudentImportColumns>(key: K, value: StudentImportColumns[K]) {
    setColumns((prev) => {
      const next = { ...prev, [key]: value }
      if (matrix) {
        const nextDrafts = draftRowsFromMatrix(matrix, { hasHeaderRow, columns: next })
        selectAllDraftKeys(nextDrafts)
      }
      return next
    })
  }

  function remapHeaderRow(nextHasHeader: boolean) {
    setHasHeaderRow(nextHasHeader)
    if (!matrix) return
    const guess = guessStudentImportColumnsFromMatrix(matrix, nextHasHeader)
    setColumns(guess)
    const nextDrafts = draftRowsFromMatrix(matrix, { hasHeaderRow: nextHasHeader, columns: guess })
    selectAllDraftKeys(nextDrafts)
  }

  const resetWorkspace = useCallback(() => {
    setMatrix(null)
    setHasHeaderRow(true)
    setColumns(DEFAULT_COLUMNS)
    setSelectedKeys(new Set())
    setPasteText("")
    setParseError("")
    setManualName("")
    setManualUsername("")
    setManualEmail("")
    setManualPassword("")
    setManualStudentId("")
    setPhase("idle")
    setProgress({ done: 0, total: 0, currentLabel: "" })
    setResults([])
    setImportError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  function applyMatrix(next: string[][]) {
    if (next.length === 0) {
      setParseError("No rows found. Include at least name and email columns (username and password can be filled in automatically).")
      setMatrix(null)
      return
    }
    setParseError("")
    setMatrix(next)
    const detectedHeader = matrixLikelyHasHeaderRow(next)
    setHasHeaderRow(detectedHeader)
    const guess = guessStudentImportColumnsFromMatrix(next, detectedHeader)
    setColumns(guess)
    const initial = draftRowsFromMatrix(next, { hasHeaderRow: detectedHeader, columns: guess })
    selectAllDraftKeys(initial)
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetWorkspace()
  }

  async function onPickFile(file: File | null) {
    if (!file || phase === "importing") return
    try {
      const buffer = await file.arrayBuffer()
      applyMatrix(readStudentFileMatrix(buffer))
      setTab("upload")
    } catch {
      setParseError("Could not read that file. Try .csv, .xlsx, or .xls.")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function onApplyPaste() {
    if (phase === "importing") return
    applyMatrix(parseDelimitedClipboard(pasteText))
    setTab("paste")
  }

  function toggleRow(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllRows(selectAll: boolean) {
    if (selectAll) setSelectedKeys(new Set(drafts.map(draftKey)))
    else setSelectedKeys(new Set())
  }

  async function runImport(rows: CreateStudentInput[]) {
    if (rows.length === 0 || phase === "importing") return
    setPhase("importing")
    setImportError("")
    setResults([])
    setProgress({ done: 0, total: rows.length, currentLabel: rows[0]?.name ?? "" })

    const collected: ImportRowResult[] = []
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      setProgress({ done: i, total: rows.length, currentLabel: row.name })
      const result = await createStudentAccount(row)
      if (result.ok) {
        collected.push({ name: row.name, email: row.email, ok: true })
      } else {
        collected.push({ name: row.name, email: row.email, ok: false, error: result.error })
      }
      setProgress({ done: i + 1, total: rows.length, currentLabel: row.name })
      setResults([...collected])
    }

    setPhase("done")
    onImported()
  }

  async function onImportSelected() {
    await runImport(
      selectedDrafts.map(({ name, username, email, password, studentId }) => ({
        name,
        username,
        email,
        password,
        studentId,
      }))
    )
  }

  async function onManualSubmit(event: FormEvent) {
    event.preventDefault()
    const name = manualName.trim()
    const username = manualUsername.trim()
    const email = manualEmail.trim()
    const password = manualPassword
    const studentId = manualStudentId.trim() || null
    if (!name || !username || !email || password.length < 8) return
    await runImport([{ name, username, email, password, studentId }])
    setManualName("")
    setManualUsername("")
    setManualEmail("")
    setManualPassword("")
    setManualStudentId("")
  }

  const progressPercent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const createdCount = results.filter((r) => r.ok).length
  const failedCount = results.filter((r) => !r.ok).length
  const manualReady =
    manualName.trim() &&
    manualUsername.trim() &&
    manualEmail.trim() &&
    manualPassword.length >= 8

  const mappedCols = [
    columns.nameCol,
    columns.emailCol,
    ...(columns.usernameCol !== null ? [columns.usernameCol] : []),
    ...(columns.passwordCol !== null ? [columns.passwordCol] : []),
    ...(columns.studentIdCol !== null ? [columns.studentIdCol] : []),
  ]
  const columnsConflict = new Set(mappedCols).size !== mappedCols.length

  const showBulkImport = (tab === "upload" || tab === "paste") && matrix !== null
  const canCreateBulk =
    showBulkImport &&
    drafts.length > 0 &&
    selectedDrafts.length > 0 &&
    !columnsConflict &&
    phase !== "importing"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          Add students
        </button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[min(92vh,880px)] w-[min(100vw-2rem,56rem)] max-w-none flex-col gap-0 overflow-hidden border-slate-200 p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 space-y-2 border-b border-slate-200 bg-white px-6 py-5 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">Add student accounts</DialogTitle>
          <DialogDescription className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Each student needs a display name and email. Username can be taken from the email; if you omit a password
            column, new accounts use the default password ({INITIAL_STUDENT_PASSWORD}). Student ID is optional.
          </DialogDescription>
        </DialogHeader>

        {phase === "importing" && (
          <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Creating {progress.done} of {progress.total}
              {progress.currentLabel ? ` — ${progress.currentLabel}` : ""}
            </div>
            <Progress value={progressPercent} className="mt-3 h-2 bg-slate-200 [&>div]:bg-slate-900" />
          </div>
        )}

        {phase === "done" && (
          <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-slate-900" />
              {createdCount} created
              {failedCount > 0 && <span className="font-normal text-red-600">· {failedCount} failed</span>}
            </p>
            {failedCount > 0 && (
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-red-700">
                {results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={`${r.name}-${r.email}`}>
                      {r.name} ({r.email}): {r.error}
                    </li>
                  ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                setPhase("idle")
                setResults([])
                setProgress({ done: 0, total: 0, currentLabel: "" })
              }}
              className="mt-3 text-xs font-semibold text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              Add more
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {(parseError || importError) && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {parseError || importError}
            </p>
          )}

          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl bg-slate-100 p-1">
              <TabsTrigger value="upload" className="gap-1.5 rounded-lg text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm" disabled={phase === "importing"}>
                <Upload className="h-4 w-4" />
                File
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5 rounded-lg text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm" disabled={phase === "importing"}>
                <ClipboardPaste className="h-4 w-4" />
                Paste
              </TabsTrigger>
              <TabsTrigger value="type" className="gap-1.5 rounded-lg text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm" disabled={phase === "importing"}>
                <PenLine className="h-4 w-4" />
                Type
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={phase === "importing"}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-slate-400 hover:bg-slate-100/80 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-10 w-10 text-slate-400" />
                <span className="text-base font-semibold text-slate-900">Choose CSV or spreadsheet</span>
                <span className="max-w-md text-sm text-slate-500">
                  Columns: name and email required; username, password, and student ID optional
                </span>
              </button>
              {matrix && tab === "upload" && (
                <ColumnAndRowPreview
                  columnLabels={columnLabels}
                  columns={columns}
                  hasHeaderRow={hasHeaderRow}
                  drafts={drafts}
                  columnsConflict={columnsConflict}
                  selectedKeys={selectedKeys}
                  disabled={phase === "importing"}
                  onColumn={setColumn}
                  onHasHeaderRow={remapHeaderRow}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllRows}
                  draftKey={draftKey}
                />
              )}
            </TabsContent>

            <TabsContent value="paste" className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paste from Excel or Sheets</p>
                <p className="mt-1 text-sm text-slate-600">
                  Copy a table with headers, paste below, then preview. You can adjust column mapping before creating
                  accounts.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={
                    "Name\tUsername\tEmail\tPassword\tStudent ID\nChan Tai Men\tchantm\tchan@school.edu\tSecretPass1\t2A01"
                  }
                  disabled={phase === "importing"}
                  rows={7}
                  className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={phase === "importing" || !pasteText.trim()}
                  onClick={onApplyPaste}
                  className={`${secondaryBtn} mt-3`}
                >
                  Preview pasted rows
                </button>
              </div>
              {matrix && tab === "paste" && (
                <ColumnAndRowPreview
                  columnLabels={columnLabels}
                  columns={columns}
                  hasHeaderRow={hasHeaderRow}
                  drafts={drafts}
                  columnsConflict={columnsConflict}
                  selectedKeys={selectedKeys}
                  disabled={phase === "importing"}
                  onColumn={setColumn}
                  onHasHeaderRow={remapHeaderRow}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllRows}
                  draftKey={draftKey}
                />
              )}
            </TabsContent>

            <TabsContent value="type" className="mt-4">
              <form onSubmit={(e) => void onManualSubmit(e)} className="conet-surface grid gap-3 p-5 sm:grid-cols-2">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Display name"
                  disabled={phase === "importing"}
                  className={`${fieldClass} sm:col-span-2`}
                  autoComplete="off"
                  maxLength={80}
                />
                <input
                  value={manualUsername}
                  onChange={(e) => setManualUsername(e.target.value)}
                  placeholder="Username"
                  disabled={phase === "importing"}
                  className={fieldClass}
                  autoComplete="off"
                  maxLength={64}
                />
                <input
                  value={manualStudentId}
                  onChange={(e) => setManualStudentId(e.target.value)}
                  placeholder="Student ID (optional)"
                  disabled={phase === "importing"}
                  className={fieldClass}
                  autoComplete="off"
                  maxLength={64}
                />
                <input
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  disabled={phase === "importing"}
                  className={`${fieldClass} sm:col-span-2`}
                  autoComplete="off"
                />
                <input
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  placeholder="Password (min. 8 characters)"
                  type="password"
                  disabled={phase === "importing"}
                  className={`${fieldClass} sm:col-span-2`}
                  autoComplete="new-password"
                />
                <button type="submit" disabled={phase === "importing" || !manualReady} className={`${primaryBtn} sm:col-span-2`}>
                  {phase === "importing" ? "Creating…" : "Create account"}
                </button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {showBulkImport && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                {columnsConflict
                  ? "Fix column mapping — each required field needs its own column."
                  : drafts.length === 0
                    ? "No complete rows yet. Check mapping — each row needs a name and a valid email."
                    : selectedDrafts.length === 0
                      ? "Select at least one row to create accounts."
                      : `${selectedDrafts.length} of ${drafts.length} row${drafts.length === 1 ? "" : "s"} ready to create.`}
              </p>
              <button
                type="button"
                disabled={!canCreateBulk}
                onClick={() => void onImportSelected()}
                className={`${primaryBtn} sm:max-w-xs sm:shrink-0`}
              >
                {phase === "importing"
                  ? "Creating accounts…"
                  : selectedDrafts.length > 0
                    ? `Create ${selectedDrafts.length} account${selectedDrafts.length === 1 ? "" : "s"}`
                    : "Create accounts"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ColumnSelect({
  label,
  value,
  labels,
  disabled,
  onChange,
  allowNone,
  noneLabel = "Not mapped",
}: {
  label: string
  value: number
  labels: string[]
  disabled: boolean
  onChange: (n: number) => void
  allowNone?: boolean
  noneLabel?: string
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900"
      >
        {allowNone && <option value={-1}>{noneLabel}</option>}
        {labels.map((colLabel, index) => (
          <option key={`${label}-${index}`} value={index}>
            {colLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function ColumnAndRowPreview({
  columnLabels,
  columns,
  hasHeaderRow,
  drafts,
  columnsConflict,
  selectedKeys,
  disabled,
  onColumn,
  onHasHeaderRow,
  onToggleRow,
  onToggleAll,
  draftKey,
}: {
  columnLabels: string[]
  columns: StudentImportColumns
  hasHeaderRow: boolean
  drafts: ParsedStudentDraft[]
  columnsConflict: boolean
  selectedKeys: Set<string>
  disabled: boolean
  onColumn: <K extends keyof StudentImportColumns>(key: K, value: StudentImportColumns[K]) => void
  onHasHeaderRow: (v: boolean) => void
  onToggleRow: (key: string) => void
  onToggleAll: (selectAll: boolean) => void
  draftKey: (row: ParsedStudentDraft) => string
}) {
  const allSelected = drafts.length > 0 && drafts.every((row) => selectedKeys.has(draftKey(row)))
  const studentIdValue = columns.studentIdCol ?? -1

  return (
    <div className="conet-surface space-y-4 overflow-hidden p-0">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-slate-900">Review import</p>
        <p className="mt-0.5 text-xs text-slate-500">Map columns, then select rows to create student accounts.</p>
      </div>

      <div className="space-y-4 px-4 pb-4 sm:px-5">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={hasHeaderRow}
          disabled={disabled}
          onChange={(e) => onHasHeaderRow(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
        />
        First row is header
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ColumnSelect
          label="Name"
          value={columns.nameCol}
          labels={columnLabels}
          disabled={disabled}
          onChange={(n) => onColumn("nameCol", n)}
        />
        <ColumnSelect
          label="Username"
          value={columns.usernameCol ?? -1}
          labels={columnLabels}
          disabled={disabled}
          allowNone
          noneLabel="Auto (from email)"
          onChange={(n) => onColumn("usernameCol", n < 0 ? null : n)}
        />
        <ColumnSelect
          label="Email"
          value={columns.emailCol}
          labels={columnLabels}
          disabled={disabled}
          onChange={(n) => onColumn("emailCol", n)}
        />
        <ColumnSelect
          label="Password"
          value={columns.passwordCol ?? -1}
          labels={columnLabels}
          disabled={disabled}
          allowNone
          noneLabel={`Default (${INITIAL_STUDENT_PASSWORD})`}
          onChange={(n) => onColumn("passwordCol", n < 0 ? null : n)}
        />
        <ColumnSelect
          label="Student ID"
          value={studentIdValue}
          labels={columnLabels}
          disabled={disabled}
          allowNone
          onChange={(n) => onColumn("studentIdCol", n < 0 ? null : n)}
        />
      </div>

      {columnsConflict && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          Each mapped column must be different. Name and email cannot share a column.
        </p>
      )}

      {drafts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          No complete rows in those columns. Each row needs a display name and a valid email address.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={disabled}
                onChange={() => onToggleAll(!allSelected)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              Select all ({drafts.length})
            </label>
            <span className="text-xs font-medium text-slate-500">{selectedKeys.size} selected</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5" aria-label="Select" />
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Username</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="hidden px-3 py-2.5 md:table-cell">Student ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {drafts.map((row) => {
                  const key = draftKey(row)
                  return (
                    <tr key={key} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          disabled={disabled}
                          onChange={() => onToggleRow(key)}
                          aria-label={`Select ${row.name}`}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">{row.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{row.username}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2.5 font-mono text-xs text-slate-600 sm:max-w-none">
                        {row.email}
                      </td>
                      <td className="hidden px-3 py-2.5 font-mono text-xs text-slate-500 md:table-cell">
                        {row.studentId || "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
    </div>
  )
}
