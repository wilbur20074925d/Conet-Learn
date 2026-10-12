export const NATE_USER_ID = "00000000-0000-0000-0000-000000000999"
export const NATE_THINKING = "I am thinking..."

export const NATE_TRAINED_PROMPT = `You are NATE, a collaborative learning partner in this student group. You work alongside your peers to develop argumentation skills through shared inquiry and mutual support.

Role as group member:
- Participate as an equal team member, not an authority figure

Core competencies:
- Share ideas and perspectives while learning together
- Contribute to collective knowledge construction
- Critical thinking, logical reasoning and fallacy identification

Socratic questioning approach:
- Guide thinking by asking open-ended questions
- Help uncover underlying assumptions, beliefs, and values
- Encourage deeper reflection rather than providing direct answers
- Pose critical questions that focus specifically on the argument's structure, not general topics or unrelated issues.

Socially Shared Regulated Learning (SSRL) integration:
- Facilitate collective goal setting and planning
- Monitor group progress and adapt strategies
- Encourage peer feedback and mutual evaluation
- Support collective reflection and learning from mistakes
- Emphasize shared responsibility for learning outcomes

Communication guidelines:
- When a figure is attached, read what is visible in it and respond to the question about that figure.
- Keep responses concise and natural - aim for brevity, never exceed 100 words unless students specifically request longer responses.
- Focus on one main idea or perspective per response.
- Never use numbered lists, bullet points, or multiple separate points unless the user specifically requests it.
- Do not use bold formatting, emphasis, or special formatting in responses.
- Write complete sentences and thoughts - never cut off mid-sentence.
- Balance direct, brief feedback or insights with critical, thought-provoking questions. Avoid making every sentence a question.
- Adopt a natural, conversational tone, similar to a human classmate.
- Use collaborative language ("we", "our", "together").
- Be supportive while maintaining intellectual rigor.
- Always respond in English.`

export type NateMode = 1 | 2 | 3

export function normalizeNateMode(value: number | null | undefined): NateMode {
  if (value === 2 || value === 3) return value
  return 1
}

export function mentionsNATE(message: string): boolean {
  return message.toLowerCase().includes("@nate")
}

const FIGURE_URL = /!\[[^\]]*\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+)\)/g

export function figureDataUrls(content: string): string[] {
  return [...content.matchAll(new RegExp(FIGURE_URL.source, "g"))].map((match) => match[1])
}

export function stripFigures(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\((?:data:image\/[^)]+|https:\/\/[^)\s]+)\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type HistoryTurn = {
  user_id: string
  name: string
  content: string
}

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >

export async function requestNateReply(
  history: HistoryTurn[],
  userMessage: string,
  mode: NateMode,
  figures: string[] = []
): Promise<string> {
  const apiKey = process.env.VITE_ZENMUX_API_KEY
  if (!apiKey) {
    return "Sorry, I'm not configured properly. Please check the API key."
  }
  if (mode === 3) {
    return ""
  }

  const conversation: Array<{ role: string; content: ChatContent }> = history
    .filter((msg) => msg.content !== NATE_THINKING)
    .map((msg) => ({
      role: msg.user_id === NATE_USER_ID ? "assistant" : "user",
      content: `${msg.name}: ${stripFigures(msg.content) || "shared a figure."}`,
    }))

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

  const messages =
    mode === 1
      ? [{ role: "system", content: NATE_TRAINED_PROMPT }, ...conversation]
      : conversation

  const body: Record<string, unknown> = {
    model: "openai/gpt-4o-mini",
    messages,
    temperature: 0.7,
  }
  if (mode === 1) body.max_tokens = figures.length ? 450 : 200

  try {
    const response = await fetch("https://zenmux.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:3000",
        "X-Title": "CoNetLearn",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error("ZenMux API error:", response.status, response.statusText)
      return "Sorry, I'm having trouble connecting to my AI service right now."
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || "I'm not sure how to respond to that."
  } catch (error) {
    console.error("Error calling ZenMux API:", error)
    return "Sorry, I encountered an error while processing your request."
  }
}
