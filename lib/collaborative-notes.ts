"use server"

import { revalidatePath } from "next/cache"
import { getSessionContext } from "@/lib/actions"
import { createClient } from "@/lib/supabase/server"

export type CollaborativeNote = {
  id: string
  group_id: string
  owner_id: string
  title: string
  content: string
  is_pinned: boolean
  is_archived: boolean
  is_deleted: boolean
  last_edited_by: string | null
  created_at: string
  updated_at: string
}

async function requireGroupMember(groupId: string) {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (!session.ctx.groupId || session.ctx.groupId !== groupId) {
    return { ok: false as const, error: "Unauthorized" }
  }
  return { ok: true as const, ctx: session.ctx }
}

export async function listCollaborativeNotes(groupId: string) {
  const auth = await requireGroupMember(groupId)
  if (!auth.ok) return { ok: false as const, error: auth.error, notes: [] as CollaborativeNote[] }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ConetCollaborativeNotes")
    .select(
      "id, group_id, owner_id, title, content, is_pinned, is_archived, is_deleted, last_edited_by, created_at, updated_at"
    )
    .eq("group_id", groupId)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })

  if (error) return { ok: false as const, error: error.message, notes: [] as CollaborativeNote[] }
  return { ok: true as const, notes: (data || []) as CollaborativeNote[] }
}

/** One shared document per group. Reuses the earliest session so everyone lands in the same room. */
export async function ensureCollaborativeNote(groupId: string) {
  const listed = await listCollaborativeNotes(groupId)
  if (!listed.ok) return { ok: false as const, error: listed.error }
  if (listed.notes.length > 0) {
    const canonical = [...listed.notes].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    return { ok: true as const, note: canonical }
  }
  return createCollaborativeNote(groupId, "Group document")
}

export async function createCollaborativeNote(groupId: string, title: string) {
  const auth = await requireGroupMember(groupId)
  if (!auth.ok) return { ok: false as const, error: auth.error }

  const cleaned = title.trim() || "Untitled Documentation"
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ConetCollaborativeNotes")
    .insert({
      group_id: groupId,
      owner_id: auth.ctx.profileId,
      title: cleaned,
      content: "",
      last_edited_by: auth.ctx.profileId,
    })
    .select(
      "id, group_id, owner_id, title, content, is_pinned, is_archived, is_deleted, last_edited_by, created_at, updated_at"
    )
    .single()

  if (error || !data) return { ok: false as const, error: error?.message || "Failed to create document" }
  revalidatePath("/")
  return { ok: true as const, note: data as CollaborativeNote }
}

export async function updateCollaborativeNote(
  noteId: string,
  patch: Partial<Pick<CollaborativeNote, "title" | "content" | "is_pinned" | "is_archived" | "is_deleted">>
) {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (!session.ctx.groupId) return { ok: false as const, error: "Unauthorized" }

  const supabase = await createClient()
  const existing = await supabase
    .from("ConetCollaborativeNotes")
    .select("id, group_id")
    .eq("id", noteId)
    .maybeSingle()

  if (existing.error || !existing.data) return { ok: false as const, error: "Document not found" }
  if (existing.data.group_id !== session.ctx.groupId) return { ok: false as const, error: "Unauthorized" }

  const { data, error } = await supabase
    .from("ConetCollaborativeNotes")
    .update({
      ...patch,
      last_edited_by: session.ctx.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select(
      "id, group_id, owner_id, title, content, is_pinned, is_archived, is_deleted, last_edited_by, created_at, updated_at"
    )
    .single()

  if (error || !data) return { ok: false as const, error: error?.message || "Failed to update document" }
  return { ok: true as const, note: data as CollaborativeNote }
}

export async function deleteCollaborativeNote(noteId: string) {
  return updateCollaborativeNote(noteId, { is_deleted: true })
}
