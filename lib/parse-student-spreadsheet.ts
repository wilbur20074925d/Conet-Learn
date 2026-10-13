import * as XLSX from "xlsx"

export type ParsedStudentRow = {
  name: string
  studentId: string
}

export type ParsedStudentDraft = ParsedStudentRow & {
  /** Row index in the source matrix (0-based). */
  sourceIndex: number
}

function cellToString(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeHeader(value: unknown) {
  return cellToString(value).toLowerCase().replace(/[\s_-]+/g, "")
}

const NAME_HEADERS = new Set(["name", "studentname", "fullname", "student", "姓名", "名字", "学生姓名"])
const ID_HEADERS = new Set(["id", "studentid", "studentno", "sid", "学号", "编号", "studentnumber"])

function normalizeMatrix(raw: (string | number)[][]): string[][] {
  const maxCols = raw.reduce((max, row) => Math.max(max, row.length), 0)
  return raw.map((row) => {
    const line = row.map(cellToString)
    while (line.length < maxCols) line.push("")
    return line
  })
}

export function readStudentFileMatrix(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as (string | number)[][]

  return normalizeMatrix(matrix).filter((row) => row.some((cell) => cell.length > 0))
}

/** Parse clipboard or pasted text (CSV, TSV, or Excel-copied rows). */
export function parseDelimitedClipboard(text: string): string[][] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const delimiter =
    lines[0].includes("\t") ? "\t" : lines.filter((l) => l.includes(",")).length >= lines.length / 2 ? "," : "\t"

  const matrix = lines.map((line) => {
    if (delimiter === "\t") return line.split("\t").map((cell) => cell.trim())

    const cells: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else inQuotes = !inQuotes
        continue
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim())
        current = ""
        continue
      }
      current += ch
    }
    cells.push(current.trim())
    return cells
  })

  return normalizeMatrix(matrix).filter((row) => row.some((cell) => cell.length > 0))
}

export function guessColumnIndices(headers: string[]): { nameCol: number; idCol: number } {
  let nameCol = 0
  let idCol = 1

  for (let i = 0; i < headers.length; i += 1) {
    const norm = normalizeHeader(headers[i])
    if (NAME_HEADERS.has(norm)) nameCol = i
    if (ID_HEADERS.has(norm)) idCol = i
  }

  if (nameCol === idCol && headers.length >= 2) {
    nameCol = 0
    idCol = 1
  }

  return { nameCol, idCol }
}

export function matrixColumnLabels(matrix: string[][], hasHeaderRow: boolean): string[] {
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0)
  if (hasHeaderRow && matrix.length > 0) {
    return matrix[0].map((cell, index) => cellToString(cell) || `Column ${index + 1}`)
  }
  return Array.from({ length: width }, (_, index) => `Column ${index + 1}`)
}

export function draftRowsFromMatrix(
  matrix: string[][],
  options: { hasHeaderRow: boolean; nameCol: number; idCol: number }
): ParsedStudentDraft[] {
  const { hasHeaderRow, nameCol, idCol } = options
  if (matrix.length === 0 || nameCol < 0 || idCol < 0 || nameCol === idCol) return []

  const start = hasHeaderRow ? 1 : 0
  const drafts: ParsedStudentDraft[] = []

  for (let i = start; i < matrix.length; i += 1) {
    const line = matrix[i]
    const name = cellToString(line[nameCol])
    const studentId = cellToString(line[idCol])
    if (!name || !studentId) continue
    drafts.push({ name, studentId, sourceIndex: i })
  }

  return drafts
}

function pickColumns(headers: string[]) {
  const { nameCol, idCol } = guessColumnIndices(headers)
  const nameKey = headers[nameCol] ?? null
  const idKey = headers[idCol] ?? null
  return { nameKey, idKey, nameCol, idCol }
}

export function parseStudentSpreadsheet(buffer: ArrayBuffer): ParsedStudentRow[] {
  const matrix = readStudentFileMatrix(buffer)
  if (matrix.length === 0) return []

  const headerRow = matrix[0]
  const { nameCol, idCol } = pickColumns(headerRow)
  return draftRowsFromMatrix(matrix, { hasHeaderRow: true, nameCol, idCol }).map(({ name, studentId }) => ({
    name,
    studentId,
  }))
}
