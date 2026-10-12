"use client"

/**
 * Live group-chat fan-out over the same Yjs websocket server as documents.
 * Supabase remains the saved history. This room only carries messages that
 * should appear on other screens immediately.
 */

import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import type { Message } from "@/lib/map-messages"
import { getYjsWsUrl, normalizeYjsWsOrigin } from "@/lib/yjs/normalizeYjsWsOrigin"

const MAX_LIVE_MESSAGES = 300

type Listener = (messages: Message[]) => void

class ChatRoom {
  private doc = new Y.Doc()
  private provider: WebsocketProvider | null = null
  private listeners = new Set<Listener>()
  private refCount = 0
  private releaseTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly sessionId: string,
    private userId: string,
    private userName: string
  ) {}

  private get messages() {
    return this.doc.getArray<Y.Map<string>>("messages")
  }

  connect() {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer)
      this.releaseTimer = null
    }
    this.refCount += 1
    if (this.provider) return

    const origin = normalizeYjsWsOrigin(getYjsWsUrl())
    const roomId = `chat-${this.sessionId}`
    const params = { room: roomId, userId: this.userId, userName: this.userName }
    const exactUrl = `${origin}?${new URLSearchParams(params).toString()}`
    this.provider = new WebsocketProvider(origin, roomId, this.doc, {
      connect: false,
      params,
    })
    Object.defineProperty(this.provider, "url", {
      configurable: true,
      get: () => exactUrl,
    })
    this.messages.observeDeep(() => {
      const live = this.read()
      this.listeners.forEach((listener) => listener(live))
    })
    this.provider.connect()
  }

  disconnect() {
    this.refCount = Math.max(0, this.refCount - 1)
    if (this.refCount > 0) return
    if (this.releaseTimer) clearTimeout(this.releaseTimer)
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null
      if (this.refCount > 0) return
      this.provider?.destroy()
      this.provider = null
      this.listeners.clear()
      rooms.delete(this.sessionId)
    }, 500)
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    const current = this.read()
    if (current.length > 0) listener(current)
    return () => this.listeners.delete(listener)
  }

  read(): Message[] {
    const result: Message[] = []
    for (const entry of this.messages.toArray()) {
      const raw = entry.get("json")
      if (!raw) continue
      try {
        const message = JSON.parse(raw) as Message
        if (message?.id && message.content) result.push(message)
      } catch {
        // Ignore a malformed live entry. Supabase still has the saved copy.
      }
    }
    return result
  }

  publish(message: Message) {
    const json = JSON.stringify(message)
    const existing = this.find(message.id)
    if (existing?.get("json") === json) return
    this.doc.transact(() => {
      if (existing) {
        existing.set("json", json)
        return
      }
      const entry = new Y.Map<string>()
      entry.set("id", message.id)
      entry.set("json", json)
      this.messages.push([entry])
      if (this.messages.length > MAX_LIVE_MESSAGES) {
        this.messages.delete(0, this.messages.length - MAX_LIVE_MESSAGES)
      }
    })
  }

  rename(fromId: string, toId: string) {
    const existing = this.find(fromId)
    if (!existing) return
    const raw = existing.get("json")
    if (!raw) return
    try {
      const message = JSON.parse(raw) as Message
      message.id = toId
      this.doc.transact(() => {
        existing.set("id", toId)
        existing.set("json", JSON.stringify(message))
      })
    } catch {
      existing.set("id", toId)
    }
  }

  private find(id: string) {
    return this.messages.toArray().find((entry) => entry.get("id") === id)
  }
}

const rooms = new Map<string, ChatRoom>()

function roomFor(sessionId: string, userId: string, userName: string) {
  let room = rooms.get(sessionId)
  if (!room) {
    room = new ChatRoom(sessionId, userId, userName)
    rooms.set(sessionId, room)
  }
  return room
}

export function connectChatRoom(sessionId: string, userId: string, userName: string) {
  const room = roomFor(sessionId, userId, userName)
  room.connect()
  return room
}

export function publishChatMessage(sessionId: string, message: Message) {
  rooms.get(sessionId)?.publish(message)
}

export function renameChatMessage(sessionId: string, fromId: string, toId: string) {
  rooms.get(sessionId)?.rename(fromId, toId)
}
