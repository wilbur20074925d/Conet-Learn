"use client"

import { canonicalSession } from "@/lib/canonical-session"
import { createClient } from "@/lib/supabase/browser"

export { canonicalSession }

type NewSession = {
  id: string
  title: string
  createdAt: string
  createdBy: string | null
}

function friendly(message: string) {
  if (message.includes("Only students can create")) return "Only students can create a chat session."
  if (message.includes("You cannot delete")) return "You can delete chat sessions you created."
  if (message.includes("not a group member")) return "Join a group before starting a chat session."
  if (message.includes("invalid name")) return "Use a session title between 1 and 80 characters."
  if (message.includes("not authenticated") || message.includes("JWT")) return "Please sign in again."
  if (/failed to fetch|network/i.test(message)) return "Could not reach the server. Check your connection and try again."
  return "Something went wrong. Please try again."
}

export function isTempSessionId(sessionId: string) {
  return sessionId.startsWith("temp-")
}

export function writeSessionQuery(sessionId: string | null) {
  const url = new URL(window.location.href)
  if (sessionId) url.searchParams.set("session", sessionId)
  else url.searchParams.delete("session")
  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (current === next) return
  // Pass Next's existing history state through. A fresh state object makes the App Router
  // treat the URL change as a navigation and reload the whole classroom.
  const state = window.history.state
  const nextState = state?.__NA || state?._N ? state : { ...state, __NA: true }
  window.history.replaceState(nextState, "", next)
}

export async function createChatSessionNow(
  groupId: string,
  title: string,
  userId: string
): Promise<{ ok: true; session: NewSession } | { ok: false; error: string }> {
  const clean = title.trim()
  if (!clean || clean.length > 80) {
    return { ok: false, error: "Use a session title between 1 and 80 characters." }
  }

  const { data, error } = await createClient().rpc("conet_create_session", {
    p_group_id: groupId,
    p_title: clean,
  })
  if (error || !data) return { ok: false, error: friendly(error?.message || "") }

  return {
    ok: true,
    session: {
      id: data as string,
      title: clean,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    },
  }
}

export async function deleteChatSessionNow(
  sessionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createClient().rpc("conet_delete_session", { p_session_id: sessionId })
  if (error) return { ok: false, error: friendly(error.message) }
  return { ok: true }
}
