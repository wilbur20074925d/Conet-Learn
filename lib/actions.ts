"use server"

import { revalidatePath } from "next/cache"
import sql from "./db"
import { z } from "zod"
import { getUserIdFromCookie } from "./session"

// --- Type Definitions ---
export interface Message {
  id: number
  content: string
  created_at: string
  user_id: number
  name: string
  avatar_url: string
  reply_to?: number | null  
  is_reply?: boolean     
  original_message?: {      
    id: number
    content: string
    user_name: string
  }
}

export interface DocumentHistory {
  id: number
  user_id: number
  name: string
  avatar_url: string
  created_at: string
}

// --- Chatbot Configuration ---
const NATE_USER_ID = 999
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

// --- Message Actions ---
export async function getMessages(groupId: number): Promise<Message[]> {
  const messages = await sql<Message[]>`
    SELECT 
      m.id, 
      m.content, 
      m.created_at, 
      m.user_id, 
      m.reply_to,
      m.is_reply,
      u.name, 
      u.avatar_url,
      CASE 
        WHEN m.reply_to IS NOT NULL THEN
          (SELECT json_build_object(
            'id', orig_m.id,
            'content', orig_m.content,
            'user_name', orig_u.name
          ))
        ELSE NULL
      END as original_message
    FROM messages m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN messages orig_m ON m.reply_to = orig_m.id
    LEFT JOIN users orig_u ON orig_m.user_id = orig_u.id
    WHERE m.group_id = ${groupId}
    ORDER BY m.created_at ASC;
  `
  
  // 确保user_id是number类型
  return messages.map(msg => ({
    ...msg,
    user_id: Number(msg.user_id),
    reply_to: msg.reply_to ? Number(msg.reply_to) : null,
    original_message: msg.original_message ? {
      ...msg.original_message,
      id: Number(msg.original_message.id)
    } : undefined
  }))
}

const messageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  groupId: z.coerce.number(),
  replyTo: z.coerce.number().optional(), // 新增：可选的回复消息ID
})

// Check if message mentions NATE
function mentionsNATE(message: string): boolean {
  return message.toLowerCase().includes('@nate') || message.toLowerCase().includes('@nate ')
}

// Get recent chat history for context
async function getRecentChatHistory(groupId: number, limit: number = 10): Promise<Message[]> {
  const messages = await sql<Message[]>`
    SELECT m.id, m.content, m.created_at, m.user_id, u.name, u.avatar_url
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.group_id = ${groupId}
    ORDER BY m.created_at DESC
    LIMIT ${limit};
  `
  
  // 确保user_id是number类型
  return messages.map(msg => ({
    ...msg,
    user_id: Number(msg.user_id)
  }))
}

// Call OpenRouter API to get NATE's response
async function getNATEResponse(messages: Message[], userMessage: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    return "Sorry, I'm not configured properly. Please check the API key."
  }

  try {
    // Prepare conversation history for the AI
    const conversationHistory = messages
      .reverse() // Reverse to get chronological order
      .map(msg => ({
        role: msg.user_id === NATE_USER_ID ? "assistant" : "user",
        content: `${msg.name}: ${msg.content}`
      }))

    // Add the current user message
    conversationHistory.push({
      role: "user",
      content: userMessage
    })

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Student Chat App",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are NATE, a helpful AI assistant in a student group chat. You help students with their debate preparation. Help students to learn how to construct an argument(claim,evidence,reasoning) and how to identify the logical fallacies. Always respond in English."
          },
          ...conversationHistory
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status, response.statusText)
      return "Sorry, I'm having trouble connecting to my AI service right now."
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || "I'm not sure how to respond to that."
  } catch (error) {
    console.error('Error calling OpenRouter API:', error)
    return "Sorry, I encountered an error while processing your request."
  }
}

export async function sendMessage(prevState: any, formData: FormData) {
  const userId = await getUserIdFromCookie()
  if (!userId) return { error: "Unauthorized" }

  const validatedFields = messageSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!validatedFields.success) {
    return { error: "Invalid input." }
  }

  const { message, groupId, replyTo } = validatedFields.data

  try {
    // Insert the user's message with reply information
    await sql`
      INSERT INTO messages (group_id, user_id, content, reply_to, is_reply)
      VALUES (${groupId}, ${userId}, ${message}, ${replyTo || null}, ${replyTo ? true : false});
    `

    // Check if the message mentions NATE
    if (mentionsNATE(message)) {
      // First, insert "I am thinking..." message
      await sql`
        INSERT INTO messages (group_id, user_id, content)
        VALUES (${groupId}, ${NATE_USER_ID}, 'I am thinking...');
      `
      
      // Get recent chat history for context
      const recentMessages = await getRecentChatHistory(groupId, 10)
      
      // Get NATE's response
      const nateResponse = await getNATEResponse(recentMessages, message)
      
      // Insert NATE's actual response
      await sql`
        INSERT INTO messages (group_id, user_id, content)
        VALUES (${groupId}, ${NATE_USER_ID}, ${nateResponse});
      `
    }

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: "Failed to send message, please try again." }
  }
}

// --- Document Actions ---
export async function getDocument(groupId: number, userId?: number) {
  if (userId) {
    // 获取特定用户的文档
    const result = await sql<{ content: string }[]>`
      SELECT content FROM documents 
      WHERE group_id = ${groupId} AND user_id = ${userId};
    `
    return result[0]?.content ?? ""
  } else {
    // 获取共享文档（向后兼容）
    const result = await sql<{ content: string }[]>`
      SELECT content FROM documents WHERE group_id = ${groupId} AND user_id IS NULL;
    `
    return result[0]?.content ?? ""
  }
}

