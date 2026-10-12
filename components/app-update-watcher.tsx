"use client"

import { useEffect } from "react"

const RELOAD_GUARD_KEY = "conet_version_reload"
const CHECK_INTERVAL_MS = 60_000
const CACHE_BUSTER_PARAM = "_cb"
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || ""

async function unregisterLegacyServiceWorkers() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch (error) {
    console.warn("[AppUpdate] Failed to unregister service workers:", error)
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch (error) {
    console.warn("[AppUpdate] Failed to clear Cache Storage:", error)
  }
}

async function fetchRemoteVersion(): Promise<string | null> {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  })
  if (!response.ok) return null
  const data = (await response.json()) as { version?: unknown }
  return typeof data.version === "string" && data.version.length > 0 ? data.version : null
}

function stripCacheBusterFromUrl() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(CACHE_BUSTER_PARAM)) return
  url.searchParams.delete(CACHE_BUSTER_PARAM)
  const search = url.searchParams.toString()
  const clean = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`
  window.history.replaceState(window.history.state, "", clean)
}

function reloadForNewVersion(remoteVersion: string) {
  const alreadyTried = sessionStorage.getItem(RELOAD_GUARD_KEY)
  sessionStorage.setItem(RELOAD_GUARD_KEY, remoteVersion)

  if (alreadyTried === remoteVersion) {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(CACHE_BUSTER_PARAM)) {
      url.searchParams.set(CACHE_BUSTER_PARAM, Date.now().toString())
      window.location.replace(url.toString())
    }
    return
  }

  window.location.reload()
}

async function checkForAppUpdate() {
  try {
    const remoteVersion = await fetchRemoteVersion()
    if (!remoteVersion || remoteVersion === APP_VERSION) return
    reloadForNewVersion(remoteVersion)
  } catch {
    // Ignore network errors; the next interval or tab-focus check will retry.
  }
}

export default function AppUpdateWatcher() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return

    stripCacheBusterFromUrl()
    void unregisterLegacyServiceWorkers()
    void checkForAppUpdate()

    const interval = window.setInterval(() => {
      void checkForAppUpdate()
    }, CHECK_INTERVAL_MS)

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkForAppUpdate()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return null
}
