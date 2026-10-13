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
  guessStudentImportColumns,
  matrixColumnLabels,
  parseDelimitedClipboard,
  readStudentFileMatrix,
  type ParsedStudentDraft,
  type StudentImportColumns,
} from "@/lib/parse-student-spreadsheet"

const fieldClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"

const DEFAULT_COLUMNS: StudentImportColumns = {
  nameCol: 0,
  usernameCol: 1,
  emailCol: 2,
  passwordCol: 3,
  studentIdCol: 4,
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
    const header = nextHasHeader ? matrix[0] : matrix[0].map((_, i) => `Column ${i + 1}`)
    const guess = guessStudentImportColumns(header)
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
      setParseError("No rows found. Include columns for name, username, email, and password.")
      setMatrix(null)
      return
    }
    setParseError("")
    setMatrix(next)
    const header = hasHeaderRow ? next[0] : next[0].map((_, i) => `Column ${i + 1}`)
    const guess = guessStudentImportColumns(header)
    setColumns(guess)
    const initial = draftRowsFromMatrix(next, { hasHeaderRow, columns: guess })
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

  const requiredCols = [columns.nameCol, columns.usernameCol, columns.emailCol, columns.passwordCol]
  const columnsConflict = new Set(requiredCols).size !== requiredCols.length

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

      <DialogContent className="max-h-[min(92vh,760px)] max-w-xl gap-0 overflow-hidden border-slate-200 p-0 sm:rounded-2xl">
        <DialogHeader className="space-y-1 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-4 text-left">
          <DialogTitle className="text-base font-bold text-slate-900">Add student accounts</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-slate-500">
            Each student needs a display name, username, email, and password (min. 8 characters). They sign in with
            email and password. Student ID is optional and used for class rosters only.
          </DialogDescription>
        </DialogHeader>

        {phase === "importing" && (
          <div className="border-b border-sky-100 bg-sky-50/80 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-sky-950">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Creating {progress.done} of {progress.total}
              {progress.currentLabel ? ` — ${progress.currentLabel}` : ""}
            </div>
            <Progress value={progressPercent} className="mt-3 h-2 bg-sky-100 [&>div]:bg-sky-600" />
          </div>
        )}

        {phase === "done" && (
          <div className="border-b border-slate-100 bg-white px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {createdCount} created
              {failedCount > 0 && <span className="font-normal text-red-600">· {failedCount} failed</span>}
            </p>
            {failedCount > 0 && (
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-red-700">
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
              className="mt-2 text-xs font-semibold text-sky-700 hover:text-sky-900"
            >
              Add more
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {(parseError || importError) && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {parseError || importError}
            </p>
          )}

          <Tabs value={tab} onValueChange={setTab} className="gap-3">
            <TabsList className="grid h-9 w-full grid-cols-3 rounded-lg bg-slate-100 p-0.5">
              <TabsTrigger value="upload" className="gap-1 rounded-md text-xs" disabled={phase === "importing"}>
                <Upload className="h-3.5 w-3.5" />
                File
              </TabsTrigger>
              <TabsTrigger value="paste" className="gap-1 rounded-md text-xs" disabled={phase === "importing"}>
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste
              </TabsTrigger>
              <TabsTrigger value="type" className="gap-1 rounded-md text-xs" disabled={phase === "importing"}>
                <PenLine className="h-3.5 w-3.5" />
                Type
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-3 space-y-3">
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
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center transition hover:border-sky-300 hover:bg-sky-50/50 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-8 w-8 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">Choose CSV or spreadsheet</span>
                <span className="text-xs text-slate-500">Columns: name, username, email, password (+ optional student ID)</span>
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

            <TabsContent value="paste" className="mt-3 space-y-3">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  "Paste rows from Excel or Sheets…\nName\tUsername\tEmail\tPassword\tStudent ID\nChan Tai Men\tchantm\tchan@school.edu\tSecretPass1\t2A01"
                }
                disabled={phase === "importing"}
                rows={4}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={phase === "importing" || !pasteText.trim()}
                onClick={onApplyPaste}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Preview pasted rows
              </button>
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

            <TabsContent value="type" className="mt-3">
              <form onSubmit={(e) => void onManualSubmit(e)} className="grid gap-2.5 sm:grid-cols-2">
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
                <button
                  type="submit"
                  disabled={phase === "importing" || !manualReady}
                  className="h-9 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:col-span-2"
                >
                  {phase === "importing" ? "Creating…" : "Create account"}
                </button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {(tab === "upload" || tab === "paste") && matrix && drafts.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3">
            <button
              type="button"
              disabled={phase === "importing" || selectedDrafts.length === 0}
              onClick={() => void onImportSelected()}
              className="h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {phase === "importing"
                ? "Creating accounts…"
                : `Create ${selectedDrafts.length} account${selectedDrafts.length === 1 ? "" : "s"}`}
            </button>
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
}: {
  label: string
  value: number
  labels: string[]
  disabled: boolean
  onChange: (n: number) => void
  allowNone?: boolean
}) {
  return (
    <label className="block text-[11px] font-medium text-slate-500">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900"
      >
        {allowNone && <option value={-1}>Not mapped</option>}
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
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={hasHeaderRow}
          disabled={disabled}
          onChange={(e) => onHasHeaderRow(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        First row is header
      </label>
      <div className="grid grid-cols-2 gap-2">
        <ColumnSelect
          label="Name"
          value={columns.nameCol}
          labels={columnLabels}
          disabled={disabled}
          onChange={(n) => onColumn("nameCol", n)}
        />
        <ColumnSelect
          label="Username"
          value={columns.usernameCol}
          labels={columnLabels}
          disabled={disabled}
          onChange={(n) => onColumn("usernameCol", n)}
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
          value={columns.passwordCol}
          labels={columnLabels}
          disabled={disabled}
          onChange={(n) => onColumn("passwordCol", n)}
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
        <p className="text-xs text-amber-800">Name, username, email, and password must use four different columns.</p>
      )}

      {drafts.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">
          No complete rows in those columns. Each row needs name, username, email, and password.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={disabled}
                onChange={() => onToggleAll(!allSelected)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Select all ({drafts.length})
            </label>
            <span className="text-[11px] text-slate-400">{selectedKeys.size} selected</span>
          </div>
          <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-1">
            {drafts.map((row) => {
              const key = draftKey(row)
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(key)}
                      disabled={disabled}
                      onChange={() => onToggleRow(key)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{row.name}</span>
                    <span className="hidden shrink-0 font-mono text-[10px] text-slate-500 sm:inline">{row.username}</span>
                    <span className="shrink-0 truncate font-mono text-[10px] text-slate-400 max-w-[8rem]">{row.email}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
