import { AGENT_DISPLAY_NAME, NATE_USER_ID } from "./nate"

export interface Message {
  id: string
  content: string
  created_at: string
  user_id: string
  name: string
  avatar_url: string | null
  is_ai: boolean
  authorRole?: string
  reply_to?: string | null
  is_reply?: boolean
  original_message?: {
    id: string
    content: string
    user_name: string
  } | null
}

export type RawMessage = {
  id: string
  content: string
  created_at: string
  user_id: string
  reply_to: string | null
  is_reply: boolean
  ConetUsers:
    | { name: string; avatar_url: string | null; role: string }
    | { name: string; avatar_url: string | null; role: string }[]
    | null
}

function authorOf(row: RawMessage) {
  return Array.isArray(row.ConetUsers) ? row.ConetUsers[0] : row.ConetUsers
}

export function mapMessageRows(rows: RawMessage[]): Message[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return rows.map((row) => {
    const author = authorOf(row)
    const original = row.reply_to ? byId.get(row.reply_to) : undefined
    const originalAuthor = original ? authorOf(original) : null
    return {
      id: row.id,
      content: row.content,
      created_at: row.created_at,
      user_id: row.user_id,
      name: row.user_id === NATE_USER_ID || author?.role === "ai" ? AGENT_DISPLAY_NAME : author?.name || "Member",
      avatar_url: author?.avatar_url || null,
      is_ai: author?.role === "ai" || row.user_id === NATE_USER_ID,
      authorRole: author?.role,
      reply_to: row.reply_to,
      is_reply: row.is_reply,
      original_message: original
        ? {
            id: original.id,
            content: original.content,
            user_name:
              original.user_id === NATE_USER_ID || originalAuthor?.role === "ai"
                ? AGENT_DISPLAY_NAME
                : originalAuthor?.name || "Member",
          }
        : null,
    }
  })
}
