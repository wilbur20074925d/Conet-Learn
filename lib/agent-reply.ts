import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { buildNateSystemPrompt } from "@/components/prompt design/nate-prompt"
import { buildRemySystemPrompt } from "@/components/prompt design/remy-prompt"
import { MODEL_SETTINGS, type AgentContext } from "@/components/prompt design/shared"
import { AGENT_DISPLAY_NAME, NATE_THINKING, NATE_USER_ID, stripAgentSpeakerPrefix, stripFigures, type NateMode } from "./nate"

type HistoryTurn = {
  user_id: string
  name: string
  content: string
}

type ChatContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>

type ContextRow = { name?: string | null; content?: string | null }

const NOTE_LIMIT = 1500

export async function loadAgentContext(
  supabase: SupabaseClient,
  groupId: string,
  courseMaterials?: string
): Promise<AgentContext> {
  const rpc = await supabase.rpc("conet_agent_group_context", { p_group_id: groupId })
  if (!rpc.error && Array.isArray(rpc.data)) {
    return contextFromRows(rpc.data as ContextRow[], courseMaterials)
  }

  const members = await supabase
    .from("ConetGroupMembers")
    .select("user_id, ConetUsers(name, role)")
    .eq("group_id", groupId)
  const names = new Map<string, string>()
  for (const row of (members.data || []) as Array<{
    user_id: string
    ConetUsers: { name: string; role: string } | { name: string; role: string }[] | null
  }>) {
    const person = Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
    if (!person || person.role === "ai" || person.role === "teacher") continue
    const name = person.name?.trim()
    if (name) names.set(row.user_id, name)
  }

  const documents = await supabase.from("ConetDocuments").select("user_id, content").eq("group_id", groupId)
  const rows: ContextRow[] = [...names.entries()].map(([userId, name]) => ({
    name,
    content: ((documents.data || []) as Array<{ user_id: string; content: string | null }>).find(
      (doc) => doc.user_id === userId
    )?.content,
  }))
  return contextFromRows(rows, courseMaterials)
}

function contextFromRows(rows: ContextRow[], courseMaterials?: string): AgentContext {
  const members: string[] = []
  const initialNotes: AgentContext["initialNotes"] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = (row.name || "").trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    members.push(name)
    const content = ideaText(row.content)
    if (content) initialNotes.push({ name, content })
  }
  return {
    members,
    initialNotes,
    ...(courseMaterials ? { courseMaterials } : {}),
  }
}

function ideaText(raw: string | null | undefined): string {
  if (!raw) return ""
  let thoughts = ""
  let insights = ""
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    if (parsed && typeof parsed === "object") {
      thoughts = parsed.part1_concept1 || parsed.field1 || ""
      insights = parsed.part1_concept2 || parsed.field2 || ""
    }
  } catch {
    thoughts = raw
  }
  const parts = [thoughts.trim(), insights.trim() ? `Later reflection: ${insights.trim()}` : ""].filter(Boolean)
  return parts.join("\n").slice(0, NOTE_LIMIT)
}

function systemPrompt(mode: NateMode, ctx: AgentContext): string {
  if (mode === 2) return buildRemySystemPrompt(ctx, AGENT_DISPLAY_NAME)
  return buildNateSystemPrompt(ctx, AGENT_DISPLAY_NAME)
}

export async function requestNateReply(
  history: HistoryTurn[],
  userMessage: string,
  mode: NateMode,
  figures: string[] = [],
  materials?: { text: string; images: string[] },
  context?: AgentContext
): Promise<string> {
  const apiKey = process.env.VITE_ZENMUX_API_KEY
  if (!apiKey) {
    return "Sorry, I'm not configured properly. Please check the API key."
  }
  if (mode === 3) return ""

  const ctx: AgentContext = {
    members: context?.members ?? [],
    initialNotes: context?.initialNotes ?? [],
    courseMaterials: context?.courseMaterials || materials?.text || undefined,
  }

  const turns = history.filter((msg) => msg.content !== NATE_THINKING)
  const lastTurn = turns[turns.length - 1]
  const repeated =
    lastTurn &&
    lastTurn.user_id !== NATE_USER_ID &&
    stripFigures(lastTurn.content) === stripFigures(userMessage)
  const conversation: Array<{ role: string; content: ChatContent }> = (repeated ? turns.slice(0, -1) : turns).map((msg) => {
    const body = stripFigures(msg.content) || "shared a figure."
    const fromAgent = msg.user_id === NATE_USER_ID
    return {
      role: fromAgent ? "assistant" : "user",
      content: fromAgent ? stripAgentSpeakerPrefix(body) || body : `${msg.name}: ${body}`,
    }
  })

  const asked = stripFigures(userMessage) || "Please read this figure and tell us what you notice."
  const question = figures.length
    ? `${asked}\n\nA figure is attached. Read what is visible in it, then respond to the question.`
    : asked
  const latest: ChatContent = figures.length
    ? [
        { type: "text", text: question },
        ...figures.slice(0, 1).map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ]
    : question
  conversation.push({ role: "user", content: latest })

  const materialFigures: ChatContent | null = materials?.images.length
    ? [
        { type: "text", text: "These figures belong to the session materials. Read them before the discussion." },
        ...materials.images.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ]
    : null
  const messages = [
    { role: "system", content: systemPrompt(mode, ctx) },
    ...(materialFigures ? [{ role: "user", content: materialFigures }] : []),
    ...conversation,
  ]

  try {
    const response = await fetch("https://zenmux.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:3000",
        "X-Title": "CoNetLearn",
      },
      body: JSON.stringify({
        model: MODEL_SETTINGS.model,
        messages,
        temperature: MODEL_SETTINGS.temperature,
        max_tokens: MODEL_SETTINGS.max_tokens,
      }),
    })

    if (!response.ok) {
      console.error("ZenMux API error:", response.status, response.statusText)
      return "Sorry, I'm having trouble connecting to my AI service right now."
    }

    const data = await response.json()
    const raw = String(data.choices?.[0]?.message?.content || "I'm not sure how to respond to that.")
    return stripAgentSpeakerPrefix(raw) || raw
  } catch (error) {
    console.error("Error calling ZenMux API:", error)
    return "Sorry, I encountered an error while processing your request."
  }
}
