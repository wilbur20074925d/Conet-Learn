import {
  AGENT_DISPLAY_NAME,
  AGENT_OPENING_MESSAGE,
  mentionsNATE,
  NATE_THINKING,
  NATE_USER_ID,
  stripAgentSpeakerPrefix,
} from "@/lib/nate"
import type { Message } from "@/lib/map-messages"

export type AiModeLabel = "Nate" | "Remy" | "Off"

export function aiModeLabel(newintervene: number): AiModeLabel {
  if (newintervene === 1) return "Nate"
  if (newintervene === 2) return "Remy"
  return "Off"
}

export type ChatAudienceExport = {
  audience: "ai" | "user" | "group"
  audienceLabel: string
  via: "mention" | "reply" | "broadcast" | null
  targetUserIds: string[]
  targetNames: string[]
}

type Member = { id: string; name: string }

/** Placeholder while the model runs — not a real AI turn for export. */
export function isThinkingPlaceholder(message: Message): boolean {
  if (message.user_id !== NATE_USER_ID && !message.is_ai) return false
  const text = stripAgentSpeakerPrefix(message.content).trim()
  if (text === NATE_THINKING) return true
  if (/^i am thinking\.{0,3}$/i.test(text)) return true
  return false
}

function isAgentOpening(message: Message): boolean {
  if (!message.is_ai && message.user_id !== NATE_USER_ID) return false
  const text = message.content.trim()
  if (text === AGENT_OPENING_MESSAGE) return true
  return text.includes("your AI group member") && text.includes(`@${AGENT_DISPLAY_NAME}`)
}

function memberForMessage(message: Message, members: Member[]): Member | null {
  const known = members.find((item) => item.id === message.user_id)
  if (known) return known
  if (message.is_ai || message.user_id === NATE_USER_ID) return null
  const name = message.name?.trim()
  if (!name) return null
  return { id: message.user_id, name }
}

function classifyAiMessageAudience(
  message: Message,
  sessionMessages: Message[],
  members: Member[]
): ChatAudienceExport {
  if (isAgentOpening(message)) {
    return {
      audience: "group",
      audienceLabel: "whole group",
      via: "broadcast",
      targetUserIds: [],
      targetNames: [],
    }
  }

  const index = sessionMessages.findIndex((item) => item.id === message.id)
  if (index <= 0) {
    return {
      audience: "group",
      audienceLabel: "whole group",
      via: "broadcast",
      targetUserIds: [],
      targetNames: [],
    }
  }

  for (let i = index - 1; i >= 0; i--) {
    const prior = sessionMessages[i]
    if (isThinkingPlaceholder(prior)) continue
    if (prior.is_ai || prior.user_id === NATE_USER_ID) continue

    const target = memberForMessage(prior, members)
    if (!target) continue

    return {
      audience: "user",
      audienceLabel: target.name,
      via: "reply",
      targetUserIds: [target.id],
      targetNames: [target.name],
    }
  }

  return {
    audience: "group",
    audienceLabel: "whole group",
    via: "broadcast",
    targetUserIds: [],
    targetNames: [],
  }
}

function isAiName(name: string) {
  const lower = name.toLowerCase()
  return lower.includes("remy") || lower.includes("nate") || name === AGENT_DISPLAY_NAME
}

function findMentionedMembers(content: string, members: Member[]): Member[] {
  const lower = content.toLowerCase()
  const hits: Member[] = []
  const taken: Array<[number, number]> = []

  const needles = [...members]
    .map((member) => ({ member, needle: `@${member.name.trim().toLowerCase()}` }))
    .filter((item) => item.needle.length > 1)
    .sort((a, b) => b.needle.length - a.needle.length)

  for (const { member, needle } of needles) {
    let from = 0
    while (from < lower.length) {
      const index = lower.indexOf(needle, from)
      if (index < 0) break
      const end = index + needle.length
      const overlaps = taken.some(([start, stop]) => index < stop && end > start)
      if (!overlaps) {
        taken.push([index, end])
        hits.push(member)
      }
      from = index + 1
    }
  }

  return hits
}

export function classifyMessageAudience(
  message: Message,
  members: Member[],
  sessionMessages: Message[] = []
): ChatAudienceExport {
  if (message.is_ai || message.user_id === NATE_USER_ID) {
    return classifyAiMessageAudience(message, sessionMessages, members)
  }

  if (message.is_reply && message.original_message) {
    const originalName = message.original_message.user_name
    if (isAiName(originalName)) {
      return {
        audience: "ai",
        audienceLabel: "AI",
        via: "reply",
        targetUserIds: [NATE_USER_ID],
        targetNames: [AGENT_DISPLAY_NAME],
      }
    }
    const member = members.find((item) => item.name === originalName)
    if (member) {
      return {
        audience: "user",
        audienceLabel: member.name,
        via: "reply",
        targetUserIds: [member.id],
        targetNames: [member.name],
      }
    }
  }

  if (mentionsNATE(message.content)) {
    return {
      audience: "ai",
      audienceLabel: "AI",
      via: "mention",
      targetUserIds: [NATE_USER_ID],
      targetNames: [AGENT_DISPLAY_NAME],
    }
  }

  const mentioned = findMentionedMembers(message.content, members)
  if (mentioned.length > 0) {
    return {
      audience: "user",
      audienceLabel: mentioned.map((item) => item.name).join(", "),
      via: "mention",
      targetUserIds: mentioned.map((item) => item.id),
      targetNames: mentioned.map((item) => item.name),
    }
  }

  return {
    audience: "group",
    audienceLabel: "whole group",
    via: "broadcast",
    targetUserIds: [],
    targetNames: [],
  }
}

export function exportChatMessageRow(
  message: Message,
  members: Member[],
  groupAiMode: AiModeLabel,
  sessionMessages: Message[] = []
) {
  const audience = classifyMessageAudience(message, members, sessionMessages)
  return {
    id: message.id,
    createdAt: message.created_at,
    authorId: message.user_id,
    authorName: message.name,
    authorRole: message.authorRole ?? null,
    isAiMessage: message.is_ai,
    content: message.content,
    isReply: Boolean(message.is_reply),
    replyToMessageId: message.reply_to ?? null,
    replyToPreview: message.original_message
      ? {
          id: message.original_message.id,
          authorName: message.original_message.user_name,
          content: message.original_message.content,
        }
      : null,
    groupAiMode,
    aiTag: message.is_ai ? groupAiMode : groupAiMode,
    chatAudience: audience.audience,
    chatAudienceLabel: audience.audienceLabel,
    chatAudienceVia: audience.via,
    chatTargetUserIds: audience.targetUserIds,
    chatTargetNames: audience.targetNames,
  }
}
