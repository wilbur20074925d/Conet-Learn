import "server-only"
import { createClient } from "./supabase/server"
import { normalizeNateMode } from "./nate"

export type JoinableGroup = {
  id: string
  name: string
  memberCount: number
}

export type ChatSession = {
  id: string
  title: string
  createdAt: string
  createdBy: string | null
}

export type BoardMember = {
  id: string
  name: string
  role: string
}

export type BoardSession = ChatSession & {
  groupId: string
}

export type BoardGroup = {
  id: string
  name: string
  newintervene: number
  members: BoardMember[]
  sessions: BoardSession[]
}

export type ClassroomStudent = {
  id: string
  name: string
  email: string | null
}

function notReady(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message || ""
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    /schema cache|does not exist|ConetSessions|conet_group_directory|conet_create_group/i.test(message)
  )
}

function personOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

export async function listJoinableGroups(): Promise<
  { ok: true; groups: JoinableGroup[] } | { ok: false; error: string; needsSetup?: boolean }
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("conet_group_directory")
  if (error) {
    if (notReady(error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "Chat groups are not in Supabase yet. Run supabase/conet-sessions.sql in the SQL editor, then refresh.",
      }
    }
    return { ok: false, error: error.message }
  }

  const groups = ((data || []) as Array<{ id: string; name: string; member_count: number }>).map((group) => ({
    id: group.id,
    name: group.name,
    memberCount: group.member_count || 0,
  }))
  return { ok: true, groups }
}

export async function listGroupSessions(groupId: string): Promise<
  { ok: true; sessions: ChatSession[] } | { ok: false; error: string; needsSetup?: boolean }
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ConetSessions")
    .select("id, title, created_at, created_by")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })

  if (error) {
    if (notReady(error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "Chat groups are not in Supabase yet. Run supabase/conet-sessions.sql in the SQL editor, then refresh.",
      }
    }
    return { ok: false, error: error.message }
  }

  return {
    ok: true,
    sessions: (data || []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      createdAt: row.created_at as string,
      createdBy: (row.created_by as string | null) ?? null,
    })),
  }
}

export async function getTeacherBoard(): Promise<
  | { ok: true; groups: BoardGroup[]; waiting: { id: string; name: string }[]; students: ClassroomStudent[] }
  | { ok: false; error: string; needsSetup?: boolean }
> {
  const supabase = await createClient()
  const [groupsQuery, membersQuery, sessionsQuery, studentsQuery] = await Promise.all([
    supabase.from("ConetGroups").select("id, name, newintervene, created_at").order("created_at", { ascending: true }),
    supabase.from("ConetGroupMembers").select("group_id, ConetUsers(id, name, role)"),
    supabase
      .from("ConetSessions")
      .select("id, group_id, title, created_at, created_by")
      .order("created_at", { ascending: false }),
    supabase.from("ConetUsers").select("id, name, email").eq("role", "student").order("name", { ascending: true }),
  ])

  const error = groupsQuery.error || membersQuery.error || sessionsQuery.error || studentsQuery.error
  if (error) {
    if (notReady(error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "Chat groups are not in Supabase yet. Run supabase/conet-sessions.sql in the SQL editor, then refresh.",
      }
    }
    return { ok: false, error: error.message }
  }

  const membersByGroup = new Map<string, BoardMember[]>()
  const placed = new Set<string>()
  for (const row of (membersQuery.data || []) as Array<{
    group_id: string
    ConetUsers: BoardMember | BoardMember[] | null
  }>) {
    const person = personOf(row.ConetUsers)
    if (!person || person.role === "ai") continue
    placed.add(person.id)
    const list = membersByGroup.get(row.group_id) || []
    list.push(person)
    membersByGroup.set(row.group_id, list)
  }

  const sessionsByGroup = new Map<string, BoardSession[]>()
  for (const row of sessionsQuery.data || []) {
    const session: BoardSession = {
      id: row.id as string,
      groupId: row.group_id as string,
      title: row.title as string,
      createdAt: row.created_at as string,
      createdBy: (row.created_by as string | null) ?? null,
    }
    const list = sessionsByGroup.get(session.groupId) || []
    list.push(session)
    sessionsByGroup.set(session.groupId, list)
  }

  const groups: BoardGroup[] = (groupsQuery.data || []).map((group) => ({
    id: group.id as string,
    name: group.name as string,
    newintervene: normalizeNateMode(group.newintervene as number),
    members: (membersByGroup.get(group.id as string) || []).sort((a, b) => a.name.localeCompare(b.name)),
    sessions: sessionsByGroup.get(group.id as string) || [],
  }))

  const students = ((studentsQuery.data || []) as ClassroomStudent[]).map((student) => ({
    id: student.id,
    name: student.name,
    email: student.email,
  }))
  const waiting = students.filter((student) => !placed.has(student.id)).map((student) => ({
    id: student.id,
    name: student.name,
  }))

  return { ok: true, groups, waiting, students }
}
