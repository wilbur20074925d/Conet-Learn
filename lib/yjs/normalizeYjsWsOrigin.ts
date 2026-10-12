/** Host only (wss://host). Also repairs the `railway.appa` concatenation typo. */
export function normalizeYjsWsOrigin(raw: string): string {
  let value = (raw || "").trim() || "wss://conet-learn-production.up.railway.app"
  value = value.replace(/railway\.appa\b/gi, "railway.app")
  value = value.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://")
  try {
    const parsed = new URL(value)
    const protocol = parsed.protocol === "http:" || parsed.protocol === "ws:" ? "ws:" : "wss:"
    const host = parsed.host.replace(/railway\.appa$/i, "railway.app")
    return `${protocol}//${host}`
  } catch {
    return "wss://conet-learn-production.up.railway.app"
  }
}

export function getYjsWsUrl(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_YJS_WS_URL) {
    return process.env.NEXT_PUBLIC_YJS_WS_URL
  }
  return "wss://conet-learn-production.up.railway.app"
}
