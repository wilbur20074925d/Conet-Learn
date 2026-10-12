"use client"

import { startTransition } from "react"

type Refreshable = { refresh: () => void }

/** Refresh after the server action's response has settled, so the follow-up fetch is not aborted. */
export function refreshRoute(router: Refreshable) {
  window.setTimeout(() => {
    startTransition(() => {
      router.refresh()
    })
  }, 0)
}
