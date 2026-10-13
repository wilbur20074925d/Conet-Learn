export type SessionMaterial = {
  id: string
  title: string
  url: string
  note: string
  fileName?: string
}

export type SessionBrief = {
  title: string
  instructions: string
  materials: SessionMaterial[]
  updatedAt: string | null
}

export const EMPTY_SESSION_BRIEF: SessionBrief = {
  title: "",
  instructions: "",
  materials: [],
  updatedAt: null,
}

export function sessionBriefFromRow(
  row: { title?: string | null; instructions?: string | null; materials?: unknown; updated_at?: string | null } | null
): SessionBrief {
  if (!row) return { ...EMPTY_SESSION_BRIEF, materials: [] }
  return {
    title: (row.title || "").trim(),
    instructions: (row.instructions || "").trim(),
    materials: sessionMaterialsFromValue(row.materials),
    updatedAt: row.updated_at || null,
  }
}

export function sessionMaterialsFromValue(value: unknown): SessionMaterial[] {
  if (!Array.isArray(value)) return []
  const materials: SessionMaterial[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const title = typeof row.title === "string" ? row.title.trim() : ""
    if (!title) continue
    const fileName = typeof row.fileName === "string" ? row.fileName.trim() : ""
    materials.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID(),
      title,
      url: typeof row.url === "string" ? row.url.trim() : "",
      note: typeof row.note === "string" ? row.note.trim() : "",
      ...(fileName ? { fileName } : {}),
    })
  }
  return materials
}

export function formatSessionMaterialsForNate(brief: SessionBrief, excerpts: Record<string, string> = {}): string {
  const lines = [
    "Session materials for this class. Read and use these before you reply. Ground this turn in them, and do not invent materials that are not listed here.",
  ]
  lines.push(brief.title ? `Title: ${brief.title}` : "Title: none posted.")
  lines.push(brief.instructions ? `Instructions:\n${brief.instructions}` : "Instructions: none posted.")
  if (brief.materials.length === 0) {
    lines.push("Related materials: none posted.")
    return lines.join("\n")
  }
  lines.push("Related materials:")
  brief.materials.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`)
    if (item.fileName) lines.push(`File: ${item.fileName}`)
    if (item.note) lines.push(`Note: ${item.note}`)
    if (item.url) lines.push(`Link: ${item.url}`)
    const excerpt = excerpts[item.id]
    if (excerpt) lines.push(`Content:\n${excerpt}`)
  })
  return lines.join("\n")
}
