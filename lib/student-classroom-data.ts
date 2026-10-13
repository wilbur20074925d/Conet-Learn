import "server-only"

import { ensureAgentOpeningMessage, getDocument, getSessionMessages, type GroupMember } from "@/lib/actions"
import { canonicalSession } from "@/lib/canonical-session"
import { listGroupSessions, type ChatSession } from "@/lib/classroom"
import { listCollaborativeNotes, type CollaborativeNote } from "@/lib/collaborative-notes"
import { createClient } from "@/lib/supabase/server"

async function listGroupPeers(groupId: string, profileId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ConetGroupMembers")
    .select("ConetUsers(id, name, avatar_url, role)")
    .eq("group_id", groupId)

  if (error || !data) return [] as GroupMember[]

  const peers: GroupMember[] = []
  for (const row of data as Array<{ ConetUsers: GroupMember | GroupMember[] | null }>) {
    const person = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
    if (!person || person.role === "ai" || person.id === profileId) continue
    peers.push(person)
  }
  return peers
}

export type StudentClassroomPayload = {
  session: ChatSession | null
  initialMessages: Awaited<ReturnType<typeof getSessionMessages>>
  initialNotes: CollaborativeNote[]
  document: string
  peers: GroupMember[]
  classSessionId: string | null
}

export async function loadStudentClassroom(
  groupId: string,
  profileId: string,
  requestedSessionId?: string | null
): Promise<{ ok: true; data: StudentClassroomPayload } | { ok: false; error: string }> {
  const supabase = await createClient()
  const [chats, notesResult, document, peers, groupRow] = await Promise.all([
    listGroupSessions(groupId),
    listCollaborativeNotes(groupId),
    getDocument(groupId, profileId),
    listGroupPeers(groupId, profileId),
    supabase.from("ConetGroups").select("class_session_id").eq("id", groupId).maybeSingle(),
  ])

  if (!chats.ok) return { ok: false, error: chats.error }

  const requested = requestedSessionId
    ? chats.sessions.find((item) => item.id === requestedSessionId) || null
    : null
  const active = requested || canonicalSession(chats.sessions)

  if (active) await ensureAgentOpeningMessage(groupId, active.id)
  const initialMessages = active ? await getSessionMessages(active.id) : []

  return {
    ok: true,
    data: {
      session: active,
      initialMessages,
      initialNotes: notesResult.ok ? notesResult.notes : [],
      document,
      peers,
      classSessionId: groupRow.error ? null : ((groupRow.data?.class_session_id as string | null) ?? null),
    },
  }
}
