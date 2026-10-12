"use client"

import { createClient } from "@/lib/supabase/browser"
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env"

function authStorageKey() {
  const ref = new URL(supabaseUrl()).hostname.split(".")[0]
  return `sb-${ref}-auth-token`
}

function readCookies() {
  const cookies = new Map<string, string>()
  if (typeof document === "undefined" || !document.cookie) return cookies
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    cookies.set(trimmed.slice(0, eq), trimmed.slice(eq + 1))
  }
  return cookies
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function readAccessToken() {
  const key = authStorageKey()
  const cookies = readCookies()
  let raw = cookies.get(key) ?? ""
  if (!raw) {
    const chunks: string[] = []
    for (let index = 0; ; index += 1) {
      const chunk = cookies.get(`${key}.${index}`)
      if (!chunk) break
      chunks.push(chunk)
    }
    raw = chunks.join("")
  }
  if (!raw) return null

  try {
    const payload = raw.startsWith("base64-") ? decodeBase64Url(raw.slice("base64-".length)) : raw
    const session = JSON.parse(payload) as { access_token?: string }
    return session.access_token || null
  } catch {
    return null
  }
}

function clearAuthCookies() {
  const key = authStorageKey()
  const names = [...readCookies().keys()].filter(
    (name) => name === key || name.startsWith(`${key}.`) || name.startsWith(`${key}-`)
  )
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
  }
}

function revokeAccessToken(token: string) {
  const url = `${supabaseUrl()}/auth/v1/logout?scope=local`
  void fetch(url, {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: supabasePublishableKey(),
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {})
}

// Drop the browser session immediately. auth.signOut() waits on the Auth API
// before it clears cookies, which is what makes the logout button feel stuck.
export function endBrowserSession() {
  try {
    const supabase = createClient()
    void supabase.auth.stopAutoRefresh()
    const token = readAccessToken()
    clearAuthCookies()
    if (token) revokeAccessToken(token)
    void supabase.auth.signOut({ scope: "local" })
  } catch {
    // Navigation still proceeds so a cookie-parse failure cannot trap the page.
  }
}
