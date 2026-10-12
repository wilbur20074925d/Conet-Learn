function publicEnv(value: string | undefined) {
  return (value ?? "").replace(/[\r\n]/g, "").trim()
}

export function supabaseUrl() {
  return publicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function supabasePublishableKey() {
  return publicEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}
