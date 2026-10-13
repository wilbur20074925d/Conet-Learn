"use server"

import { getSessionContext } from "@/lib/actions"
import { listGroupIndividualNotes, type IndividualNoteRecord } from "@/lib/group-notes"
import { createClient } from "@/lib/supabase/server"

export async function resetStudentIndividualNote(
  groupId: string,
  userId: string
): Promise<{ ok: true; notes: IndividualNoteRecord[] } | { ok: false; error: string }> {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false, error: session.error }
  if (session.ctx.role !== "teacher") return { ok: false, error: "Only a teacher can reset a note." }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) {
    return { ok: false, error: "That group could not be found." }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return { ok: false, error: "That student could not be found." }
  }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_reset_student_note", { p_group_id: groupId, p_user_id: userId })
  if (result.error) {
    const missing = result.error.code === "PGRST202" || /conet_reset_student_note/i.test(result.error.message || "")
    return {
      ok: false,
      error: missing
        ? "Run supabase/conet-reset-student-note.sql in the Supabase SQL editor, then try again."
        : "Could not reset this student's note.",
    }
  }

  const notes = await listGroupIndividualNotes(groupId)
  return { ok: true, notes: notes.notes }
}
