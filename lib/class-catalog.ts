import "server-only"

import { canonicalSession } from "@/lib/canonical-session"
import { getTeacherBoard } from "@/lib/classroom"
import type { CatalogClass, CatalogGroup, CatalogStudent } from "@/lib/catalog"
import { createClient } from "@/lib/supabase/server"

function missingCatalog(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message || ""
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    /ConetClasses|ConetClassSessions|ConetClassMembers|ConetSessionMembers|class_session_id|schema cache|does not exist/i.test(message)
  )
}

export async function getClassCatalog(): Promise<
  | {
      ok: true
      classes: CatalogClass[]
      looseGroups: CatalogGroup[]
      waiting: { id: string; name: string }[]
      students: CatalogStudent[]
    }
  | { ok: false; error: string; needsSetup?: boolean }
> {
  const supabase = await createClient()
  const [board, classesQuery, sessionsQuery, linksQuery, classMembersQuery, sessionMembersQuery] = await Promise.all([
    getTeacherBoard(),
    supabase.from("ConetClasses").select("id, name, created_at").order("created_at", { ascending: true }),
    supabase
      .from("ConetClassSessions")
      .select("id, class_id, title, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("ConetGroups").select("id, class_session_id"),
    supabase.from("ConetClassMembers").select("class_id, user_id"),
    supabase.from("ConetSessionMembers").select("class_session_id, user_id"),
  ])
  if (!board.ok) return board

  const error =
    classesQuery.error ||
    sessionsQuery.error ||
    linksQuery.error ||
    classMembersQuery.error ||
    sessionMembersQuery.error
  if (error) {
    if (missingCatalog(error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "Classes are not in Supabase yet. Run supabase/conet-classes.sql in the SQL editor, then refresh.",
      }
    }
    return { ok: false, error: error.message }
  }

  const sessionByGroup = new Map<string, string | null>()
  for (const row of linksQuery.data || []) {
    sessionByGroup.set(row.id as string, (row.class_session_id as string | null) ?? null)
  }

  const groups: CatalogGroup[] = board.groups.map((group) => ({
    id: group.id,
    name: group.name,
    newintervene: group.newintervene,
    classSessionId: sessionByGroup.get(group.id) ?? null,
    members: group.members.filter((member) => member.role !== "ai" && member.role !== "teacher"),
    chatSessionId: canonicalSession(group.sessions)?.id ?? null,
  }))
  const byId = new Map(groups.map((group) => [group.id, group]))

  const profileOf = new Map(
    board.students.map((student) => [
      student.id,
      {
        id: student.id,
        name: student.name,
        email: student.email,
        username: student.username,
        studentId: student.studentId,
      },
    ])
  )
  function roster(ids: string[]) {
    return ids
      .map((id) => profileOf.get(id) || { id, name: "Student" })
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  const classStudentIds = new Map<string, string[]>()
  for (const row of classMembersQuery.data || []) {
    const classId = row.class_id as string
    const list = classStudentIds.get(classId) || []
    list.push(row.user_id as string)
    classStudentIds.set(classId, list)
  }
  const sessionStudentIds = new Map<string, string[]>()
  for (const row of sessionMembersQuery.data || []) {
    const sessionId = row.class_session_id as string
    const list = sessionStudentIds.get(sessionId) || []
    list.push(row.user_id as string)
    sessionStudentIds.set(sessionId, list)
  }

  const classes: CatalogClass[] = (classesQuery.data || []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    students: roster(classStudentIds.get(row.id as string) || []),
    sessions: [],
  }))
  const classById = new Map(classes.map((item) => [item.id, item]))

  for (const row of sessionsQuery.data || []) {
    const parent = classById.get(row.class_id as string)
    if (!parent) continue
    parent.sessions.push({
      id: row.id as string,
      classId: row.class_id as string,
      title: row.title as string,
      createdAt: row.created_at as string,
      students: roster(sessionStudentIds.get(row.id as string) || []),
      groups: [],
    })
  }

  const looseGroups: CatalogGroup[] = []
  for (const group of groups) {
    if (!group.classSessionId) {
      looseGroups.push(group)
      continue
    }
    const parent = classes
      .flatMap((item) => item.sessions)
      .find((session) => session.id === group.classSessionId)
    if (!parent) {
      looseGroups.push(group)
      continue
    }
    const placed = byId.get(group.id)
    if (placed) parent.groups.push(placed)
  }

  for (const item of classes) {
    item.sessions.forEach((session) => {
      session.groups.sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  return {
    ok: true,
    classes,
    looseGroups,
    waiting: board.waiting,
    students: board.students.map((student) => ({
      id: student.id,
      name: student.name,
      email: student.email,
      username: student.username,
      studentId: student.studentId,
    })),
  }
}