export async function getDocumentHistory(groupId: number, userId?: number): Promise<DocumentHistory[]> {
  if (userId) {
    // 获取特定用户的文档历史
    const doc = await sql<{ id: number }[]>`SELECT id FROM documents WHERE group_id = ${groupId} AND user_id = ${userId}`
    if (!doc.length) return []

    const history = await sql<DocumentHistory[]>`
      SELECT h.id, h.user_id, h.created_at, u.name, u.avatar_url
      FROM document_history h
      JOIN users u ON h.user_id = u.id
      WHERE h.document_id = ${doc[0].id}
      ORDER BY h.created_at DESC;
    `
    
    return history.map(item => ({
      ...item,
      user_id: Number(item.user_id)
    }))
  } else {
    // 获取共享文档历史（向后兼容）
    const doc = await sql<{ id: number }[]>`SELECT id FROM documents WHERE group_id = ${groupId} AND user_id IS NULL`
    if (!doc.length) return []

    const history = await sql<DocumentHistory[]>`
      SELECT h.id, h.user_id, h.created_at, u.name, u.avatar_url
      FROM document_history h
      JOIN users u ON h.user_id = u.id
      WHERE h.document_id = ${doc[0].id}
      ORDER BY h.created_at DESC;
    `
    
    return history.map(item => ({
      ...item,
      user_id: Number(item.user_id)
    }))
  }
}

export async function saveDocument(content: string | null | undefined, groupId: number) {
  const userId = await getUserIdFromCookie()
  if (!userId) return { error: "Unauthorized" }

  if (content === null || content === undefined) {
    return { error: "Invalid content." }
  }

  try {
    const doc = await sql<{ id: number; content: string }[]>`
      SELECT id, content FROM documents WHERE group_id = ${groupId};
    `
    if (!doc.length) {
      return { error: "Document not found." }
    }
    const documentId = doc[0].id
    const currentContent = doc[0].content

    if (content === currentContent) {
      return { success: true, changed: false }
    }

    // 使用单独的查询而不是事务
    try {
      // 更新文档
      await sql`
        UPDATE documents
        SET content = ${content}, last_updated_by = ${userId}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${documentId}
      `

      // 添加历史记录
      await sql`
        INSERT INTO document_history (document_id, user_id, content)
        VALUES (${documentId}, ${userId}, ${content})
      `
    } catch (error) {
      console.error('Database error:', error)
      throw error
    }

    revalidatePath("/")
    return { success: true, changed: true }
  } catch (error) {
    console.error(error)
    return { error: "Failed to save, please try again." }
  }
}

// --- Snapshot-only Action (append to document_history without updating documents) ---
export async function saveDocumentSnapshot(content: string | null | undefined, groupId: number) {
  const userId = await getUserIdFromCookie()
  if (!userId) return { error: "Unauthorized" }

  if (content === null || content === undefined) {
    return { error: "Invalid content." }
  }

  try {
    // 查找或创建用户特定的文档
    let doc = await sql<{ id: number }[]>`
      SELECT id FROM documents WHERE group_id = ${groupId} AND user_id = ${userId};
    `
    
    if (!doc.length) {
      // 如果用户文档不存在，创建一个
      const newDoc = await sql<{ id: number }[]>`
        INSERT INTO documents (group_id, user_id, content) 
        VALUES (${groupId}, ${userId}, ${content})
        RETURNING id;
      `
      doc = newDoc
    }
    
    const documentId = doc[0].id

    // 更新文档内容
    await sql`
      UPDATE documents 
      SET content = ${content}
      WHERE id = ${documentId}
    `

    // 添加历史记录
    await sql`
      INSERT INTO document_history (document_id, user_id, content)
      VALUES (${documentId}, ${userId}, ${content})
    `

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: "Failed to save snapshot, please try again." }
  }
}

// --- Final Submit Action ---
export async function submitFinalDocument(groupId: number) {
  const userId = await getUserIdFromCookie()
  if (!userId) return { error: "Unauthorized" }

  try {
    // Get the target document id and current content for this specific user
    const doc = await sql<{ id: number; content: string }[]>`
      SELECT id, content FROM documents WHERE group_id = ${groupId} AND user_id = ${userId};
    `
    
    if (!doc.length) {
      return { error: "Document not found." }
    }

    const documentId = doc[0].id

    // Use the latest snapshot from document_history if available; fallback to current document content
    const latestHistory = await sql<{ content: string }[]>`
      SELECT content FROM document_history 
      WHERE document_id = ${documentId}
      ORDER BY created_at DESC
      LIMIT 1;
    `
    const contentToSubmit = latestHistory[0]?.content ?? doc[0].content

    // Mark the document as submitted and update the final version
    try {
      // 只更新content列，这是最基本的列
      await sql`
        UPDATE documents
        SET content = ${contentToSubmit}
        WHERE id = ${documentId}
      `

      // 添加最终提交历史
      await sql`
        INSERT INTO document_history (document_id, user_id, content)
        VALUES (${documentId}, ${userId}, ${contentToSubmit})
      `
    } catch (error) {
      console.error('Submit database error:', error)
      throw error
    }

    revalidatePath("/")
    return { success: true, message: "Document submitted successfully!" }
  } catch (error) {
    console.error(error)
    return { error: "Failed to submit document, please try again." }
  }
}
