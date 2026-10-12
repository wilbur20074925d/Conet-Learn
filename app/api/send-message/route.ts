import { NextRequest, NextResponse } from "next/server"
import { withApiLogging } from "@/lib/api-logger"
import { createClient } from "@/lib/supabase/server"
import { finishNateReply, getSessionContext } from "@/lib/actions"
import { inGroup } from "@/lib/session-membership"
import { NATE_THINKING, NATE_USER_ID, mentionsNATE } from "@/lib/nate"

export const POST = withApiLogging("send-message:POST", async (request: NextRequest) => {
  const session = await getSessionContext()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.error === "Unauthorized" ? 401 : 400 })
  }

  try {
    const body = await request.json()
    const message = typeof body.message === "string" ? body.message.trim() : ""
    const groupId = body.groupId
    const sessionId = body.sessionId
    const replyTo = typeof body.replyTo === "string" && body.replyTo ? body.replyTo : null

    if (!message) {
      return NextResponse.json({ error: "Message is required and cannot be empty" }, { status: 400 })
    }
    if (session.ctx.role !== "student" || typeof groupId !== "string" || !inGroup(session.ctx, groupId)) {
      return NextResponse.json({ error: "groupId is required" }, { status: 400 })
    }
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const inserted = await supabase.from("ConetMessages").insert({
      group_id: groupId,
      session_id: sessionId,
      user_id: session.ctx.profileId,
      content: message,
      reply_to: replyTo,
      is_reply: Boolean(replyTo),
    })
    if (inserted.error) {
      return NextResponse.json({ error: "Failed to send message", details: inserted.error.message }, { status: 500 })
    }

    let trigger = mentionsNATE(message)
    if (replyTo && !trigger) {
      const replied = await supabase.from("ConetMessages").select("user_id").eq("id", replyTo).maybeSingle()
      trigger = replied.data?.user_id === NATE_USER_ID
    }

    if (trigger && session.ctx.newintervene !== 3) {
      const thinking = await supabase
        .from("ConetMessages")
        .insert({
          group_id: groupId,
          session_id: sessionId,
          user_id: NATE_USER_ID,
          content: NATE_THINKING,
          is_reply: false,
        })
        .select("id")
        .single()
      if (thinking.data?.id) {
        await finishNateReply(groupId, sessionId, thinking.data.id)
      }
    }

    return NextResponse.json({ success: true, message: "Message sent successfully" })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to send message", details: errorMessage }, { status: 500 })
  }
})
