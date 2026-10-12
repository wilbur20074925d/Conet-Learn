"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSessionContext } from "./actions"
import { INITIAL_STUDENT_PASSWORD } from "./student-password"
import { supabasePublishableKey, supabaseUrl } from "./supabase/env"
import { createClient } from "./supabase/server"

function missingFunction(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message || ""
  return error.code === "PGRST202" || /could not find the function|schema cache/i.test(message)
}

function friendly(message: string) {
  const text = message.toLowerCase()
  if (text.includes("already registered") || text.includes("already been registered") || text.includes("already exists")) {
    return "An account with this email already exists."
  }
  if (text.includes("only a teacher can create")) return "Only a teacher can create a student account."
  if (text.includes("only a teacher can reset")) return "Only a teacher can reset a password."
  if (text.includes("student not found")) return "That student account is no longer available."
  if (text.includes("invalid email")) return "Enter a valid email address."
  if (text.includes("invalid name")) return "Use a name between 1 and 80 characters."
  if (text.includes("password hashing") || text.includes("pgcrypto")) {
    return "Password setup is missing in Supabase. Run supabase/conet-accounts.sql in the SQL editor."
  }
  return "Something went wrong. Please try again."
}

async function teacherContext() {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role !== "teacher") return { ok: false as const, error: "Only a teacher can do that." }
  return { ok: true as const }
}

function detachedAuthClient() {
  return createSupabaseClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function createStudentAccount(name: string, email: string) {
  const session = await teacherContext()
  if (!session.ok) return session

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().email().max(200),
    })
    .safeParse({ name, email })
  if (!parsed.success) return { ok: false as const, error: "Enter a name and a valid email address." }

  const supabase = await createClient()
  const created = await supabase.rpc("conet_create_student", {
    p_email: parsed.data.email,
    p_name: parsed.data.name,
  })

  if (!created.error) {
    revalidatePath("/")
    return { ok: true as const, pendingConfirm: false }
  }
  if (!missingFunction(created.error)) {
    return { ok: false as const, error: friendly(created.error.message) }
  }

  const signup = await detachedAuthClient().auth.signUp({
    email: parsed.data.email,
    password: INITIAL_STUDENT_PASSWORD,
    options: { data: { name: parsed.data.name, role: "student" } },
  })
  if (signup.error) return { ok: false as const, error: friendly(signup.error.message) }

  const identities = signup.data.user?.identities
  if (signup.data.user && identities && identities.length === 0) {
    return { ok: false as const, error: "An account with this email already exists." }
  }

  revalidatePath("/")
  const pendingConfirm = !signup.data.session && !signup.data.user?.email_confirmed_at
  return { ok: true as const, pendingConfirm }
}

export async function resetStudentPassword(userId: string) {
  const session = await teacherContext()
  if (!session.ok) return session

  const parsed = z.string().uuid().safeParse(userId)
  if (!parsed.success) return { ok: false as const, error: "That student account is no longer available." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_reset_student_password", { p_user_id: parsed.data })
  if (result.error) {
    if (missingFunction(result.error)) {
      return {
        ok: false as const,
        error: "Password reset is not ready yet. Run supabase/conet-accounts.sql in the Supabase SQL editor, then try again.",
      }
    }
    return { ok: false as const, error: friendly(result.error.message) }
  }

  revalidatePath("/")
  return { ok: true as const }
}
