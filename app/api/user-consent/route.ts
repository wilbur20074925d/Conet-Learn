import { NextRequest, NextResponse } from "next/server"
import { withApiLogging } from "@/lib/api-logger"
import { createClient } from "@/lib/supabase/server"

export const POST = withApiLogging("user-consent:POST", async (request: NextRequest) => {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: "User not authenticated" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.consentGiven !== "boolean") {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
  }

  const profile = await supabase.from("ConetUsers").select("id").eq("auth_id", authData.user.id).maybeSingle()
  if (!profile.data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const saved = await supabase.from("ConetUserConsent").upsert(
    {
      user_id: profile.data.id,
      consent_given: body.consentGiven,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )

  if (saved.error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: "Consent status saved successfully" })
})

export const GET = withApiLogging("user-consent:GET", async (request: NextRequest) => {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return NextResponse.json({ error: "User not authenticated" }, { status: 401 })
  }

  const requested = new URL(request.url).searchParams.get("userId")
  const profile = await supabase.from("ConetUsers").select("id").eq("auth_id", authData.user.id).maybeSingle()
  if (!profile.data) {
    return NextResponse.json({ hasConsentRecord: false, consentGiven: null, createdAt: null })
  }
  if (requested && requested !== profile.data.id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const consent = await supabase
    .from("ConetUserConsent")
    .select("consent_given, created_at")
    .eq("user_id", profile.data.id)
    .maybeSingle()

  return NextResponse.json({
    hasConsentRecord: Boolean(consent.data),
    consentGiven: consent.data ? consent.data.consent_given : null,
    createdAt: consent.data ? consent.data.created_at : null,
  })
})
