"use server"

import { getSessionContext, getSessionMessages } from "@/lib/actions"
import { inGroup } from "@/lib/session-membership"
import { canonicalSession } from "@/lib/canonical-session"
import { getTeacherBoard } from "@/lib/classroom"
import { listCollaborativeNotes, type CollaborativeNote } from "@/lib/collaborative-notes"
import { listGroupIndividualNotes, type IndividualNoteRecord } from "@/lib/group-notes"
import { loadStudentClassroom, type StudentClassroomPayload } from "@/lib/student-classroom-data"
import type { Message } from "@/lib/map-messages"
import { createClient } from "@/lib/supabase/server"

export type OpenedTeacherSession = {
  groupId: string
  groupName: string
  sessionId: string | null
  sessionTitle: string
  classSessionId: string | null
  initialMessages: Message[]
  initialNotes: CollaborativeNote[]
  individualNotes: IndividualNoteRecord[]
  notesUnavailable: boolean
  newintervene: number
}

export async function loadTeacherSession(
  groupId: string | null,
  chatSessionId: string | null
): Promise<{ ok: true; session: OpenedTeacherSession } | { ok: false; error: string }> {
  const auth = await getSessionContext()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (auth.ctx.role !== "teacher") return { ok: false, error: "Only a teacher can open that session." }

  const supabase = await createClient()
  const [board, prefetchedMessages, prefetchedNotes, individualNotes, groupLink] = await Promise.all([
    getTeacherBoard(),
    chatSessionId ? getSessionMessages(chatSessionId) : Promise.resolve(null),
    groupId ? listCollaborativeNotes(groupId) : Promise.resolve(null),
    groupId ? listGroupIndividualNotes(groupId) : Promise.resolve(null),
    groupId
      ? supabase.from("ConetGroups").select("class_session_id").eq("id", groupId).maybeSingle()
      : Promise.resolve(null),
  ])
  if (!board.ok) return { ok: false, error: board.error }

  const group = groupId
    ? board.groups.find((item) => item.id === groupId) || null
    : chatSessionId
      ? board.groups.find((item) => item.sessions.some((chat) => chat.id === chatSessionId)) || null
      : null
  if (!group) return { ok: false, error: "That group is no longer available." }

  const chat =
    (chatSessionId && group.sessions.find((item) => item.id === chatSessionId)) || canonicalSession(group.sessions)
  const [initialMessages, notesResult, noteReadout] = await Promise.all([
    prefetchedMessages ?? (chat ? getSessionMessages(chat.id) : Promise.resolve([])),
    prefetchedNotes ?? listCollaborativeNotes(group.id),
    individualNotes ?? listGroupIndividualNotes(group.id),
  ])

  return {
    ok: true,
    session: {
      groupId: group.id,
      groupName: group.name,
      sessionId: chat?.id || null,
      sessionTitle: chat?.title || group.name,
      classSessionId: groupLink?.error ? null : ((groupLink?.data?.class_session_id as string | null) ?? null),
      initialMessages,
      initialNotes: notesResult.ok ? notesResult.notes : [],
      individualNotes: noteReadout.notes,
      notesUnavailable: noteReadout.unavailable,
      newintervene: group.newintervene,
    },
  }
}

export type OpenedStudentSession = {
  name: string
  profileId: string
  groupId: string
  groupName: string
  newintervene: number
  classroom: StudentClassroomPayload
}

export async function loadStudentWorkspace(
  groupId: string,
  chatSessionId: string | null
): Promise<{ ok: true; session: OpenedStudentSession } | { ok: false; error: string }> {
  const auth = await getSessionContext()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (auth.ctx.role !== "student" || !inGroup(auth.ctx, groupId)) {
    return { ok: false, error: "Join this group before opening it." }
  }

  const classroom = await loadStudentClassroom(groupId, auth.ctx.profileId, chatSessionId)
  if (!classroom.ok) return { ok: false, error: classroom.error }
  const membership = auth.ctx.memberships.find((item) => item.groupId === groupId)

  return {
    ok: true,
    session: {
      name: auth.ctx.name,
      profileId: auth.ctx.profileId,
      groupId,
      groupName: membership?.groupName || "Group",
      newintervene: membership?.newintervene ?? auth.ctx.newintervene,
      classroom: classroom.data,
    },
  }
}
