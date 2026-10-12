"use client"

import { useEffect, useRef, useState } from "react"
import ChatPanel from "@/components/chat-panel"
import CollaborativeDocumentationPanel from "@/components/collaborative-docs/CollaborativeDocumentationPanel"
import EditorPanel from "@/components/editor-panel"
import SessionRail from "@/components/session-rail"
import { EMPTY_MESSAGES, useSessionBundles } from "@/components/use-session-bundles"
import type { ChatSession } from "@/lib/classroom"
import type { CollaborativeNote } from "@/lib/collaborative-notes"
import type { Message } from "@/lib/map-messages"
import {
  createChatSessionNow,
  deleteChatSessionNow,
  isTempSessionId,
  writeSessionQuery,
} from "@/lib/session-browser"

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
  sessions: initialSessions,
  activeSessionId: initialActiveId,
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
  sessions: ChatSession[]
  activeSessionId: string | null
  initialMessages: Message[]
  currentUserId: string
  currentUserName: string
  newintervene: number
  initialNotes?: CollaborativeNote[]
  document?: string
  peers?: { id: string; name: string; avatar_url?: string | null }[]
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [activeId, setActiveId] = useState(initialActiveId)
  const [mountedModes, setMountedModes] = useState({
    "in-class": mode === "in-class",
    "group-project": mode === "group-project",
  })
  const sessionsRef = useRef(sessions)
  const activeRef = useRef(activeId)
  sessionsRef.current = sessions
  activeRef.current = activeId

  useEffect(() => {
    setMountedModes((current) => (current[mode] ? current : { ...current, [mode]: true }))
  }, [mode])

  const sessionKey = sessions
    .map((session) => session.id)
    .filter((id) => !id.startsWith("temp-"))
    .join("|")
  const { bundles, remember, forget, move, prefetch } = useSessionBundles(
    sessionKey,
    initialActiveId,
    initialMessages
  )

  function select(sessionId: string | null) {
    setActiveId(sessionId)
    activeRef.current = sessionId
    if (sessionId && !isTempSessionId(sessionId)) writeSessionQuery(sessionId)
    else if (!sessionId) writeSessionQuery(null)
    if (sessionId && !isTempSessionId(sessionId)) prefetch(sessionId)
  }

  async function create(title: string) {
    const tempId = `temp-${crypto.randomUUID()}`
    const previousActive = activeRef.current
    const optimistic: ChatSession = {
      id: tempId,
      title,
      createdAt: new Date().toISOString(),
      createdBy: currentUserId,
    }
    remember(tempId, EMPTY_MESSAGES)
    setSessions((current) => [optimistic, ...current])
    select(tempId)

    const result = await createChatSessionNow(groupId, title, currentUserId)
    if (!result.ok) {
      setSessions((current) => current.filter((session) => session.id !== tempId))
      forget(tempId)
      if (activeRef.current === tempId) select(previousActive)
      return result
    }

    move(tempId, result.session.id)
    setSessions((current) => [
      result.session,
      ...current.filter((session) => session.id !== tempId && session.id !== result.session.id),
    ])
    if (activeRef.current === tempId) select(result.session.id)
    return result
  }

  async function remove(sessionId: string) {
    const snapshot = sessionsRef.current
    const previousActive = activeRef.current
    const remaining = snapshot.filter((session) => session.id !== sessionId)
    setSessions(remaining)
    forget(sessionId)
    if (previousActive === sessionId) select(remaining[0]?.id ?? null)
    const result = await deleteChatSessionNow(sessionId)
    if (!result.ok) {
      setSessions(snapshot)
      if (previousActive === sessionId) select(previousActive)
    }
    return result
  }

  const active = sessions.find((session) => session.id === activeId) ?? null
  const cached = active ? bundles[active.id] : undefined

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="conet-surface min-h-0 overflow-hidden max-lg:max-h-64">
        <SessionRail
          sessions={sessions}
          activeSessionId={activeId}
          currentUserId={currentUserId}
          onSelect={select}
          onPrefetch={prefetch}
          onCreate={create}
          onDelete={remove}
        />
      </div>
      <div className="conet-surface min-h-0 overflow-hidden">
        {active ? (
          <ChatPanel
            key={active.id}
            initialMessages={cached ?? EMPTY_MESSAGES}
            awaitInitial={cached === undefined}
            onReady={(messages) => remember(active.id, messages)}
            currentUserId={currentUserId}
            groupId={groupId}
            groupName={groupName}
            sessionId={active.id}
            sessionTitle={active.title}
            currentUserName={currentUserName}
            newintervene={newintervene}
          />
        ) : (
          <EmptySession
            title="Create a chat session"
            body="Your group is set. Add a session on the left, then start the conversation."
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
