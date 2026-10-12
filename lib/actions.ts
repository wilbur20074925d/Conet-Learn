"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "./supabase/server"
import {
  NATE_THINKING,
  NATE_USER_ID,
  mentionsNATE,
  normalizeNateMode,
  requestNateReply,
  type NateMode,
} from "./nate"

import { mapMessageRows, type Message, type RawMessage } from "./map-messages"

export type { Message }

export interface GroupMember {
  id: string
  name: string
  avatar_url?: string | null
  role: string
}

export interface SessionContext {
  profileId: string
  name: string
  email: string | null
  role: "teacher" | "student" | "ai"
  groupId: string | null
  groupName: string | null
  newintervene: NateMode
}

type ProfileRow = {
  id: string
  email: string | null
  name: string
  role: "teacher" | "student" | "ai"
  avatar_url: string | null
  auth_id: string | null
}

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === "PGRST205" || error.code === "42P01" || /Conet/i.test(error.message || "") && /schema cache|does not exist/i.test(error.message || "")
}

export async function getSessionContext(): Promise<
  { ok: true; ctx: SessionContext; members: GroupMember[] } | { ok: false; error: string; needsSetup?: boolean }
> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return { ok: false, error: "Unauthorized" }

  const user = authData.user
  let profile: ProfileRow | null = null
  const profileQuery = await supabase
    .from("ConetUsers")
    .select("id, email, name, role, avatar_url, auth_id")
    .eq("auth_id", user.id)
    .maybeSingle()

  if (profileQuery.error) {
    if (missingTable(profileQuery.error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "The Conet tables are not in Supabase yet. Run supabase/conet-schema.sql in the SQL editor, then sign in again.",
      }
    }
    return { ok: false, error: profileQuery.error.message }
  }

  profile = profileQuery.data

  if (!profile) {
    const role = user.user_metadata?.role === "teacher" ? "teacher" : "student"
    const inserted = await supabase
      .from("ConetUsers")
      .insert({
        auth_id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split("@")[0] || "Student",
        role,
      })
      .select("id, email, name, role, avatar_url, auth_id")
      .single()
    if (inserted.error || !inserted.data) {
      return { ok: false, error: inserted.error?.message || "Could not create your profile." }
    }
    profile = inserted.data
  }

  const sessionsProbe = await supabase.from("ConetSessions").select("id").limit(1)
  if (sessionsProbe.error) {
    const probeMessage = sessionsProbe.error.message || ""
    const missing =
      missingTable(sessionsProbe.error) ||
      sessionsProbe.error.code === "PGRST202" ||
      sessionsProbe.error.code === "42703" ||
      /ConetSessions|session_id/i.test(probeMessage)
    if (missing) {
      return {
        ok: false,
        needsSetup: true,
        error: "Chat groups are not in Supabase yet. Run supabase/conet-sessions.sql in the SQL editor, then refresh.",
      }
    }
    return { ok: false, error: sessionsProbe.error.message }
  }

  const membership = await supabase
    .from("ConetGroupMembers")
    .select("group_id, created_at, ConetGroups(id, name, newintervene)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membership.error) return { ok: false, error: membership.error.message }

  const membershipRow = membership.data as {
    group_id: string
    ConetGroups:
      | { id: string; name: string; newintervene: number }
      | { id: string; name: string; newintervene: number }[]
      | null
  } | null
  const embedded = membershipRow
    ? Array.isArray(membershipRow.ConetGroups)
      ? membershipRow.ConetGroups[0]
      : membershipRow.ConetGroups
    : null
  const groupId = embedded?.id || membershipRow?.group_id || null

  const members: GroupMember[] = []
  if (groupId) {
    const membersQuery = await supabase
      .from("ConetGroupMembers")
      .select("user_id, ConetUsers(id, name, avatar_url, role)")
      .eq("group_id", groupId)

    if (!membersQuery.error && membersQuery.data) {
      for (const row of membersQuery.data as Array<{ ConetUsers: GroupMember | GroupMember[] | null }>) {
        const person = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
        if (person && person.role !== "ai") members.push(person)
      }
    }
  }

  return {
    ok: true,
    ctx: {
      profileId: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      groupId,
      groupName: embedded?.name || null,
      newintervene: normalizeNateMode(embedded?.newintervene),
    },
    members,
  }
}

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ConetMessages")
    .select("id, content, created_at, user_id, reply_to, is_reply, ConetUsers(name, avatar_url, role)")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })

  if (error || !data) return []
  return mapMessageRows(data as RawMessage[])
}

const messageSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty"),
  groupId: z.string().uuid(),
  sessionId: z.string().uuid(),
  replyTo: z.string().uuid().optional().or(z.literal("")),
})

async function shouldTriggerNate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  message: string,
  replyTo?: string | null
) {
  if (mentionsNATE(message)) return true
  if (!replyTo) return false
  const replied = await supabase.from("ConetMessages").select("user_id").eq("id", replyTo).maybeSingle()
  return replied.data?.user_id === NATE_USER_ID
}

export async function sendMessage(_prevState: unknown, formData: FormData) {
  const session = await getSessionContext()
  if (!session.ok) return { error: session.error }

  const parsed = messageSchema.safeParse({
    message: formData.get("message"),
    groupId: formData.get("groupId"),
    sessionId: formData.get("sessionId"),
    replyTo: formData.get("replyTo") || undefined,
  })
  if (!parsed.success) return { error: "Invalid input." }

  const { message, groupId, sessionId } = parsed.data
  const replyTo = parsed.data.replyTo || null
  if (session.ctx.role !== "student" || !session.ctx.groupId || groupId !== session.ctx.groupId) {
    return { error: "Unauthorized" }
  }

  const supabase = await createClient()
  const inserted = await supabase.rpc("conet_send_message", {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_content: message,
    p_reply_to: replyTo,
  })

  if (inserted.error) {
    // Fallback for installs that have not run the RPC migration yet.
    const direct = await supabase
      .from("ConetMessages")
      .insert({
        group_id: groupId,
        session_id: sessionId,
        user_id: session.ctx.profileId,
        content: message,
        reply_to: replyTo,
        is_reply: Boolean(replyTo),
      })
      .select("id")
      .single()

    if (direct.error) {
      console.error("sendMessage failed", inserted.error, direct.error)
      return { error: "Failed to send message, please try again." }
    }
  }

  const trigger = await shouldTriggerNate(supabase, message, replyTo)
  if (!trigger || session.ctx.newintervene === 3) {
    return { success: true as const, thinkingId: null as string | null }
  }

  const thinking = await supabase.rpc("conet_post_nate_message", {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_content: NATE_THINKING,
  })

  let thinkingId: string | null = typeof thinking.data === "string" ? thinking.data : null
  if (thinking.error || !thinkingId) {
    const directThinking = await supabase
      .from("ConetMessages")
      .insert({
        group_id: groupId,
        session_id: sessionId,
        user_id: NATE_USER_ID,
        content: NATE_THINKING,
        is_reply: false,
      })
      .select("id")
      .single()
    thinkingId = directThinking.data?.id ?? null
  }

  return { success: true as const, thinkingId }
}

export async function finishNateReply(groupId: string, sessionId: string, thinkingId: string) {
  const session = await getSessionContext()
  if (!session.ok) return { error: session.error }
  if (session.ctx.role !== "student" || session.ctx.groupId !== groupId) return { error: "Unauthorized" }
  if (session.ctx.newintervene === 3) return { success: true }

  const supabase = await createClient()
  const chat = await supabase.from("ConetSessions").select("id, group_id").eq("id", sessionId).maybeSingle()
  if (!chat.data || chat.data.group_id !== groupId) return { error: "Unauthorized" }

  const thinking = await supabase
    .from("ConetMessages")
    .select("id, content, created_at")
    .eq("id", thinkingId)
    .eq("session_id", sessionId)
    .maybeSingle()

  if (!thinking.data || thinking.data.content !== NATE_THINKING) return { success: true }

  const later = await supabase
    .from("ConetMessages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", NATE_USER_ID)
    .neq("content", NATE_THINKING)
    .gt("created_at", thinking.data.created_at)
    .limit(1)

  if (later.data && later.data.length > 0) return { success: true }

  const recent = await supabase
    .from("ConetMessages")
    .select("content, user_id, created_at, ConetUsers(name)")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(10)

  const history = ((recent.data || []) as Array<{
    content: string
    user_id: string
    ConetUsers: { name: string } | { name: string }[] | null
  }>)
    .reverse()
    .map((row) => {
      const author = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
      return {
        user_id: row.user_id,
        name: author?.name || "Member",
        content: row.content,
      }
    })

  const latestUser = [...history].reverse().find((row) => row.user_id !== NATE_USER_ID)
  const reply = await requestNateReply(
    history,
    latestUser?.content || "Please join our discussion.",
    session.ctx.newintervene
  )

  if (!reply) return { success: true }

  const saved = await supabase.rpc("conet_post_nate_message", {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_content: reply,
  })

  if (saved.error) {
    const direct = await supabase.from("ConetMessages").insert({
      group_id: groupId,
      session_id: sessionId,
      user_id: NATE_USER_ID,
      content: reply,
      is_reply: false,
    })
    if (direct.error) return { error: "NATE could not reply just now." }
  }
  revalidatePath("/")
  return { success: true }
}

