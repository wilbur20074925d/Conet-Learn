import { NextRequest, NextResponse } from "next/server"
import { withApiLogging } from "@/lib/api-logger"
import { createClient } from "@/lib/supabase/server"

export const GET = withApiLogging("user-consent-status:GET", async () => {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: "User not authenticated" }, { status: 401 })
  }

  const profile = await supabase.from("ConetUsers").select("id").eq("auth_id", authData.user.id).maybeSingle()
  if (profile.error) {
    const missing = profile.error.code === "PGRST205"
    return NextResponse.json(
      { error: missing ? "Conet tables are not ready" : "Internal server error" },
      { status: missing ? 503 : 500 }
    )
  }
  if (!profile.data) {
    return NextResponse.json({ hasConsentRecord: false, consentGiven: null, createdAt: null })
  }

  const consent = await supabase
    .from("ConetUserConsent")
    .select("consent_given, created_at")
    .eq("user_id", profile.data.id)
    .maybeSingle()

  if (consent.error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  return NextResponse.json({
    hasConsentRecord: Boolean(consent.data),
    consentGiven: consent.data ? consent.data.consent_given : null,
    createdAt: consent.data ? consent.data.created_at : null,
  })
})
