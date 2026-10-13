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
import { createStudentAccount, type ImportRowResult } from "@/lib/account-actions"
import { usernameFromName } from "@/lib/login-identity"
import {
  draftRowsFromMatrix,
  guessColumnIndices,
  matrixColumnLabels,
  parseDelimitedClipboard,
  readStudentFileMatrix,
  type ParsedStudentDraft,
} from "@/lib/parse-student-spreadsheet"

const fieldClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"

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
  const [nameCol, setNameCol] = useState(0)
  const [idCol, setIdCol] = useState(1)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [pasteText, setPasteText] = useState("")
  const [parseError, setParseError] = useState("")

  const [manualName, setManualName] = useState("")
  const [manualId, setManualId] = useState("")

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
    return draftRowsFromMatrix(matrix, { hasHeaderRow, nameCol, idCol })
  }, [matrix, hasHeaderRow, nameCol, idCol])

  const draftKey = (row: ParsedStudentDraft) => String(row.sourceIndex)

  const selectedDrafts = useMemo(
    () => drafts.filter((row) => selectedKeys.has(draftKey(row))),
    [drafts, selectedKeys]
  )

  function selectAllDraftKeys(source: ParsedStudentDraft[]) {
    setSelectedKeys(new Set(source.map((row) => draftKey(row))))
  }

  function remapColumns(nextNameCol: number, nextIdCol: number) {
    setNameCol(nextNameCol)
    setIdCol(nextIdCol)
    if (!matrix) return
    const nextDrafts = draftRowsFromMatrix(matrix, { hasHeaderRow, nameCol: nextNameCol, idCol: nextIdCol })
    selectAllDraftKeys(nextDrafts)
  }

  function remapHeaderRow(nextHasHeader: boolean) {
    setHasHeaderRow(nextHasHeader)
    if (!matrix) return
    const header = nextHasHeader ? matrix[0] : matrix[0].map((_, i) => `Column ${i + 1}`)
    const guess = guessColumnIndices(header)
    setNameCol(guess.nameCol)
    setIdCol(guess.idCol)
    const nextDrafts = draftRowsFromMatrix(matrix, {
      hasHeaderRow: nextHasHeader,
      nameCol: guess.nameCol,
      idCol: guess.idCol,
    })
    selectAllDraftKeys(nextDrafts)
  }

  const resetWorkspace = useCallback(() => {
    setMatrix(null)
    setHasHeaderRow(true)
    setNameCol(0)
    setIdCol(1)
    setSelectedKeys(new Set())
    setPasteText("")
    setParseError("")
    setManualName("")
    setManualId("")
    setPhase("idle")
    setProgress({ done: 0, total: 0, currentLabel: "" })
    setResults([])
    setImportError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  function applyMatrix(next: string[][]) {
    if (next.length === 0) {
      setParseError("No rows found. Include a header row with name and student ID columns.")
      setMatrix(null)
      return
    }
    setParseError("")
    setMatrix(next)
    const header = hasHeaderRow ? next[0] : next[0].map((_, i) => `Column ${i + 1}`)
    const guess = guessColumnIndices(header)
    setNameCol(guess.nameCol)
    setIdCol(guess.idCol)
    const initial = draftRowsFromMatrix(next, { hasHeaderRow, nameCol: guess.nameCol, idCol: guess.idCol })
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

  async function runImport(rows: { name: string; studentId: string }[]) {
    if (rows.length === 0 || phase === "importing") return
    setPhase("importing")
    setImportError("")
    setResults([])
    setProgress({ done: 0, total: rows.length, currentLabel: rows[0]?.name ?? "" })

    const collected: ImportRowResult[] = []
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      setProgress({ done: i, total: rows.length, currentLabel: row.name })
      const result = await createStudentAccount(row.name, row.studentId)
      if (result.ok) {
        collected.push({ name: row.name, studentId: row.studentId, ok: true })
      } else {
        collected.push({ name: row.name, studentId: row.studentId, ok: false, error: result.error })
      }
      setProgress({ done: i + 1, total: rows.length, currentLabel: row.name })
      setResults([...collected])
    }

    setPhase("done")
    onImported()
  }

  async function onImportSelected() {
    await runImport(selectedDrafts.map(({ name, studentId }) => ({ name, studentId })))
  }

  async function onManualSubmit(event: FormEvent) {
    event.preventDefault()
    const name = manualName.trim()
    const studentId = manualId.trim()
    if (!name || !studentId) return
    await runImport([{ name, studentId }])
    setManualName("")
    setManualId("")
  }

  const progressPercent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const createdCount = results.filter((r) => r.ok).length
  const failedCount = results.filter((r) => !r.ok).length
  const previewUsername = manualName.trim() ? usernameFromName(manualName) : ""

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

      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg gap-0 overflow-hidden border-slate-200 p-0 sm:rounded-2xl">
        <DialogHeader className="space-y-1 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-4 text-left">
          <DialogTitle className="text-base font-bold text-slate-900">Add student accounts</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-slate-500">
            Upload CSV or spreadsheet, paste from clipboard, or type one student. Usernames are uppercase names
            without spaces; passwords are student IDs.
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
              {failedCount > 0 && (
                <span className="font-normal text-red-600">
                  · {failedCount} failed
                </span>
              )}
            </p>
            {failedCount > 0 && (
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-red-700">
                {results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={`${r.name}-${r.studentId}`}>
                      {r.name} ({r.studentId}): {r.error}
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
                <span className="text-xs text-slate-500">.csv, .xlsx, .xls — first sheet</span>
              </button>
              {matrix && tab === "upload" && (
                <ColumnAndRowPreview
                  columnLabels={columnLabels}
                  nameCol={nameCol}
                  idCol={idCol}
                  hasHeaderRow={hasHeaderRow}
                  drafts={drafts}
                  selectedKeys={selectedKeys}
                  disabled={phase === "importing"}
                  onNameCol={(col) => remapColumns(col, idCol)}
                  onIdCol={(col) => remapColumns(nameCol, col)}
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
                placeholder={"Paste rows from Excel or Sheets…\nName\tStudent ID\nChan Tai Men\t2A01"}
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
                  nameCol={nameCol}
                  idCol={idCol}
                  hasHeaderRow={hasHeaderRow}
                  drafts={drafts}
                  selectedKeys={selectedKeys}
                  disabled={phase === "importing"}
                  onNameCol={(col) => remapColumns(col, idCol)}
                  onIdCol={(col) => remapColumns(nameCol, col)}
                  onHasHeaderRow={remapHeaderRow}
                  onToggleRow={toggleRow}
                  onToggleAll={toggleAllRows}
                  draftKey={draftKey}
                />
              )}
            </TabsContent>

            <TabsContent value="type" className="mt-3">
              <form onSubmit={(e) => void onManualSubmit(e)} className="space-y-2.5">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Student name"
                  disabled={phase === "importing"}
                  className={fieldClass}
                  autoComplete="off"
                  maxLength={80}
                />
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="Student ID (password)"
                  disabled={phase === "importing"}
                  className={fieldClass}
                  autoComplete="off"
                  maxLength={64}
                />
                {previewUsername && (
                  <p className="text-xs text-slate-500">
                    Login: <span className="font-mono font-semibold text-slate-800">{previewUsername}</span>
                  </p>
                )}
                <button
                  type="submit"
                  disabled={phase === "importing" || !manualName.trim() || !manualId.trim()}
                  className="h-9 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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

function ColumnAndRowPreview({
  columnLabels,
  nameCol,
  idCol,
  hasHeaderRow,
  drafts,
  selectedKeys,
  disabled,
  onNameCol,
  onIdCol,
  onHasHeaderRow,
  onToggleRow,
  onToggleAll,
  draftKey,
}: {
  columnLabels: string[]
  nameCol: number
  idCol: number
  hasHeaderRow: boolean
  drafts: ParsedStudentDraft[]
  selectedKeys: Set<string>
  disabled: boolean
  onNameCol: (n: number) => void
  onIdCol: (n: number) => void
  onHasHeaderRow: (v: boolean) => void
  onToggleRow: (key: string) => void
  onToggleAll: (selectAll: boolean) => void
  draftKey: (row: ParsedStudentDraft) => string
}) {
  const allSelected = drafts.length > 0 && drafts.every((row) => selectedKeys.has(draftKey(row)))

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
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
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-medium text-slate-500">
          Name column
          <select
            value={nameCol}
            disabled={disabled}
            onChange={(e) => onNameCol(Number(e.target.value))}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900"
          >
            {columnLabels.map((label, index) => (
              <option key={`name-${index}`} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] font-medium text-slate-500">
          Student ID column
          <select
            value={idCol}
            disabled={disabled}
            onChange={(e) => onIdCol(Number(e.target.value))}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900"
          >
            {columnLabels.map((label, index) => (
              <option key={`id-${index}`} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {nameCol === idCol && (
        <p className="text-xs text-amber-800">Pick two different columns for name and student ID.</p>
      )}

      {drafts.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">No complete rows with name and ID in those columns.</p>
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
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-1">
            {drafts.map((row) => {
              const key = draftKey(row)
              const login = usernameFromName(row.name)
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
                    <span className="shrink-0 font-mono text-slate-500">{row.studentId}</span>
                    <span className="hidden shrink-0 font-mono text-[10px] text-slate-400 sm:inline">{login}</span>
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