export async function getDocument(groupId: string, profileId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("ConetDocuments")
    .select("content")
    .eq("group_id", groupId)
    .eq("user_id", profileId)
    .maybeSingle()
  return data?.content ?? ""
}

export async function saveDocumentSnapshot(content: string | null | undefined, groupId: string) {
  const session = await getSessionContext()
  if (!session.ok) return { error: session.error }
  if (content === null || content === undefined) return { error: "Invalid content." }
  if (!session.ctx.groupId || groupId !== session.ctx.groupId) return { error: "Unauthorized" }

  const supabase = await createClient()
  const existing = await supabase
    .from("ConetDocuments")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", session.ctx.profileId)
    .maybeSingle()

  let documentId = existing.data?.id as string | undefined
  if (!documentId) {
    const created = await supabase
      .from("ConetDocuments")
      .insert({ group_id: groupId, user_id: session.ctx.profileId, content })
      .select("id")
      .single()
    if (created.error || !created.data) return { error: "Failed to save snapshot, please try again." }
    documentId = created.data.id
  } else {
    const updated = await supabase
      .from("ConetDocuments")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", documentId)
    if (updated.error) return { error: "Failed to save snapshot, please try again." }
  }

  const history = await supabase.from("ConetDocumentHistory").insert({
    document_id: documentId,
    user_id: session.ctx.profileId,
    content,
    is_submit: false,
  })
  if (history.error) return { error: "Failed to save snapshot, please try again." }

  return { success: true }
}

export async function submitFinalDocument(groupId: string) {
  const session = await getSessionContext()
  if (!session.ok) return { error: session.error }
  if (!session.ctx.groupId || groupId !== session.ctx.groupId) return { error: "Unauthorized" }

  const supabase = await createClient()
  const doc = await supabase
    .from("ConetDocuments")
    .select("id, content")
    .eq("group_id", groupId)
    .eq("user_id", session.ctx.profileId)
    .maybeSingle()

  if (!doc.data) return { error: "Document not found. Write something before submitting." }

  const latest = await supabase
    .from("ConetDocumentHistory")
    .select("content")
    .eq("document_id", doc.data.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const contentToSubmit = latest.data?.content ?? doc.data.content
  const updated = await supabase
    .from("ConetDocuments")
    .update({ content: contentToSubmit, updated_at: new Date().toISOString() })
    .eq("id", doc.data.id)
  if (updated.error) return { error: "Failed to submit document, please try again." }

  const history = await supabase.from("ConetDocumentHistory").insert({
    document_id: doc.data.id,
    user_id: session.ctx.profileId,
    content: contentToSubmit,
    is_submit: true,
  })
  if (history.error) return { error: "Failed to submit document, please try again." }

  revalidatePath("/")
  return { success: true, message: "Document submitted successfully!" }
}

export async function updateGroupNewIntervention(groupId: string, newintervene: number) {
  const session = await getSessionContext()
  if (!session.ok) return { success: false, error: session.error }
  if (session.ctx.role !== "teacher") return { success: false, error: "Only a teacher can change NATE's mode." }
  const mode = normalizeNateMode(newintervene)
  if (![1, 2, 3].includes(newintervene)) return { success: false, error: "Unknown mode." }

  const supabase = await createClient()
  const updated = await supabase.from("ConetGroups").update({ newintervene: mode }).eq("id", groupId)
  if (updated.error) return { success: false, error: "Failed to update NATE's mode." }
  revalidatePath("/")
  return { success: true }
}
