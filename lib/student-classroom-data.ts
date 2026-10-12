import "server-only"

import { getDocument, getSessionMessages, type GroupMember } from "@/lib/actions"
import { listGroupSessions, type ChatSession } from "@/lib/classroom"
import { listCollaborativeNotes, type CollaborativeNote } from "@/lib/collaborative-notes"
import { createClient } from "@/lib/supabase/server"

function isUuid(value: string | undefined) {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

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
  sessions: ChatSession[]
  activeSessionId: string | null
  initialMessages: Awaited<ReturnType<typeof getSessionMessages>>
  initialNotes: CollaborativeNote[]
  document: string
  peers: GroupMember[]
}

export async function loadStudentClassroom(
  groupId: string,
  profileId: string,
  requestedSession?: string
): Promise<{ ok: true; data: StudentClassroomPayload } | { ok: false; error: string }> {
  const [chats, notesResult, document, peers] = await Promise.all([
    listGroupSessions(groupId),
    listCollaborativeNotes(groupId),
    getDocument(groupId, profileId),
    listGroupPeers(groupId, profileId),
  ])

  if (!chats.ok) return { ok: false, error: chats.error }

  const active =
    (isUuid(requestedSession) ? chats.sessions.find((item) => item.id === requestedSession) : undefined) ||
    chats.sessions[0] ||
    null

  const initialMessages = active ? await getSessionMessages(active.id) : []

  return {
    ok: true,
    data: {
      sessions: chats.sessions,
      activeSessionId: active?.id || null,
      initialMessages,
      initialNotes: notesResult.ok ? notesResult.notes : [],
      document,
      peers,
    },
  }
}
