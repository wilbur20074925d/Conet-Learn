import type { SupabaseClient } from "@supabase/supabase-js"
import { NATE_THINKING, NATE_USER_ID, mentionsNATE } from "./nate"
import { mapMessageRows, type Message, type RawMessage } from "./map-messages"

export const MESSAGE_COLUMNS =
  "id, content, created_at, user_id, reply_to, is_reply, ConetUsers(name, avatar_url, role)"

export const ONLINE_WINDOW_MS = 35_000
/** Still listed in the session after the tab is hidden or the socket drops. */
export const AWAY_WINDOW_MS = 120_000
export const OUTBOX_ATTEMPT_LIMIT = 6

export type SessionUser = {
  id: string
  name: string
  lastSeen: number
  away?: boolean
}

export type SendMessageResult =
  | { ok: true; messageId: string; thinkingId: string | null }
  | { ok: false; error: string }

export async function fetchSessionMessages(supabase: SupabaseClient, sessionId: string): Promise<Message[] | null> {
  const { data, error } = await supabase
    .from("ConetMessages")
    .select(MESSAGE_COLUMNS)
    .eq("session_id", sessionId)
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
  away?: boolean
  ConetUsers: { id: string; name: string; role: string } | { id: string; name: string; role: string }[] | null
}

function missingFunction(message: string | undefined) {
  if (!message) return false
  return /PGRST202|could not find the function|schema cache/i.test(message)
}

function missingColumn(message: string | undefined) {
  if (!message) return false
  return /client_id|away|schema cache|column/i.test(message)
}

export function isRetryableSendError(error: string) {
  const message = error.toLowerCase()
  return !(
    message.includes("empty message") ||
    message.includes("not a group member") ||
    message.includes("teachers view") ||
    message.includes("reply target") ||
    message.includes("session not in group") ||
    message.includes("profile missing")
  )
}

export function retryDelayMs(attempt: number) {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1))
}

/** Refresh a stale login, then hand the access token to Realtime. */
export async function refreshRealtimeAuth(supabase: SupabaseClient) {
  const current = await supabase.auth.getSession()
  const expiresAt = (current.data.session?.expires_at ?? 0) * 1000
  const stale = !current.data.session || expiresAt < Date.now() + 60_000
  const next = stale ? await supabase.auth.refreshSession() : current
  const token = next.data.session?.access_token
  if (token) await supabase.realtime.setAuth(token)
  return Boolean(token)
}

export async function fetchSessionUsers(supabase: SupabaseClient, groupId: string): Promise<SessionUser[] | null> {
  const since = new Date(Date.now() - AWAY_WINDOW_MS).toISOString()
  const load = (columns: string) =>
    supabase.from("ConetPresence").select(columns).eq("group_id", groupId).gte("last_seen", since)

  let result = await load("user_id, last_seen, away, ConetUsers(id, name, role)")
  if (result.error && missingColumn(result.error.message)) {
    result = await load("user_id, last_seen, ConetUsers(id, name, role)")
  }
  if (result.error) return null

  const users: SessionUser[] = []
  const now = Date.now()
  for (const row of (result.data || []) as unknown as PresenceRow[]) {
    const person = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
    if (!person || person.role === "ai") continue
    const lastSeen = new Date(row.last_seen).getTime()
    users.push({
      id: row.user_id,
      name: person.name || "Member",
      lastSeen,
      away: Boolean(row.away) || now - lastSeen >= ONLINE_WINDOW_MS,
    })
  }
  return users
}

export async function touchPresence(supabase: SupabaseClient, groupId: string, userId: string, away = false) {
  const rpc = await supabase.rpc("conet_touch_presence", { p_group_id: groupId, p_away: away })
  if (!rpc.error) return true

  if (missingFunction(rpc.error.message)) {
    // Older database: hiding must not refresh last_seen, or the person stays "here".
    if (away) return true
    const retry = await supabase.rpc("conet_touch_presence", { p_group_id: groupId })
    if (!retry.error) return true
  }

  const lastSeen = new Date().toISOString()
  const upsert = await supabase.from("ConetPresence").upsert(
    { group_id: groupId, user_id: userId, last_seen: lastSeen, away },
    { onConflict: "group_id,user_id" }
  )
  if (!upsert.error) return true
  if (!missingColumn(upsert.error.message)) return false
  if (away) return true

  const plain = await supabase.from("ConetPresence").upsert(
    { group_id: groupId, user_id: userId, last_seen: lastSeen },
    { onConflict: "group_id,user_id" }
  )
  return !plain.error
}

async function existingClientMessage(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase.from("ConetMessages").select("id").eq("client_id", clientId).maybeSingle()
  if (error) return { id: null as string | null, unsupported: missingColumn(error.message) }
  return { id: (data?.id as string | undefined) ?? null, unsupported: false }
}

