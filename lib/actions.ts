"use server"

import { cache } from "react"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "./supabase/server"
import {
  AGENT_OPENING_MESSAGE,
  NATE_THINKING,
  NATE_USER_ID,
  figureDataUrls,
  mentionsNATE,
  stripFigures,
  normalizeNateMode,
  type NateMode,
} from "./nate"
import { loadAgentContext, requestNateReply } from "./agent-reply"
import { loadNateSessionMaterials } from "./nate-session-materials"

import { mapMessageRows, type Message, type RawMessage } from "./map-messages"
import { inGroup } from "./session-membership"

export type { Message }

export interface GroupMember {
  id: string
  name: string
  avatar_url?: string | null
  role: string
}

export interface SessionMembership {
  groupId: string
  groupName: string
  newintervene: NateMode
}

export interface SessionContext {
  profileId: string
  name: string
  email: string | null
  role: "teacher" | "student" | "ai"
  groupId: string | null
  groupName: string | null
  newintervene: NateMode
  memberships: SessionMembership[]
  groupIds: string[]
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

export const getSessionContext = cache(async (): Promise<
  { ok: true; ctx: SessionContext; members: GroupMember[] } | { ok: false; error: string; needsSetup?: boolean }
> => {
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

  const membership = await supabase
    .from("ConetGroupMembers")
    .select("group_id, created_at, ConetGroups(id, name, newintervene)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true })

  if (membership.error) {
    if (missingTable(membership.error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "Chat groups are not in Supabase yet. Run supabase/conet-sessions.sql in the SQL editor, then refresh.",
      }
    }
    return { ok: false, error: membership.error.message }
  }

  type MembershipQueryRow = {
    group_id: string
    ConetGroups:
      | { id: string; name: string; newintervene: number }
      | { id: string; name: string; newintervene: number }[]
      | null
  }

  const memberships: SessionMembership[] = ((membership.data || []) as MembershipQueryRow[]).flatMap((row) => {
    const embedded = Array.isArray(row.ConetGroups) ? row.ConetGroups[0] : row.ConetGroups
    const groupId = embedded?.id || row.group_id
    if (!groupId) return []
    return [
      {
        groupId,
        groupName: embedded?.name || "Group",
        newintervene: normalizeNateMode(embedded?.newintervene),
      },
    ]
  })
  const first = memberships[0] ?? null

  return {
    ok: true,
    ctx: {
      profileId: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      groupId: first?.groupId ?? null,
      groupName: first?.groupName ?? null,
      newintervene: first?.newintervene ?? normalizeNateMode(null),
      memberships,
      groupIds: memberships.map((item) => item.groupId),
    },
    members: [],
  }
})

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

function rpcMissing(error: { message?: string } | null | undefined) {
  return /does not exist|schema cache|42883/i.test(error?.message || "")
}

/** Posts Remy's one-time welcome in an empty chat when AI is enabled (modes 1–2). */
export async function ensureAgentOpeningMessage(
  groupId: string,
  sessionId: string
): Promise<{ posted: boolean }> {
  const session = await getSessionContext()
  if (!session.ok) return { posted: false }

  const isTeacher = session.ctx.role === "teacher"
  const mine = session.ctx.memberships.find((item) => item.groupId === groupId)
  if (!isTeacher && !mine) return { posted: false }

  const supabase = await createClient()
  let mode = normalizeNateMode(mine?.newintervene ?? session.ctx.newintervene)
  if (isTeacher) {
    const group = await supabase.from("ConetGroups").select("newintervene").eq("id", groupId).maybeSingle()
    if (group.data) mode = normalizeNateMode(group.data.newintervene)
  }
  if (mode === 3) return { posted: false }

  const rpc = await supabase.rpc("conet_ensure_agent_opening", {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_content: AGENT_OPENING_MESSAGE,
  })
  if (!rpc.error) return { posted: Boolean(rpc.data) }

  if (!rpcMissing(rpc.error)) {
    console.error("ensureAgentOpeningMessage rpc failed", rpc.error)
    return { posted: false }
  }

  const existing = await supabase
    .from("ConetMessages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", NATE_USER_ID)
    .like("content", "Hi everyone, I'm%")
    .limit(1)
  if (existing.data && existing.data.length > 0) return { posted: false }

  const posted = await supabase.rpc("conet_post_nate_message", {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_content: AGENT_OPENING_MESSAGE,
  })
  if (posted.error) {
    console.error("ensureAgentOpeningMessage fallback failed", posted.error)
    return { posted: false }
  }
  return { posted: true }
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
  const mine = session.ctx.memberships.find((item) => item.groupId === groupId)
  if (session.ctx.role !== "student" || !mine) {
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
  if (!trigger || mine.newintervene === 3) {
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
  const mine = session.ctx.memberships.find((item) => item.groupId === groupId)
  if (session.ctx.role !== "student" || !mine) return { error: "Unauthorized" }
  if (mine.newintervene === 3) return { success: true }

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

  const [recent, materials] = await Promise.all([
    supabase
      .from("ConetMessages")
      .select("content, user_id, created_at, ConetUsers(name)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(30),
    loadNateSessionMaterials(supabase, groupId),
  ])

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
  const attached = latestUser ? figureDataUrls(latestUser.content)[0] : undefined
  const asksAboutFigure = /\b(figure|image|picture|photo|diagram|chart|graph|screenshot)\b/i.test(
    stripFigures(latestUser?.content || "")
  )
  const earlierFigure = attached
    ? attached
    : asksAboutFigure
      ? [...history].reverse().flatMap((row) => figureDataUrls(row.content))[0]
      : undefined
  const agentContext = await loadAgentContext(supabase, groupId, materials.text || undefined)
  const reply = await requestNateReply(
    history,
    latestUser?.content || "Please join our discussion.",
    mine.newintervene,
    earlierFigure ? [earlierFigure] : [],
    materials,
    agentContext
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
    if (direct.error) return { error: "Remy could not reply just now." }
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
  if (!inGroup(session.ctx, groupId)) return { error: "Unauthorized" }

  const supabase = await createClient()
  const existing = await supabase
    .from("ConetDocuments")
    .select("id, content")
    .eq("group_id", groupId)
    .eq("user_id", session.ctx.profileId)
    .maybeSingle()

  if (isStaleWrite(existing.data?.content as string | undefined, content)) return { success: true }

  const locks = await loadSubmittedLocks(supabase, existing.data?.id as string | undefined)
  const lockedContent = applyNoteLocks(content, locks)

  let documentId = existing.data?.id as string | undefined
  if (!documentId) {
    const created = await supabase
      .from("ConetDocuments")
      .insert({ group_id: groupId, user_id: session.ctx.profileId, content: lockedContent })
      .select("id")
      .single()
    if (created.error || !created.data) return { error: "Failed to save snapshot, please try again." }
    documentId = created.data.id
  } else {
    const updated = await supabase
      .from("ConetDocuments")
      .update({ content: lockedContent, updated_at: new Date().toISOString() })
      .eq("id", documentId)
    if (updated.error) return { error: "Failed to save snapshot, please try again." }
  }

  const history = await supabase.from("ConetDocumentHistory").insert({
    document_id: documentId,
    user_id: session.ctx.profileId,
    content: lockedContent,
    is_submit: false,
  })
  if (history.error) return { error: "Failed to save snapshot, please try again." }

  return { success: true }
}

export type NotePart = "thoughts" | "insights"

export async function submitFinalDocument(groupId: string, content?: string, part?: NotePart) {
  const session = await getSessionContext()
  if (!session.ok) return { error: session.error }
  if (!inGroup(session.ctx, groupId)) return { error: "Unauthorized" }
  if (part && part !== "thoughts" && part !== "insights") return { error: "Unknown part." }

  if (!part) return { error: "Choose a part to submit." }

  const supabase = await createClient()
  const payload = typeof content === "string" ? content : null
  const existing = await supabase
    .from("ConetDocuments")
    .select("id, content")
    .eq("group_id", groupId)
    .eq("user_id", session.ctx.profileId)
    .maybeSingle()

  if (!payload && !existing.data) return { error: "Write something before submitting." }
  if (payload && isStaleWrite(existing.data?.content as string | undefined, payload)) {
    return { error: "This note was reset. Refresh the page and start again." }
  }
  const locks = await loadSubmittedLocks(supabase, existing.data?.id as string | undefined)
  if (part === "thoughts" && locks.thoughts !== null) return { error: "Initial thoughts are already submitted." }
  if (part === "insights" && locks.thoughts === null) return { error: "Submit your initial thoughts first." }
  if (part === "insights" && locks.insights !== null) return { error: "New insights are already submitted." }

  let contentToSubmit = applyNoteLocks(payload ?? (existing.data?.content as string), locks)
  const fields = readNoteFields(contentToSubmit)
  if (part === "thoughts" && !fields.concept1.trim()) return { error: "Write your initial thoughts before submitting." }
  if (part === "insights" && !fields.concept2.trim()) return { error: "Write your new insights before submitting." }
  contentToSubmit = withSubmittedPart(contentToSubmit, part)

  const createdAt = new Date().toISOString()
  let documentId = existing.data?.id as string | undefined
  if (!documentId) {
    const created = await supabase
      .from("ConetDocuments")
      .insert({
        group_id: groupId,
        user_id: session.ctx.profileId,
        content: contentToSubmit,
        updated_at: createdAt,
      })
      .select("id")
      .single()
    if (created.error || !created.data) return { error: "Failed to submit, please try again." }
    documentId = created.data.id
  }

  const historyInsert = supabase
    .from("ConetDocumentHistory")
    .insert({
      document_id: documentId,
      user_id: session.ctx.profileId,
      content: contentToSubmit,
      is_submit: true,
      created_at: createdAt,
    })
    .select("id")
    .single()
  const documentUpdate = existing.data?.id
    ? supabase
        .from("ConetDocuments")
        .update({ content: contentToSubmit, updated_at: createdAt })
        .eq("id", documentId)
    : Promise.resolve({ error: null })
  const [history, updated] = await Promise.all([historyInsert, documentUpdate])
  if (updated.error || history.error || !history.data) return { error: "Failed to submit, please try again." }

  const submitted = readNoteFields(contentToSubmit)
  return {
    success: true as const,
    message: "Document submitted successfully!",
    submission: {
      id: history.data.id as string,
      concept1: submitted.concept1,
      concept2: submitted.concept2,
      part: submitted.part,
      createdAt,
    },
  }
}

export async function listMyNoteSubmissions(groupId: string): Promise<{
  submissions: { id: string; concept1: string; concept2: string; part: NotePart | "both"; createdAt: string }[]
  draft: { concept1: string; concept2: string; savedAt: string } | null
  error?: string
}> {
  const session = await getSessionContext()
  if (!session.ok) return { submissions: [], draft: null, error: session.error }
  if (!inGroup(session.ctx, groupId)) return { submissions: [], draft: null, error: "Unauthorized" }

  const supabase = await createClient()
  const doc = await supabase
    .from("ConetDocuments")
    .select("id, content")
    .eq("group_id", groupId)
    .eq("user_id", session.ctx.profileId)
    .maybeSingle()
  if (!doc.data) return { submissions: [], draft: null }

  const history = await supabase
    .from("ConetDocumentHistory")
    .select("id, content, created_at")
    .eq("document_id", doc.data.id)
    .eq("is_submit", true)
    .order("created_at", { ascending: false })
  if (history.error || !history.data) return { submissions: [], draft: null, error: "Could not load previous submissions." }

  const live = readNoteFields(doc.data.content as string)
  let savedAt = ""
  try {
    const parsed = JSON.parse(doc.data.content as string) as { savedAt?: string }
    savedAt = parsed?.savedAt || ""
  } catch {
    savedAt = ""
  }

  return {
    draft: { concept1: live.concept1, concept2: live.concept2, savedAt },
    submissions: history.data.map((row) => {
      const fields = readNoteFields(row.content as string)
      return {
        id: row.id as string,
        concept1: fields.concept1,
        concept2: fields.concept2,
        part: fields.part,
        createdAt: row.created_at as string,
      }
    }),
  }
}

async function loadSubmittedLocks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string | undefined
) {
  const locks: { thoughts: string | null; insights: string | null } = { thoughts: null, insights: null }
  if (!documentId) return locks
  const history = await supabase
    .from("ConetDocumentHistory")
    .select("content")
    .eq("document_id", documentId)
    .eq("is_submit", true)
    .order("created_at", { ascending: false })
    .limit(4)
  if (history.error || !history.data) return locks
  for (const row of history.data) {
    const fields = readNoteFields(row.content as string)
    if (locks.thoughts === null && fields.part !== "insights") locks.thoughts = fields.concept1
    if (locks.insights === null && fields.part !== "thoughts") locks.insights = fields.concept2
  }
  return locks
}

function applyNoteLocks(raw: string, locks: { thoughts: string | null; insights: string | null }) {
  const fields = readNoteFields(raw)
  let savedAt = ""
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    savedAt = parsed?.savedAt || ""
  } catch {
    savedAt = ""
  }
  const concept1 = locks.thoughts === null ? fields.concept1 : locks.thoughts || fields.concept1
  const concept2 = locks.insights === null ? fields.concept2 : locks.insights || fields.concept2
  return JSON.stringify({
    field1: concept1,
    field2: concept2,
    part1_concept1: concept1,
    part1_concept2: concept2,
    savedAt: savedAt || new Date().toISOString(),
  })
}

function savedStamp(raw: string | null | undefined) {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { savedAt?: string }
    return Date.parse(parsed?.savedAt || "") || 0
  } catch {
    return 0
  }
}

function isStaleWrite(current: string | null | undefined, incoming: string) {
  const currentStamp = savedStamp(current)
  const incomingStamp = savedStamp(incoming)
  return Boolean(currentStamp && incomingStamp && incomingStamp < currentStamp)
}

function notePart(value: unknown): NotePart | "both" {
  return value === "thoughts" || value === "insights" ? value : "both"
}

function readNoteFields(raw: string | null | undefined): { concept1: string; concept2: string; part: NotePart | "both" } {
  if (!raw) return { concept1: "", concept2: "", part: "both" }
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    if (!parsed || typeof parsed !== "object") return { concept1: raw, concept2: "", part: "both" }
    return {
      concept1: parsed.part1_concept1 || parsed.field1 || "",
      concept2: parsed.part1_concept2 || parsed.field2 || "",
      part: notePart(parsed.submittedPart),
    }
  } catch {
    return { concept1: raw, concept2: "", part: "both" }
  }
}

function withSubmittedPart(raw: string, part: NotePart) {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    if (parsed && typeof parsed === "object") return JSON.stringify({ ...parsed, submittedPart: part })
  } catch {
    // Plain text drafts are wrapped so the submitted part is still recorded.
  }
  const fields = readNoteFields(raw)
  return JSON.stringify({
    field1: fields.concept1,
    field2: fields.concept2,
    part1_concept1: fields.concept1,
    part1_concept2: fields.concept2,
    submittedPart: part,
  })
}

export async function updateGroupNewIntervention(groupId: string, newintervene: number) {
  const session = await getSessionContext()
  if (!session.ok) return { success: false, error: session.error }
  if (session.ctx.role !== "teacher") return { success: false, error: "Only a teacher can change the AI mode." }
  const mode = normalizeNateMode(newintervene)
  if (![1, 2, 3].includes(newintervene)) return { success: false, error: "Unknown mode." }

  const supabase = await createClient()
  const updated = await supabase.from("ConetGroups").update({ newintervene: mode }).eq("id", groupId)
  if (updated.error) return { success: false, error: "Failed to update the AI mode." }
  revalidatePath("/")
  return { success: true }
}
