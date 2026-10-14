import * as XLSX from "xlsx"
import { INITIAL_STUDENT_PASSWORD } from "./student-password"

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
  /** null = derive from email local part */
  usernameCol: number | null
  emailCol: number
  /** null = use default student password (or student ID if long enough) */
  passwordCol: number | null
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

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function deriveUsername(email: string, fallbackName: string) {
  const local = email.split("@")[0]?.trim().replace(/[^a-zA-Z0-9._-]/g, "") || ""
  if (local.length >= 1) return local.slice(0, 64)
  const fromName = fallbackName.toLowerCase().replace(/\s+/g, "").slice(0, 64)
  return fromName || "student"
}

function resolveImportPassword(raw: string, studentId: string | null) {
  const pwd = raw.trim()
  if (pwd.length >= 8) return pwd
  const sid = studentId?.trim() ?? ""
  if (sid.length >= 8) return sid
  return INITIAL_STUDENT_PASSWORD
}

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

function emailColumnScore(matrix: string[][], col: number, startRow: number) {
  let score = 0
  const end = Math.min(matrix.length, startRow + 10)
  for (let i = startRow; i < end; i += 1) {
    if (looksLikeEmail(matrix[i][col] ?? "")) score += 1
  }
  return score
}

function pickStudentIdColumn(
  matrix: string[][],
  startRow: number,
  width: number,
  used: Set<number>
): number | null {
  for (let c = 0; c < width; c += 1) {
    if (used.has(c)) continue
    const sample = cellToString(matrix[startRow]?.[c])
    if (sample.length < 4 || looksLikeEmail(sample)) continue
    if (/^[0-9][A-Za-z][0-9]{2}$/.test(sample)) continue
    return c
  }
  return null
}

export function guessStudentImportColumns(headers: string[]): StudentImportColumns {
  const width = headers.length
  let nameCol = 0
  let emailCol = width > 1 ? 1 : 0
  let usernameCol: number | null = width > 3 ? 1 : null
  let passwordCol: number | null = width > 3 ? 3 : null
  let studentIdCol: number | null = width > 2 ? 2 : null

  let foundEmail = false
  let foundPassword = false

  for (let i = 0; i < headers.length; i += 1) {
    const norm = normalizeHeader(headers[i])
    if (NAME_HEADERS.has(norm)) nameCol = i
    if (USERNAME_HEADERS.has(norm)) usernameCol = i
    if (EMAIL_HEADERS.has(norm)) {
      emailCol = i
      foundEmail = true
    }
    if (PASSWORD_HEADERS.has(norm)) {
      passwordCol = i
      foundPassword = true
    }
    if (ID_HEADERS.has(norm)) studentIdCol = i
  }

  if (foundEmail && !foundPassword) {
    usernameCol = usernameCol !== null && usernameCol !== emailCol ? usernameCol : null
    passwordCol = null
  }

  if (usernameCol === emailCol) usernameCol = null

  return { nameCol, usernameCol, emailCol, passwordCol, studentIdCol }
}

export function matrixLikelyHasHeaderRow(matrix: string[][]): boolean {
  if (matrix.length < 2) return false

  const headerish = (row: string[]) =>
    row.some((cell) => {
      const norm = normalizeHeader(cell)
      return (
        NAME_HEADERS.has(norm) ||
        EMAIL_HEADERS.has(norm) ||
        USERNAME_HEADERS.has(norm) ||
        PASSWORD_HEADERS.has(norm) ||
        ID_HEADERS.has(norm)
      )
    })

  if (headerish(matrix[0]) && !headerish(matrix[1])) return true

  const emailCount = (row: string[]) => row.filter((cell) => looksLikeEmail(cell)).length
  if (emailCount(matrix[0]) >= 1 && emailCount(matrix[1]) >= 1) return false
  if (emailCount(matrix[0]) === 0 && emailCount(matrix[1]) >= 1) return false

  return headerish(matrix[0])
}

