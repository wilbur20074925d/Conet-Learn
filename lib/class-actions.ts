"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSessionContext } from "@/lib/actions"
import { getSessionBrief, saveSessionBrief } from "@/lib/session-materials-actions"
import { createClient } from "@/lib/supabase/server"

const nameSchema = z.string().trim().min(1).max(80)

function needsSetup(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message || ""
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    /ConetClasses|ConetClassSessions|ConetClassMembers|ConetSessionMembers|class_session_id|conet_create_group_in_session|conet_place_students|schema cache|does not exist/i.test(message)
  )
}

function fail(error: { code?: string; message?: string } | null, fallback: string) {
  if (needsSetup(error)) {
    return { ok: false as const, error: "Run supabase/conet-classes.sql in the Supabase SQL editor, then refresh." }
  }
  return { ok: false as const, error: fallback }
}

async function teacher() {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role !== "teacher") return { ok: false as const, error: "Only a teacher can do that." }
  return { ok: true as const }
}

function refresh() {
  revalidatePath("/dashboard")
  revalidatePath("/")
  revalidatePath("/in-class-session")
}

export async function createClass(name: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { ok: false as const, error: "Use a class name between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase.from("ConetClasses").insert({ name: parsed.data }).select("id").single()
  if (result.error || !result.data) return fail(result.error, "Could not create the class.")
  refresh()
  return { ok: true as const, id: result.data.id as string }
}

export async function renameClass(classId: string, name: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(classId)
  const parsed = nameSchema.safeParse(name)
  if (!id.success || !parsed.success) return { ok: false as const, error: "Use a class name between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase.from("ConetClasses").update({ name: parsed.data }).eq("id", id.data)
  if (result.error) return fail(result.error, "Could not rename the class.")
  refresh()
  return { ok: true as const }
}

export async function deleteClass(classId: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(classId)
  if (!id.success) return { ok: false as const, error: "That class is no longer available." }

  const supabase = await createClient()
  const result = await supabase.from("ConetClasses").delete().eq("id", id.data)
  if (result.error) return fail(result.error, "Could not delete the class.")
  refresh()
  return { ok: true as const }
}

export async function createClassSession(classId: string, title: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(classId)
  const parsed = nameSchema.safeParse(title)
  if (!id.success || !parsed.success) return { ok: false as const, error: "Use a session name between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase
    .from("ConetClassSessions")
    .insert({ class_id: id.data, title: parsed.data })
    .select("id")
    .single()
  if (result.error || !result.data) return fail(result.error, "Could not create the session.")
  refresh()
  return { ok: true as const, id: result.data.id as string }
}

export async function renameClassSession(sessionId: string, title: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(sessionId)
  const parsed = nameSchema.safeParse(title)
  if (!id.success || !parsed.success) return { ok: false as const, error: "Use a session name between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase.from("ConetClassSessions").update({ title: parsed.data }).eq("id", id.data)
  if (result.error) return fail(result.error, "Could not rename the session.")
  refresh()
  return { ok: true as const }
}

export async function deleteClassSession(sessionId: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(sessionId)
  if (!id.success) return { ok: false as const, error: "That session is no longer available." }

  const supabase = await createClient()
  const result = await supabase.from("ConetClassSessions").delete().eq("id", id.data)
  if (result.error) return fail(result.error, "Could not delete the session.")
  refresh()
  return { ok: true as const }
}

export async function createSessionGroup(sessionId: string, name: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(sessionId)
  const parsed = nameSchema.safeParse(name)
  if (!id.success || !parsed.success) return { ok: false as const, error: "Use a group name between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_create_group_in_session", {
    p_name: parsed.data,
    p_session_id: id.data,
  })
  if (result.error) return fail(result.error, "Could not create the group.")
  refresh()
  return { ok: true as const, id: result.data as string }
}

export async function renameGroup(groupId: string, name: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(groupId)
  const parsed = nameSchema.safeParse(name)
  if (!id.success || !parsed.success) return { ok: false as const, error: "Use a group name between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase.from("ConetGroups").update({ name: parsed.data }).eq("id", id.data)
  if (result.error) return fail(result.error, "Could not rename the group.")
  refresh()
  return { ok: true as const }
}

async function copySessionContents(sourceSessionId: string, targetSessionId: string) {
  const brief = await getSessionBrief(sourceSessionId)
  if (
    brief.ok &&
    (brief.brief.title.trim() || brief.brief.instructions.trim() || brief.brief.materials.length > 0)
  ) {
    const saved = await saveSessionBrief({
      sessionId: targetSessionId,
      title: brief.brief.title,
      instructions: brief.brief.instructions,
      materials: brief.brief.materials,
    })
    if (!saved.ok) return { ok: false as const, error: saved.error }
  }

  const supabase = await createClient()
  const groups = await supabase
    .from("ConetGroups")
    .select("id, name, newintervene")
    .eq("class_session_id", sourceSessionId)
    .order("name", { ascending: true })
  if (groups.error) return fail(groups.error, "Could not copy the groups in this session.")

  for (const group of groups.data || []) {
    const name = typeof group.name === "string" ? group.name.trim() : ""
    if (!name) continue
    const created = await createSessionGroup(targetSessionId, name)
    if (!created.ok) return created
    const mode = typeof group.newintervene === "number" ? group.newintervene : 1
    if (mode !== 1) {
      const updated = await supabase.from("ConetGroups").update({ newintervene: mode }).eq("id", created.id)
      if (updated.error) return fail(updated.error, "Could not copy the group settings.")
    }
  }

  return { ok: true as const }
}

export async function duplicateClass(classId: string, name: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(classId)
  const parsed = nameSchema.safeParse(name)
  if (!id.success || !parsed.success) return { ok: false as const, error: "Use a class name between 1 and 80 characters." }

  const supabase = await createClient()
  const sessions = await supabase
    .from("ConetClassSessions")
    .select("id, title")
    .eq("class_id", id.data)
    .order("created_at", { ascending: true })
  if (sessions.error) return fail(sessions.error, "Could not duplicate the class.")

  const created = await createClass(parsed.data)
  if (!created.ok) return created

  for (const session of sessions.data || []) {
    const title = typeof session.title === "string" ? session.title.trim() : ""
    if (!title) continue
    const copy = await createClassSession(created.id, title)
    if (!copy.ok) return copy
    const contents = await copySessionContents(session.id as string, copy.id)
    if (!contents.ok) return contents
  }

  refresh()
  return { ok: true as const, id: created.id }
}

export async function duplicateClassSession(sessionId: string, title: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(sessionId)
  const parsed = nameSchema.safeParse(title)
  if (!id.success || !parsed.success) return { ok: false as const, error: "Use a session name between 1 and 80 characters." }

  const supabase = await createClient()
  const source = await supabase.from("ConetClassSessions").select("id, class_id").eq("id", id.data).maybeSingle()
  if (source.error || !source.data) return fail(source.error, "That session is no longer available.")

  const created = await createClassSession(source.data.class_id as string, parsed.data)
  if (!created.ok) return created
  const contents = await copySessionContents(id.data, created.id)
  if (!contents.ok) return contents

  refresh()
  return { ok: true as const, id: created.id }
}

export async function placeGroupInSession(groupId: string, sessionId: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const parsed = z.object({ groupId: z.string().uuid(), sessionId: z.string().uuid() }).safeParse({ groupId, sessionId })
  if (!parsed.success) return { ok: false as const, error: "Choose a session for this group." }

  const supabase = await createClient()
  const result = await supabase
    .from("ConetGroups")
    .update({ class_session_id: parsed.data.sessionId })
    .eq("id", parsed.data.groupId)
  if (result.error) return fail(result.error, "Could not move the group into that session.")
  refresh()
  return { ok: true as const }
}

const studentIdsSchema = z.array(z.string().uuid()).min(1).max(300)

function placeError(error: { code?: string; message?: string } | null, fallback: string) {
  const message = error?.message || ""
  if (needsSetup(error)) {
    return { ok: false as const, error: "Run supabase/conet-classes.sql in the Supabase SQL editor, then refresh." }
  }
  if (message.includes("already in another class")) return { ok: false as const, error: "A student can only be in one class." }
  if (message.includes("not in this class")) {
    return { ok: false as const, error: "Place the student in this class before adding them to a session." }
  }
  if (message.includes("not in this session")) {
    return { ok: false as const, error: "Place the student in this session before adding them to a group." }
  }
  if (message.includes("already in this session")) {
    return { ok: false as const, error: "That student is already in a group for this session." }
  }
  if (message.includes("Choose a student")) return { ok: false as const, error: "Choose at least one student." }
  if (/ambiguous|student_id/i.test(message)) {
    return {
      ok: false as const,
      error: "Run supabase/conet-classes.sql in the Supabase SQL editor again, then refresh. That update fixes placing students in a class.",
    }
  }
  return { ok: false as const, error: fallback }
}

export async function placeStudentsInClass(classId: string, userIds: string[]) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(classId)
  const students = studentIdsSchema.safeParse(userIds)
  if (!id.success || !students.success) return { ok: false as const, error: "Choose at least one student." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_place_students_in_class", {
    p_class_id: id.data,
    p_user_ids: students.data,
  })
  if (result.error) return placeError(result.error, "Could not place those students in the class.")
  refresh()
  return { ok: true as const }
}

export async function placeStudentsInSession(sessionId: string, userIds: string[]) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(sessionId)
  const students = studentIdsSchema.safeParse(userIds)
  if (!id.success || !students.success) return { ok: false as const, error: "Choose at least one student." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_place_students_in_session", {
    p_session_id: id.data,
    p_user_ids: students.data,
  })
  if (result.error) return placeError(result.error, "Could not place those students in the session.")
  refresh()
  return { ok: true as const }
}

export async function placeStudentsInGroup(groupId: string, userIds: string[]) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const id = z.string().uuid().safeParse(groupId)
  const students = studentIdsSchema.safeParse(userIds)
  if (!id.success || !students.success) return { ok: false as const, error: "Choose at least one student." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_place_students_in_group", {
    p_group_id: id.data,
    p_user_ids: students.data,
  })
  if (result.error) return placeError(result.error, "Could not place those students in the group.")
  refresh()
  return { ok: true as const }
}

export async function removeStudentFromClass(classId: string, userId: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const parsed = z.object({ classId: z.string().uuid(), userId: z.string().uuid() }).safeParse({ classId, userId })
  if (!parsed.success) return { ok: false as const, error: "That student is no longer available." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_remove_student_from_class", {
    p_class_id: parsed.data.classId,
    p_user_id: parsed.data.userId,
  })
  if (result.error) return placeError(result.error, "Could not remove that student from the class.")
  refresh()
  return { ok: true as const }
}

export async function removeStudentFromSession(sessionId: string, userId: string) {
  const auth = await teacher()
  if (!auth.ok) return auth
  const parsed = z.object({ sessionId: z.string().uuid(), userId: z.string().uuid() }).safeParse({ sessionId, userId })
  if (!parsed.success) return { ok: false as const, error: "That student is no longer available." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_remove_student_from_session", {
    p_session_id: parsed.data.sessionId,
    p_user_id: parsed.data.userId,
  })
  if (result.error) return placeError(result.error, "Could not remove that student from the session.")
  refresh()
  return { ok: true as const }
}
