"use server"

import { redirect } from "next/navigation"
import { loginEmailFromIdentifier } from "./login-identity"
import { createClient } from "./supabase/server"

export async function signIn(email: string, password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: loginEmailFromIdentifier(email),
    password,
  })

  if (error) {
    const message = error.message.toLowerCase()
    return {
      error: message.includes("confirm")
        ? "This email still needs to be confirmed before it can sign in."
        : "Wrong username or password. Please try again.",
    }
  }

  redirect("/dashboard")
}
