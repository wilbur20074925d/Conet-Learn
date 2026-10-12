"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Message } from "@/lib/map-messages"
import { fetchSessionMessages } from "@/lib/seminar-sync"
import { createClient } from "@/lib/supabase/browser"

export const EMPTY_MESSAGES: Message[] = []

export function useSessionBundles(sessionKey: string, initialId: string | null, initialMessages: Message[]) {
  const [bundles, setBundles] = useState<Record<string, Message[]>>(() =>
    initialId ? { [initialId]: initialMessages } : {}
  )
  const bundlesRef = useRef(bundles)
  bundlesRef.current = bundles
  const inflight = useRef(new Set<string>())

  const remember = useCallback((sessionId: string, messages: Message[]) => {
    setBundles((current) => {
      const next = { ...current, [sessionId]: messages }
      bundlesRef.current = next
      return next
    })
  }, [])

  const prefetch = useCallback((sessionId: string) => {
    if (!sessionId || sessionId.startsWith("temp-")) return
    if (Object.prototype.hasOwnProperty.call(bundlesRef.current, sessionId) || inflight.current.has(sessionId)) return
    inflight.current.add(sessionId)
    void fetchSessionMessages(createClient(), sessionId).then((latest) => {
      inflight.current.delete(sessionId)
      if (!latest) return
      setBundles((current) => {
        if (Object.prototype.hasOwnProperty.call(current, sessionId)) return current
        const next = { ...current, [sessionId]: latest }
        bundlesRef.current = next
        return next
      })
    })
  }, [])

  useEffect(() => {
    const ids = sessionKey ? sessionKey.split("|") : []
    const timer = window.setTimeout(() => {
      for (const id of ids) prefetch(id)
    }, 60)
    return () => window.clearTimeout(timer)
  }, [sessionKey, prefetch])

  return { bundles, remember, prefetch }
}