export function guessStudentImportColumnsFromMatrix(matrix: string[][], hasHeaderRow: boolean): StudentImportColumns {
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0)
  if (width === 0) {
    return { nameCol: 0, usernameCol: null, emailCol: 0, passwordCol: null, studentIdCol: null }
  }

  const headerLabels =
    hasHeaderRow && matrix.length > 0
      ? matrix[0].map((cell, index) => cellToString(cell) || `Column ${index + 1}`)
      : Array.from({ length: width }, (_, index) => `Column ${index + 1}`)

  let columns = guessStudentImportColumns(headerLabels)
  const startRow = hasHeaderRow ? 1 : 0
  if (startRow >= matrix.length) return columns

  let bestEmailCol = columns.emailCol
  let bestScore = 0
  for (let c = 0; c < width; c += 1) {
    const score = emailColumnScore(matrix, c, startRow)
    if (score > bestScore) {
      bestScore = score
      bestEmailCol = c
    }
  }

  if (bestScore > 0) {
    columns.emailCol = bestEmailCol
    if (!looksLikeEmail(matrix[startRow][columns.nameCol] ?? "") && bestEmailCol !== 0) {
      columns.nameCol = 0
    } else if (looksLikeEmail(matrix[startRow][0] ?? "") && bestEmailCol === 0 && width > 1) {
      columns.nameCol = 1
    }
  }

  const used = new Set<number>([columns.nameCol, columns.emailCol])
  if (columns.usernameCol !== null) used.add(columns.usernameCol)
  if (columns.passwordCol !== null) used.add(columns.passwordCol)
  if (columns.studentIdCol !== null) used.add(columns.studentIdCol)

  if (columns.studentIdCol === null || columns.studentIdCol === columns.emailCol) {
    const sid = pickStudentIdColumn(matrix, startRow, width, used)
    if (sid !== null) columns.studentIdCol = sid
  }

  if (columns.passwordCol !== null) {
    const sample = cellToString(matrix[startRow][columns.passwordCol])
    const headerNorm = normalizeHeader(headerLabels[columns.passwordCol] ?? "")
    if (
      sample.length > 0 &&
      sample.length < 8 &&
      !PASSWORD_HEADERS.has(headerNorm)
    ) {
      columns.passwordCol = null
    }
  }

  if (columns.usernameCol === columns.emailCol || columns.usernameCol === columns.nameCol) {
    columns.usernameCol = null
  }

  if (!columns.passwordCol && !PASSWORD_HEADERS.has(normalizeHeader(headerLabels[columns.emailCol] ?? ""))) {
    columns.passwordCol = null
  }

  return columns
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

  const mapped = [nameCol, emailCol]
  if (usernameCol !== null && usernameCol >= 0) mapped.push(usernameCol)
  if (passwordCol !== null && passwordCol >= 0) mapped.push(passwordCol)
  if (studentIdCol !== null && studentIdCol >= 0) mapped.push(studentIdCol)

  if (matrix.length === 0 || nameCol < 0 || emailCol < 0 || new Set(mapped).size !== mapped.length) {
    return []
  }

  const start = hasHeaderRow ? 1 : 0
  const drafts: ParsedStudentDraft[] = []

  for (let i = start; i < matrix.length; i += 1) {
    const line = matrix[i]
    const name = cellToString(line[nameCol])
    const email = cellToString(line[emailCol])
    const studentId =
      studentIdCol !== null && studentIdCol >= 0 ? cellToString(line[studentIdCol]) || null : null

    if (!name || !email || !looksLikeEmail(email)) continue

    let username =
      usernameCol !== null && usernameCol >= 0 ? cellToString(line[usernameCol]) : deriveUsername(email, name)
    if (!username.trim()) username = deriveUsername(email, name)

    const passwordRaw = passwordCol !== null && passwordCol >= 0 ? cellToString(line[passwordCol]) : ""
    const password = resolveImportPassword(passwordRaw, studentId)

    drafts.push({ name, username, email, password, studentId, sourceIndex: i })
  }

  return drafts
}

export function parseStudentSpreadsheet(buffer: ArrayBuffer): ParsedStudentRow[] {
  const matrix = readStudentFileMatrix(buffer)
  if (matrix.length === 0) return []

  const columns = guessStudentImportColumnsFromMatrix(matrix, true)
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