async function soleRecentMatch(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  content: string,
  createdAt: string
) {
  const sinceMs = Date.parse(createdAt)
  const since = new Date((Number.isFinite(sinceMs) ? sinceMs : Date.now()) - 15_000).toISOString()
  const { data, error } = await supabase
    .from("ConetMessages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .eq("content", content)
    .gte("created_at", since)
    .limit(2)
  if (error || !data || data.length !== 1) return null
  return data[0].id as string
}

async function insertUserMessage(
  supabase: SupabaseClient,
  groupId: string,
  sessionId: string,
  userId: string,
  content: string,
  replyTo: string | null,
  clientId: string | null,
  createdAt: string | null,
  recover: boolean
) {
  if (clientId) {
    const existing = await existingClientMessage(supabase, clientId)
    if (existing.id) return { id: existing.id, error: null as string | null, reused: true }
    if (recover && existing.unsupported && createdAt) {
      const matched = await soleRecentMatch(supabase, sessionId, userId, content, createdAt)
      if (matched) return { id: matched, error: null as string | null, reused: true }
    }
  }

  const payload = {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_content: content,
    p_reply_to: replyTo,
    ...(clientId ? { p_client_id: clientId } : {}),
  }
  let rpc = await supabase.rpc("conet_send_message", payload)
  if (rpc.error && clientId && missingFunction(rpc.error.message)) {
    rpc = await supabase.rpc("conet_send_message", {
      p_group_id: groupId,
      p_session_id: sessionId,
      p_content: content,
      p_reply_to: replyTo,
    })
  }
  if (!rpc.error && typeof rpc.data === "string") {
    return { id: rpc.data, error: null as string | null, reused: false }
  }

  const row: {
    group_id: string
    session_id: string
    user_id: string
    content: string
    reply_to: string | null
    is_reply: boolean
    client_id?: string
  } = {
    group_id: groupId,
    session_id: sessionId,
    user_id: userId,
    content,
    reply_to: replyTo,
    is_reply: Boolean(replyTo),
  }
  if (clientId) row.client_id = clientId

  let direct = await supabase.from("ConetMessages").insert(row).select("id").single()
  if (direct.error && clientId && missingColumn(direct.error.message)) {
    delete row.client_id
    direct = await supabase.from("ConetMessages").insert(row).select("id").single()
  }
  if (direct.error?.code === "23505" && clientId) {
    const existing = await existingClientMessage(supabase, clientId)
    if (existing.id) return { id: existing.id, error: null as string | null, reused: true }
  }
  if (direct.error || !direct.data) {
    return {
      id: null as string | null,
      error: direct.error?.message || rpc.error?.message || "Failed to send",
      reused: false,
    }
  }
  return { id: direct.data.id as string, error: null as string | null, reused: false }
}

async function insertNateThinking(supabase: SupabaseClient, groupId: string, sessionId: string) {
  const rpc = await supabase.rpc("conet_post_nate_message", {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_content: NATE_THINKING,
  })
  if (!rpc.error && typeof rpc.data === "string") return rpc.data as string

  const direct = await supabase
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

  return direct.data?.id ?? null
}

const sendsInFlight = new Map<string, Promise<SendMessageResult>>()

/** Fast browser-side send. Does not wait for NATE's full reply. */
export async function sendGroupMessage(
  supabase: SupabaseClient,
  options: {
    groupId: string
    sessionId: string
    userId: string
    content: string
    replyTo?: string | null
    replyTargetsNate?: boolean
    nateMode: number
    clientId?: string | null
    createdAt?: string | null
    recover?: boolean
  }
): Promise<SendMessageResult> {
  const clientId = options.clientId || ""
  if (clientId) {
    const existing = sendsInFlight.get(clientId)
    if (existing) return existing
  }
  const work = deliverGroupMessage(supabase, options)
  if (clientId) {
    sendsInFlight.set(clientId, work)
    void work.finally(() => {
      if (sendsInFlight.get(clientId) === work) sendsInFlight.delete(clientId)
    })
  }
  return work
}

async function deliverGroupMessage(
  supabase: SupabaseClient,
  options: {
    groupId: string
    sessionId: string
    userId: string
    content: string
    replyTo?: string | null
    replyTargetsNate?: boolean
    nateMode: number
    clientId?: string | null
    createdAt?: string | null
    recover?: boolean
  }
): Promise<SendMessageResult> {
  const content = options.content.trim()
  if (!content) return { ok: false, error: "Message cannot be empty" }

  const replyTo = options.replyTo || null
  const inserted = await insertUserMessage(
    supabase,
    options.groupId,
    options.sessionId,
    options.userId,
    content,
    replyTo,
    options.clientId || null,
    options.createdAt || null,
    Boolean(options.recover)
  )
  if (!inserted.id) return { ok: false, error: inserted.error || "Failed to send message" }

  const trigger =
    !inserted.reused && options.nateMode !== 3 && (mentionsNATE(content) || Boolean(options.replyTargetsNate))
  if (!trigger) return { ok: true, messageId: inserted.id, thinkingId: null }

  const thinkingId = await insertNateThinking(supabase, options.groupId, options.sessionId)
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
