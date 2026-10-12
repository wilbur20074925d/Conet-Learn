"use server"

import { getSessionContext } from "@/lib/actions"
import { inGroup } from "@/lib/session-membership"
import { createClient } from "@/lib/supabase/server"

export type GroupPostSubmission = {
  id: string
  title: string
  html: string
  createdAt: string
  authorId: string
  authorName: string
}

async function canRead(groupId: string) {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role === "teacher" || inGroup(session.ctx, groupId)) {
    return { ok: true as const, ctx: session.ctx }
  }
  return { ok: false as const, error: "Unauthorized" }
}

export async function listGroupPostSubmissions(groupId: string): Promise<{
  submissions: GroupPostSubmission[]
  error?: string
}> {
  const auth = await canRead(groupId)
  if (!auth.ok) return { submissions: [], error: auth.error }

  const supabase = await createClient()
  const rows = await supabase
    .from("ConetGroupPostSubmissions")
    .select("id, title, content, created_at, user_id")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })

  if (rows.error) {
    const missing = /ConetGroupPostSubmissions|schema cache|does not exist/i.test(rows.error.message)
    return {
      submissions: [],
      error: missing
        ? "Group post submissions are not in the database yet. Run supabase/conet-group-post-submissions.sql in the Supabase SQL editor."
        : "Could not load submissions.",
    }
  }

  const userIds = [...new Set((rows.data || []).map((row) => row.user_id as string))]
  const names = new Map<string, string>()
  if (userIds.length > 0) {
    const people = await supabase.from("ConetUsers").select("id, name").in("id", userIds)
    for (const person of people.data || []) names.set(person.id as string, person.name as string)
  }

  return {
    submissions: (rows.data || []).map((row) => ({
      id: row.id as string,
      title: (row.title as string) || "Group document",
      html: (row.content as string) || "",
      createdAt: row.created_at as string,
      authorId: row.user_id as string,
      authorName: names.get(row.user_id as string) || "Student",
    })),
  }
}

export async function submitGroupPost(input: {
  groupId: string
  noteId: string
  title: string
  html: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false, error: session.error }
  if (!inGroup(session.ctx, input.groupId)) return { ok: false, error: "Only a group member can submit this post." }

  const text = input.html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim()
  if (!text) return { ok: false, error: "Write something in the group post before submitting." }

  const supabase = await createClient()
  const inserted = await supabase.from("ConetGroupPostSubmissions").insert({
    group_id: input.groupId,
    note_id: input.noteId,
    user_id: session.ctx.profileId,
    title: input.title.trim() || "Group document",
    content: input.html,
  })

  if (inserted.error) {
    const missing = /ConetGroupPostSubmissions|schema cache|does not exist/i.test(inserted.error.message)
    return {
      ok: false,
      error: missing
        ? "Group post submissions are not in the database yet. Run supabase/conet-group-post-submissions.sql in the Supabase SQL editor."
        : "Could not submit the group post.",
    }
  }

  return { ok: true }
}
