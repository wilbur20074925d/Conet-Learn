import "server-only"

import { getSessionContext } from "@/lib/actions"
import { createClient } from "@/lib/supabase/server"

export type NoteSubmission = {
  id: string
  concept1: string
  concept2: string
  createdAt: string
}

export type IndividualNoteRecord = {
  userId: string
  name: string
  concept1: string
  concept2: string
  submissions: NoteSubmission[]
}

function readFields(raw: string | null | undefined) {
  if (!raw) return { concept1: "", concept2: "" }
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    if (!parsed || typeof parsed !== "object") return { concept1: raw, concept2: "" }
    return {
      concept1: parsed.part1_concept1 || parsed.field1 || "",
      concept2: parsed.part1_concept2 || parsed.field2 || "",
    }
  } catch {
    return { concept1: raw, concept2: "" }
  }
}

export async function listGroupIndividualNotes(
  groupId: string
): Promise<{ notes: IndividualNoteRecord[]; unavailable: boolean }> {
  const session = await getSessionContext()
  if (!session.ok || session.ctx.role !== "teacher") return { notes: [], unavailable: false }

  const supabase = await createClient()
  const [documents, members] = await Promise.all([
    supabase.from("ConetDocuments").select("id, user_id, content").eq("group_id", groupId),
    supabase.from("ConetGroupMembers").select("user_id, ConetUsers(id, name, role)").eq("group_id", groupId),
  ])
  if (documents.error || !documents.data) {
    const message = documents.error?.message || ""
    const unavailable = documents.error?.code === "42501" || /permission|policy/i.test(message)
    return { notes: [], unavailable }
  }

  const names = new Map<string, string>()
  for (const row of (members.data || []) as Array<{
    user_id: string
    ConetUsers: { id: string; name: string; role: string } | { id: string; name: string; role: string }[] | null
  }>) {
    const person = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
    if (!person || person.role === "ai" || person.role === "teacher") continue
    names.set(person.id, person.name)
  }

  const documentIds = documents.data.map((row) => row.id as string)
  const submissionsByDocument = new Map<string, NoteSubmission[]>()
  if (documentIds.length > 0) {
    const history = await supabase
      .from("ConetDocumentHistory")
      .select("id, document_id, content, created_at")
      .in("document_id", documentIds)
      .eq("is_submit", true)
      .order("created_at", { ascending: false })
    if (!history.error && history.data) {
      for (const row of history.data) {
        const fields = readFields(row.content as string)
        const documentId = row.document_id as string
        const list = submissionsByDocument.get(documentId) || []
        list.push({
          id: row.id as string,
          concept1: fields.concept1,
          concept2: fields.concept2,
          createdAt: row.created_at as string,
        })
        submissionsByDocument.set(documentId, list)
      }
    }
  }

  const seen = new Set<string>()
  const notes: IndividualNoteRecord[] = documents.data.map((row) => {
    const userId = row.user_id as string
    seen.add(userId)
    const fields = readFields(row.content as string)
    return {
      userId,
      name: names.get(userId) || "Student",
      concept1: fields.concept1,
      concept2: fields.concept2,
      submissions: submissionsByDocument.get(row.id as string) || [],
    }
  })

  for (const [userId, name] of names) {
    if (seen.has(userId)) continue
    notes.push({ userId, name, concept1: "", concept2: "", submissions: [] })
  }

  notes.sort((a, b) => a.name.localeCompare(b.name))
  return { notes, unavailable: false }
}
