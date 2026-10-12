"use client"

import { useEffect, useState } from "react"
import ChatPanel from "@/components/chat-panel"
import CollaborativeDocumentationPanel from "@/components/collaborative-docs/CollaborativeDocumentationPanel"
import EditorPanel from "@/components/editor-panel"
import { EMPTY_MESSAGES, useSessionBundles } from "@/components/use-session-bundles"
import type { ChatSession } from "@/lib/classroom"
import type { CollaborativeNote } from "@/lib/collaborative-notes"
import type { Message } from "@/lib/map-messages"
import { createChatSessionNow } from "@/lib/session-browser"

export type StudentWorkspaceMode = "group-project" | "in-class"

function EmptySession({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <div>
        <p className="text-lg font-bold tracking-tight text-slate-900">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  )
}

export default function StudentWorkspace({
  mode = "group-project",
  groupId,
  groupName,
  session: initialSession,
  initialMessages,
  currentUserId,
  currentUserName,
  newintervene,
  initialNotes = [],
  document = "",
  peers = [],
}: {
  mode?: StudentWorkspaceMode
  groupId: string
  groupName: string
  session: ChatSession | null
  initialMessages: Message[]
  currentUserId: string
  currentUserName: string
  newintervene: number
  initialNotes?: CollaborativeNote[]
  document?: string
  peers?: { id: string; name: string; avatar_url?: string | null }[]
}) {
  const [session, setSession] = useState(initialSession)
  const [opening, setOpening] = useState(!initialSession)
  const [error, setError] = useState("")
  const [mountedModes, setMountedModes] = useState({
    "in-class": mode === "in-class",
    "group-project": mode === "group-project",
  })

  useEffect(() => {
    setMountedModes((current) => (current[mode] ? current : { ...current, [mode]: true }))
  }, [mode])

  useEffect(() => {
    if (session) return
    let cancelled = false
    setOpening(true)
    createChatSessionNow(groupId, groupName, currentUserId).then((result) => {
      if (cancelled) return
      setOpening(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSession(result.session)
    })
    return () => {
      cancelled = true
    }
  }, [currentUserId, groupId, groupName, session])

  const sessionKey = session?.id ?? ""
  const { bundles, remember } = useSessionBundles(sessionKey, session?.id ?? null, initialMessages)
  const cached = session ? bundles[session.id] : undefined

  return (
    <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 overflow-hidden p-3 lg:grid-cols-2 lg:grid-rows-1">
      <div className="conet-surface min-h-0 overflow-hidden">
        {session ? (
          <ChatPanel
            key={session.id}
            initialMessages={cached ?? initialMessages}
            awaitInitial={cached === undefined && initialMessages.length === 0}
            onReady={(messages) => remember(session.id, messages)}
            currentUserId={currentUserId}
            groupId={groupId}
            groupName={groupName}
            sessionId={session.id}
            currentUserName={currentUserName}
            newintervene={newintervene}
          />
        ) : (
          <EmptySession
            title={opening ? "Opening the group chat" : "Could not open the chat"}
            body={opening ? "Your group’s conversation will appear in a moment." : error || "Try refreshing the page."}
          />
        )}
      </div>
      <div className="conet-surface relative min-h-0 overflow-hidden">
        {mountedModes["in-class"] && (
          <div
            className={`absolute inset-0 ${
              mode === "in-class" ? "z-10" : "pointer-events-none invisible"
            }`}
            aria-hidden={mode !== "in-class"}
          >
            <EditorPanel key={groupId} initialContent={document} groupId={groupId} groupMembers={peers} />
          </div>
        )}
        {mountedModes["group-project"] && (
          <div
            className={`absolute inset-0 ${
              mode === "group-project" ? "z-10" : "pointer-events-none invisible"
            }`}
            aria-hidden={mode !== "group-project"}
          >
            <CollaborativeDocumentationPanel
              key={groupId}
              groupId={groupId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              initialNotes={initialNotes}
            />
          </div>
        )}
      </div>
    </div>
  )
}
