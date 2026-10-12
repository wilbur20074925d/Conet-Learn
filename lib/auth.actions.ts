"use server"

import { redirect } from "next/navigation"
import { createClient } from "./supabase/server"

export async function signIn(email: string, password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) {
    const message = error.message.toLowerCase()
    return {
      error: message.includes("confirm")
        ? "This email still needs to be confirmed before it can sign in."
        : "Wrong email or password. Please try again.",
    }
  }

  redirect("/")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
