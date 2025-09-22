"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import sql from "./db"
import { setUserIdInCookie, deleteUserIdFromCookie } from "./session"

const loginSchema = z.object({
  studentId: z.coerce.number({ invalid_type_error: "Student ID must be a number" }),
  name: z.string().min(1, "Name cannot be empty"),
})

// Note: This function is now a standard Server Action, not for use with useActionState
export async function login(formData: FormData) {
  const validatedFields = loginSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!validatedFields.success) {
    // For simplicity, we redirect back with an error query parameter
    const errorMessage =
      validatedFields.error.flatten().fieldErrors.studentId?.[0] ||
      validatedFields.error.flatten().fieldErrors.name?.[0]
    return redirect(`/login?error=${encodeURIComponent(errorMessage || "Invalid input")}`)
  }

  const { studentId, name } = validatedFields.data

  try {
    const user = await sql<{ id: number }[]>`
      SELECT id FROM users WHERE id = ${studentId} AND name = ${name};
    `

    if (user.length === 0) {
      return redirect(`/login?error=${encodeURIComponent("Invalid student ID or name")}`)
    }

    // Set the user ID in the cookie
    await setUserIdInCookie(user[0].id)
  } catch (error) {
    console.error(error)
    return redirect(`/login?error=${encodeURIComponent("Wrong student ID or name, please try again.")}`)
  }

  // Redirect to the main page on success
  redirect("/")
}

export async function logout() {
  await deleteUserIdFromCookie()
  redirect("/login")
}
