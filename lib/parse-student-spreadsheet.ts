import * as XLSX from "xlsx"

export type ParsedStudentRow = {
  name: string
  studentId: string
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
}

const NAME_HEADERS = new Set(["name", "studentname", "fullname", "student", "姓名", "名字", "学生姓名"])
const ID_HEADERS = new Set(["id", "studentid", "studentno", "sid", "学号", "编号", "studentnumber"])

function pickColumns(headers: string[]) {
  let nameKey: string | null = null
  let idKey: string | null = null

  for (const header of headers) {
    const norm = normalizeHeader(header)
    if (!nameKey && NAME_HEADERS.has(norm)) nameKey = header
    if (!idKey && ID_HEADERS.has(norm)) idKey = header
  }

  if (!nameKey || !idKey) {
    const usable = headers.filter((header) => normalizeHeader(header))
    if (usable.length >= 2) {
      nameKey = nameKey || headers[0]
      idKey = idKey || headers[1]
    }
  }

  return { nameKey, idKey }
}

export function parseStudentSpreadsheet(buffer: ArrayBuffer): ParsedStudentRow[] {
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as (string | number)[][]

  if (matrix.length === 0) return []

  const headerRow = matrix[0].map((cell) => String(cell ?? "").trim())
  const { nameKey, idKey } = pickColumns(headerRow)
  if (!nameKey || !idKey) return []

  const nameIndex = headerRow.indexOf(nameKey)
  const idIndex = headerRow.indexOf(idKey)
  if (nameIndex < 0 || idIndex < 0) return []

  const rows: ParsedStudentRow[] = []
  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i]
    const name = String(line[nameIndex] ?? "").trim()
    const studentId = String(line[idIndex] ?? "").trim()
    if (!name || !studentId) continue
    rows.push({ name, studentId })
  }

  return rows
}
