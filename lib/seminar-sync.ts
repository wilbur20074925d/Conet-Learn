import type { SupabaseClient } from "@supabase/supabase-js"
import { NATE_THINKING, NATE_USER_ID, mentionsNATE } from "./nate"
import { mapMessageRows, type Message, type RawMessage } from "./map-messages"

export const MESSAGE_COLUMNS =
  "id, content, created_at, user_id, reply_to, is_reply, ConetUsers(name, avatar_url, role)"

export const ONLINE_WINDOW_MS = 35_000

export type SessionUser = {
  id: string
  name: string
  lastSeen: number
}

export type SendMessageResult =
  | { ok: true; messageId: string; thinkingId: string | null }
  | { ok: false; error: string }

export async function fetchGroupMessages(supabase: SupabaseClient, groupId: string): Promise<Message[] | null> {
  const { data, error } = await supabase
    .from("ConetMessages")
    .select(MESSAGE_COLUMNS)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })

  if (error || !data) return null
  return mapMessageRows(data as RawMessage[])
}

export async function fetchMessageById(supabase: SupabaseClient, messageId: string): Promise<RawMessage | null> {
  const { data, error } = await supabase
    .from("ConetMessages")
    .select(MESSAGE_COLUMNS)
    .eq("id", messageId)
    .maybeSingle()

  if (error || !data) return null
  return data as RawMessage
}

type PresenceRow = {
  user_id: string
  last_seen: string
  ConetUsers: { id: string; name: string; role: string } | { id: string; name: string; role: string }[] | null
}

export async function fetchSessionUsers(supabase: SupabaseClient, groupId: string): Promise<SessionUser[] | null> {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from("ConetPresence")
    .select("user_id, last_seen, ConetUsers(id, name, role)")
    .eq("group_id", groupId)
    .gte("last_seen", since)

  if (error) return null

  const users: SessionUser[] = []
  for (const row of (data || []) as PresenceRow[]) {
    const person = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
    if (!person || person.role === "ai") continue
    users.push({
      id: row.user_id,
      name: person.name || "Member",
      lastSeen: new Date(row.last_seen).getTime(),
    })
  }
  return users
}

export async function touchPresence(supabase: SupabaseClient, groupId: string, userId: string) {
  const rpc = await supabase.rpc("conet_touch_presence", { p_group_id: groupId })
  if (!rpc.error) return true

  const upsert = await supabase.from("ConetPresence").upsert(
    {
      group_id: groupId,
      user_id: userId,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "group_id,user_id" }
  )
  return !upsert.error
}

async function insertUserMessage(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
  content: string,
  replyTo: string | null
) {
  const rpc = await supabase.rpc("conet_send_message", {
    p_group_id: groupId,
    p_content: content,
    p_reply_to: replyTo,
  })
  if (!rpc.error && typeof rpc.data === "string") {
    return { id: rpc.data as string, error: null as string | null }
  }

  const direct = await supabase
    .from("ConetMessages")
    .insert({
      group_id: groupId,
      user_id: userId,
      content,
      reply_to: replyTo,
      is_reply: Boolean(replyTo),
    })
    .select("id")
    .single()

  if (direct.error || !direct.data) {
    return { id: null as string | null, error: direct.error?.message || rpc.error?.message || "Failed to send" }
  }
  return { id: direct.data.id as string, error: null as string | null }
}

async function insertNateThinking(supabase: SupabaseClient, groupId: string) {
  const rpc = await supabase.rpc("conet_post_nate_message", {
    p_group_id: groupId,
    p_content: NATE_THINKING,
  })
  if (!rpc.error && typeof rpc.data === "string") return rpc.data as string

  const direct = await supabase
    .from("ConetMessages")
    .insert({
      group_id: groupId,
      user_id: NATE_USER_ID,
      content: NATE_THINKING,
      is_reply: false,
    })
    .select("id")
    .single()

  return direct.data?.id ?? null
}

/** Fast browser-side send. Does not wait for NATE's full reply. */
export async function sendGroupMessage(
  supabase: SupabaseClient,
  options: {
    groupId: string
    userId: string
    content: string
    replyTo?: string | null
    replyTargetsNate?: boolean
    nateMode: number
  }
): Promise<SendMessageResult> {
  const content = options.content.trim()
  if (!content) return { ok: false, error: "Message cannot be empty" }

  const replyTo = options.replyTo || null
  const inserted = await insertUserMessage(supabase, options.groupId, options.userId, content, replyTo)
  if (!inserted.id) return { ok: false, error: inserted.error || "Failed to send message" }

  const trigger =
    options.nateMode !== 3 && (mentionsNATE(content) || Boolean(options.replyTargetsNate))
  if (!trigger) return { ok: true, messageId: inserted.id, thinkingId: null }

  const thinkingId = await insertNateThinking(supabase, options.groupId)
  return { ok: true, messageId: inserted.id, thinkingId }
}

export function isTempMessageId(id: string) {
  return id.startsWith("temp-")
}

export function mergeIncomingMessage(prev: Message[], incoming: Message): Message[] {
  const tempIndex = prev.findIndex(
    (message) =>
      isTempMessageId(message.id) &&
      message.user_id === incoming.user_id &&
      message.content === incoming.content
  )
  if (tempIndex >= 0) {
    const next = [...prev]
    next[tempIndex] = {
      ...incoming,
      original_message: incoming.original_message ?? next[tempIndex].original_message,
    }
    return next
  }

  const existing = prev.findIndex((message) => message.id === incoming.id)
  if (existing >= 0) {
    const next = [...prev]
    next[existing] = incoming
    return next
  }
  return [...prev, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at))
}
