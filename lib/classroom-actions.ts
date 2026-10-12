"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSessionContext } from "./actions"
import { inGroup } from "./session-membership"
import { createClient } from "./supabase/server"

function friendly(message: string) {
  if (message.includes("already in this session")) {
    return "You already joined a group in this session. Open another session to join a different group."
  }
  if (message.includes("already in a group") || /conet_transfer_student|conet_remove_student_from_group/i.test(message)) {
    return "Run supabase/conet-classes.sql in the Supabase SQL editor, then refresh. That update lets a student join one group in each session."
  }
  if (message.includes("Only students can join")) return "Only students can join a group."
  if (message.includes("Only a teacher can create")) return "Only a teacher can create a group."
  if (message.includes("Only a teacher can delete")) return "Only a teacher can delete a group."
  if (message.includes("Only a teacher can move")) return "Only a teacher can move a student."
  if (message.includes("Only a teacher can remove")) return "Only a teacher can change a student's group."
  if (message.includes("Only students can create")) return "Only students can create a chat session."
  if (message.includes("You cannot delete")) return "You can delete chat sessions you created."
  if (message.includes("Group not found")) return "That group is no longer available."
  if (message.includes("invalid name")) return "Use a name between 1 and 80 characters."
  if (message.includes("not a group member")) return "Join a group before starting a chat session."
  return "Something went wrong. Please try again."
}

async function teacherContext() {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role !== "teacher") return { ok: false as const, error: "Only a teacher can do that." }
  return { ok: true as const, session }
}

export async function joinGroup(groupId: string) {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role !== "student") return { ok: false as const, error: "Only students can join a group." }
  if (session.ctx.groupIds.includes(groupId)) return { ok: true as const }
  const parsed = z.string().uuid().safeParse(groupId)
  if (!parsed.success) return { ok: false as const, error: "Choose a group to join." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_join_group", { p_group_id: parsed.data })
  if (result.error) return { ok: false as const, error: friendly(result.error.message) }
  revalidatePath("/")
  revalidatePath("/dashboard")
  revalidatePath("/in-class-session")
  return { ok: true as const }
}

export async function createGroup(name: string) {
  const session = await teacherContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  const parsed = z.string().trim().min(1).max(80).safeParse(name)
  if (!parsed.success) return { ok: false as const, error: "Use a group name between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_create_group", { p_name: parsed.data })
  if (result.error) return { ok: false as const, error: friendly(result.error.message) }
  revalidatePath("/")
  revalidatePath("/dashboard")
  return { ok: true as const, groupId: result.data as string }
}

export async function deleteGroup(groupId: string) {
  const session = await teacherContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  const parsed = z.string().uuid().safeParse(groupId)
  if (!parsed.success) return { ok: false as const, error: "That group is no longer available." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_delete_group", { p_group_id: parsed.data })
  if (result.error) return { ok: false as const, error: friendly(result.error.message) }
  revalidatePath("/")
  revalidatePath("/dashboard")
  return { ok: true as const }
}

export async function moveStudent(userId: string, groupId: string, fromGroupId?: string) {
  const session = await teacherContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  const parsed = z
    .object({
      userId: z.string().uuid(),
      groupId: z.string().uuid(),
      fromGroupId: z.string().uuid().optional(),
    })
    .safeParse({ userId, groupId, fromGroupId })
  if (!parsed.success) return { ok: false as const, error: "Choose a student and a group." }

  const supabase = await createClient()
  const result = parsed.data.fromGroupId
    ? await supabase.rpc("conet_transfer_student", {
        p_user_id: parsed.data.userId,
        p_from_group_id: parsed.data.fromGroupId,
        p_to_group_id: parsed.data.groupId,
      })
    : await supabase.rpc("conet_move_student", {
        p_user_id: parsed.data.userId,
        p_group_id: parsed.data.groupId,
      })
  if (result.error) return { ok: false as const, error: friendly(result.error.message) }
  revalidatePath("/")
  revalidatePath("/dashboard")
  return { ok: true as const }
}

export async function removeStudent(userId: string, groupId?: string) {
  const session = await teacherContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  const parsed = z
    .object({ userId: z.string().uuid(), groupId: z.string().uuid().optional() })
    .safeParse({ userId, groupId })
  if (!parsed.success) return { ok: false as const, error: "That student is no longer available." }

  const supabase = await createClient()
  const result = parsed.data.groupId
    ? await supabase.rpc("conet_remove_student_from_group", {
        p_user_id: parsed.data.userId,
        p_group_id: parsed.data.groupId,
      })
    : await supabase.rpc("conet_remove_student", { p_user_id: parsed.data.userId })
  if (result.error) return { ok: false as const, error: friendly(result.error.message) }
  revalidatePath("/")
  revalidatePath("/dashboard")
  return { ok: true as const }
}

export async function createChatSession(groupId: string, title: string) {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role !== "student" || !inGroup(session.ctx, groupId)) {
    return { ok: false as const, error: "Join a group before starting a chat session." }
  }
  const parsed = z.string().trim().min(1).max(80).safeParse(title)
  if (!parsed.success) return { ok: false as const, error: "Use a session title between 1 and 80 characters." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_create_session", { p_group_id: groupId, p_title: parsed.data })
  if (result.error) return { ok: false as const, error: friendly(result.error.message) }
  revalidatePath("/")
  return { ok: true as const, sessionId: result.data as string }
}

export async function deleteChatSession(sessionId: string) {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role !== "teacher" && session.ctx.role !== "student") {
    return { ok: false as const, error: "You cannot delete this chat session." }
  }
  const parsed = z.string().uuid().safeParse(sessionId)
  if (!parsed.success) return { ok: false as const, error: "That chat session is no longer available." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_delete_session", { p_session_id: parsed.data })
  if (result.error) return { ok: false as const, error: friendly(result.error.message) }
  revalidatePath("/")
  return { ok: true as const }
}
