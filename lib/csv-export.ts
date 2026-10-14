export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ""
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function rowsToCsv(headers: string[], rows: Record<string, string | number | boolean | null | undefined>[]) {
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","))
  }
  return `${lines.join("\n")}\n`
}
