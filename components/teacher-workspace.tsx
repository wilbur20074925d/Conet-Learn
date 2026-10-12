"use client"

import { useEffect, useRef, useState } from "react"
import ChatPanel from "@/components/chat-panel"
import TeacherBoard from "@/components/teacher-board"
import { EMPTY_MESSAGES, useSessionBundles } from "@/components/use-session-bundles"
import type { BoardGroup } from "@/lib/classroom"
import type { Message } from "@/lib/map-messages"
import { deleteChatSessionNow, writeSessionQuery } from "@/lib/session-browser"

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

function withoutRemoved(groups: BoardGroup[], removedIds: Set<string>) {
  if (removedIds.size === 0) return groups
  return groups.map((group) => ({
    ...group,
    sessions: group.sessions.filter((session) => !removedIds.has(session.id)),
  }))
}

export default function TeacherWorkspace({
  groups: incomingGroups,
  waiting,
  activeSessionId: initialActiveId,
  initialMessages,
  currentUserId,
  currentUserName,
}: {
  groups: BoardGroup[]
  waiting: { id: string; name: string }[]
  activeSessionId: string | null
  initialMessages: Message[]
  currentUserId: string
  currentUserName: string
}) {
  const [groups, setGroups] = useState(incomingGroups)
  const [activeId, setActiveId] = useState(initialActiveId)
  const groupsRef = useRef(groups)
  const activeRef = useRef(activeId)
  const removedIds = useRef(new Set<string>())
  groupsRef.current = groups
  activeRef.current = activeId

  useEffect(() => {
    setGroups(withoutRemoved(incomingGroups, removedIds.current))
  }, [incomingGroups])

  const sessionKey = groups
    .flatMap((group) => group.sessions.map((session) => session.id))
    .join("|")
  const { bundles, remember, prefetch } = useSessionBundles(sessionKey, initialActiveId, initialMessages)

  function select(sessionId: string | null) {
    setActiveId(sessionId)
    activeRef.current = sessionId
    writeSessionQuery(sessionId)
    if (sessionId) prefetch(sessionId)
  }

  async function remove(sessionId: string) {
    const snapshot = groupsRef.current
    const previousActive = activeRef.current
    removedIds.current.add(sessionId)
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        sessions: group.sessions.filter((session) => session.id !== sessionId),
      }))
    )
    if (previousActive === sessionId) select(null)
    const result = await deleteChatSessionNow(sessionId)
    if (!result.ok) {
      removedIds.current.delete(sessionId)
      setGroups(snapshot)
      if (previousActive === sessionId) select(previousActive)
    }
    return result
  }

  let active: {
    id: string
    title: string
    groupId: string
    groupName: string
    newintervene: number
  } | null = null
  if (activeId) {
    for (const group of groups) {
      const found = group.sessions.find((session) => session.id === activeId)
      if (!found) continue
      active = {
        id: found.id,
        title: found.title,
        groupId: group.id,
        groupName: group.name,
        newintervene: group.newintervene,
      }
      break
    }
  }
  const cached = active ? bundles[active.id] : undefined

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="conet-surface min-h-0 overflow-hidden">
        <TeacherBoard
          groups={groups}
          waiting={waiting}
          activeSessionId={active?.id || null}
          onSelectSession={select}
          onDeleteSession={remove}
          onPrefetchSession={prefetch}
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
            currentUserName={currentUserName}
            groupId={active.groupId}
            groupName={active.groupName}
            sessionId={active.id}
            sessionTitle={active.title}
            newintervene={active.newintervene}
            readOnly
          />
        ) : (
          <EmptySession
            title="Choose a chat session"
            body="Open any session under a group to read what the students are writing."
          />
        )}
      </div>
    </div>
  )
}
