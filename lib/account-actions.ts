"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSessionContext } from "./actions"
import { INITIAL_STUDENT_PASSWORD } from "./student-password"
import { supabasePublishableKey, supabaseUrl } from "./supabase/env"
import { createClient } from "./supabase/server"

export type ManagedAccount = {
  id: string
  name: string
  username: string | null
  email: string | null
  role: "teacher" | "student"
  studentId: string | null
}

export type CreateStudentInput = {
  name: string
  username: string
  email: string
  password: string
  studentId?: string | null
}

export type ImportStudentRow = CreateStudentInput

export type ImportRowResult = {
  name: string
  email: string
  ok: boolean
  error?: string
}

const createStudentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(1).max(64),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
  studentId: z.string().trim().max(64).optional().nullable(),
})

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
  if (text.includes("username taken")) return "That username is already in use."
  if (text.includes("only a teacher can create")) return "Only a teacher can create accounts."
  if (text.includes("only a teacher can reset")) return "Only a teacher can reset a password."
  if (text.includes("only a teacher can delete")) return "Only a teacher can delete student accounts."
  if (text.includes("student not found")) return "That student account is no longer available."
  if (text.includes("invalid email")) return "Enter a valid email address."
  if (text.includes("invalid username")) return "Enter a username between 1 and 64 characters."
  if (text.includes("invalid name")) return "Use a name between 1 and 80 characters."
  if (text.includes("invalid password")) return "Use a password between 8 and 128 characters."
  if (text.includes("password hashing") || text.includes("pgcrypto")) {
    return "Password setup is missing in Supabase. Run supabase/conet-accounts.sql in the SQL editor."
  }
  return "Something went wrong. Please try again."
}

function revalidateAccounts() {
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/accounts")
  revalidatePath("/")
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

function mapAccount(row: {
  id: string
  name: string
  email: string | null
  username: string | null
  role: string
  student_id: string | null
}): ManagedAccount {
  const role = row.role === "teacher" ? "teacher" : "student"
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role,
    studentId: row.student_id,
  }
}

export async function listManagedAccounts(): Promise<
  { ok: true; students: ManagedAccount[]; teachers: ManagedAccount[] } | { ok: false; error: string }
> {
  const session = await teacherContext()
  if (!session.ok) return session

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ConetUsers")
    .select("id, name, email, username, role, student_id")
    .in("role", ["student", "teacher"])
    .order("name", { ascending: true })

  if (error) return { ok: false, error: error.message }

  const rows = (data || []) as Array<{
    id: string
    name: string
    email: string | null
    username: string | null
    role: string
    student_id: string | null
  }>

  const students: ManagedAccount[] = []
  const teachers: ManagedAccount[] = []
  for (const row of rows) {
    const account = mapAccount(row)
    if (account.role === "teacher") teachers.push(account)
    else students.push(account)
  }

  return { ok: true, students, teachers }
}

async function createStudentAccountInternal(input: CreateStudentInput) {
  const parsed = createStudentSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Enter display name, username, valid email, and a password of at least 8 characters.",
    }
  }

  const email = parsed.data.email.toLowerCase()
  const studentId = parsed.data.studentId?.trim() || null
  const supabase = await createClient()
  const created = await supabase.rpc("conet_create_student", {
    p_email: email,
    p_name: parsed.data.name,
    p_password: parsed.data.password,
    p_student_id: studentId,
    p_username: parsed.data.username,
  })

  if (!created.error) {
    revalidateAccounts()
    return { ok: true as const, pendingConfirm: false, email, username: parsed.data.username }
  }
  if (!missingFunction(created.error)) {
    return { ok: false as const, error: friendly(created.error.message) }
  }

  const signup = await detachedAuthClient().auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name, role: "student", username: parsed.data.username },
    },
  })
  if (signup.error) return { ok: false as const, error: friendly(signup.error.message) }

  const identities = signup.data.user?.identities
  if (signup.data.user && identities && identities.length === 0) {
    return { ok: false as const, error: "An account with this email already exists." }
  }

  if (signup.data.user?.id) {
    await supabase
      .from("ConetUsers")
      .update({
        student_id: studentId,
        name: parsed.data.name,
        email,
        username: parsed.data.username,
      })
      .eq("auth_id", signup.data.user.id)
  }

  revalidateAccounts()
  const pendingConfirm = !signup.data.session && !signup.data.user?.email_confirmed_at
  return { ok: true as const, pendingConfirm, email, username: parsed.data.username }
}

export async function createStudentAccount(input: CreateStudentInput) {
  const session = await teacherContext()
  if (!session.ok) return session
  return createStudentAccountInternal(input)
}

export async function importStudentAccounts(rows: ImportStudentRow[]) {
  const session = await teacherContext()
  if (!session.ok) return session

  const parsed = z.array(createStudentSchema).max(500).safeParse(rows)

  if (!parsed.success) return { ok: false as const, error: "The spreadsheet has no valid rows to import." }

  const results: ImportRowResult[] = []
  let created = 0

  for (const row of parsed.data) {
    const result = await createStudentAccountInternal({
      name: row.name,
      username: row.username,
      email: row.email,
      password: row.password,
      studentId: row.studentId,
    })
    if (result.ok) {
      created += 1
      results.push({ name: row.name, email: row.email, ok: true })
    } else {
      results.push({ name: row.name, email: row.email, ok: false, error: result.error })
    }
  }

  return { ok: true as const, created, results }
}

export async function createTeacherAccount(name: string, email: string, password: string) {
  const session = await teacherContext()
  if (!session.ok) return session

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().email().max(200),
      password: z.string().min(8).max(128),
    })
    .safeParse({ name, email, password })
  if (!parsed.success) return { ok: false as const, error: "Enter a name, valid email, and a password of at least 8 characters." }

  const supabase = await createClient()
  const created = await supabase.rpc("conet_create_teacher", {
    p_email: parsed.data.email,
    p_name: parsed.data.name,
    p_password: parsed.data.password,
  })

  if (!created.error) {
    revalidateAccounts()
    return { ok: true as const, pendingConfirm: false }
  }
  if (!missingFunction(created.error)) {
    return { ok: false as const, error: friendly(created.error.message) }
  }

  const signup = await detachedAuthClient().auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name, role: "teacher" } },
  })
  if (signup.error) return { ok: false as const, error: friendly(signup.error.message) }

  const identities = signup.data.user?.identities
  if (signup.data.user && identities && identities.length === 0) {
    return { ok: false as const, error: "An account with this email already exists." }
  }

  revalidateAccounts()
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

  revalidateAccounts()
  return { ok: true as const, fallbackPassword: INITIAL_STUDENT_PASSWORD }
}

export async function deleteStudentAccounts(userIds: string[]) {
  const session = await teacherContext()
  if (!session.ok) return session

  const parsed = z.array(z.string().uuid()).min(1).max(500).safeParse(userIds)
  if (!parsed.success) return { ok: false as const, error: "Select at least one student to delete." }

  const supabase = await createClient()
  const result = await supabase.rpc("conet_delete_students", { p_user_ids: parsed.data })
  if (result.error) {
    if (missingFunction(result.error)) {
      return {
        ok: false as const,
        error:
          "Account deletion is not ready yet. Run supabase/conet-accounts.sql in the Supabase SQL editor, then try again.",
      }
    }
    return { ok: false as const, error: friendly(result.error.message) }
  }

  const deleted = typeof result.data === "number" ? result.data : 0
  if (deleted === 0) {
    return { ok: false as const, error: "No student accounts were deleted. They may already have been removed." }
  }

  revalidateAccounts()
  return { ok: true as const, deleted }
}
