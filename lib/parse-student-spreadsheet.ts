import * as XLSX from "xlsx"

export type ParsedStudentRow = {
  name: string
  username: string
  email: string
  password: string
  studentId: string | null
}

export type ParsedStudentDraft = ParsedStudentRow & {
  sourceIndex: number
}

export type StudentImportColumns = {
  nameCol: number
  usernameCol: number
  emailCol: number
  passwordCol: number
  studentIdCol: number | null
}

function cellToString(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeHeader(value: unknown) {
  return cellToString(value).toLowerCase().replace(/[\s_-]+/g, "")
}

const NAME_HEADERS = new Set(["name", "studentname", "fullname", "student", "姓名", "名字", "学生姓名"])
const USERNAME_HEADERS = new Set(["username", "login", "handle", "userid", "用户", "用户名"])
const EMAIL_HEADERS = new Set(["email", "mail", "e-mail", "邮箱", "电子邮件"])
const PASSWORD_HEADERS = new Set(["password", "pass", "pwd", "initialpassword", "密码"])
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

function pickUniqueIndices(preferred: number[], width: number) {
  const used = new Set<number>()
  const result: number[] = []
  for (const index of preferred) {
    let i = index
    while (i < width && used.has(i)) i += 1
    if (i >= width) i = 0
    while (used.has(i) && i < width) i += 1
    if (i < width) {
      used.add(i)
      result.push(i)
    } else result.push(-1)
  }
  return result
}

export function guessStudentImportColumns(headers: string[]): StudentImportColumns {
  let nameCol = 0
  let usernameCol = 1
  let emailCol = 2
  let passwordCol = 3
  let studentIdCol: number | null = 4

  for (let i = 0; i < headers.length; i += 1) {
    const norm = normalizeHeader(headers[i])
    if (NAME_HEADERS.has(norm)) nameCol = i
    if (USERNAME_HEADERS.has(norm)) usernameCol = i
    if (EMAIL_HEADERS.has(norm)) emailCol = i
    if (PASSWORD_HEADERS.has(norm)) passwordCol = i
    if (ID_HEADERS.has(norm)) studentIdCol = i
  }

  const width = headers.length
  if (width >= 4) {
    const [n, u, e, p] = pickUniqueIndices([nameCol, usernameCol, emailCol, passwordCol], width)
    nameCol = n
    usernameCol = u
    emailCol = e
    passwordCol = p
    if (studentIdCol !== null) {
      const [sid] = pickUniqueIndices([studentIdCol], width)
      studentIdCol = sid >= 0 ? sid : null
    }
  } else {
    studentIdCol = null
  }

  return { nameCol, usernameCol, emailCol, passwordCol, studentIdCol }
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
  options: { hasHeaderRow: boolean; columns: StudentImportColumns }
): ParsedStudentDraft[] {
  const { hasHeaderRow, columns } = options
  const { nameCol, usernameCol, emailCol, passwordCol, studentIdCol } = columns
  const required = [nameCol, usernameCol, emailCol, passwordCol]
  if (matrix.length === 0 || required.some((col) => col < 0) || new Set(required).size !== required.length) {
    return []
  }

  const start = hasHeaderRow ? 1 : 0
  const drafts: ParsedStudentDraft[] = []

  for (let i = start; i < matrix.length; i += 1) {
    const line = matrix[i]
    const name = cellToString(line[nameCol])
    const username = cellToString(line[usernameCol])
    const email = cellToString(line[emailCol])
    const password = cellToString(line[passwordCol])
    const studentId =
      studentIdCol !== null && studentIdCol >= 0 ? cellToString(line[studentIdCol]) || null : null
    if (!name || !username || !email || !password) continue
    drafts.push({ name, username, email, password, studentId, sourceIndex: i })
  }

  return drafts
}

export function parseStudentSpreadsheet(buffer: ArrayBuffer): ParsedStudentRow[] {
  const matrix = readStudentFileMatrix(buffer)
  if (matrix.length === 0) return []

  const columns = guessStudentImportColumns(matrix[0])
  return draftRowsFromMatrix(matrix, { hasHeaderRow: true, columns }).map(
    ({ name, username, email, password, studentId }) => ({
      name,
      username,
      email,
      password,
      studentId,
    })
  )
}
