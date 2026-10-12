"use client"

import { useEffect, useState } from "react"
import ChatPanel from "@/components/chat-panel"
import StudentAccounts from "@/components/student-accounts"
import TeacherBoard from "@/components/teacher-board"
import { EMPTY_MESSAGES, useSessionBundles } from "@/components/use-session-bundles"
import { canonicalSession } from "@/lib/canonical-session"
import type { BoardGroup, ClassroomStudent } from "@/lib/classroom"
import type { Message } from "@/lib/map-messages"
import { writeSessionQuery } from "@/lib/session-browser"

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

export default function TeacherWorkspace({
  groups: incomingGroups,
  waiting,
  students,
  activeSessionId: initialActiveId,
  initialMessages,
  currentUserId,
  currentUserName,
}: {
  groups: BoardGroup[]
  waiting: { id: string; name: string }[]
  students: ClassroomStudent[]
  activeSessionId: string | null
  initialMessages: Message[]
  currentUserId: string
  currentUserName: string
}) {
  const [groups, setGroups] = useState(incomingGroups)
  const [activeId, setActiveId] = useState(initialActiveId)
  const [emptyGroupId, setEmptyGroupId] = useState<string | null>(null)
  const [panel, setPanel] = useState<"groups" | "students">("groups")

  useEffect(() => {
    setGroups(incomingGroups)
  }, [incomingGroups])

  const sessionKey = groups
    .map((group) => canonicalSession(group.sessions)?.id)
    .filter(Boolean)
    .join("|")
  const { bundles, remember, prefetch } = useSessionBundles(sessionKey, initialActiveId, initialMessages)

  function select(sessionId: string | null) {
    setActiveId(sessionId)
    if (sessionId) setEmptyGroupId(null)
    writeSessionQuery(sessionId)
    if (sessionId) prefetch(sessionId)
  }

  function openGroup(groupId: string) {
    const group = groups.find((item) => item.id === groupId)
    const session = group ? canonicalSession(group.sessions) : null
    if (!session) {
      setEmptyGroupId(groupId)
      select(null)
      return
    }
    setEmptyGroupId(null)
    select(session.id)
  }

  function prefetchGroup(groupId: string) {
    const group = groups.find((item) => item.id === groupId)
    const session = group ? canonicalSession(group.sessions) : null
    if (session) prefetch(session.id)
  }

  let active: {
    id: string
    groupId: string
    groupName: string
    newintervene: number
  } | null = null
  if (activeId) {
    for (const group of groups) {
      const session = canonicalSession(group.sessions)
      if (!session || session.id !== activeId) continue
      active = {
        id: session.id,
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
      <div className="conet-surface flex min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 gap-1 border-b border-slate-100 p-2">
          <button
            type="button"
            onClick={() => setPanel("groups")}
            className={`h-9 flex-1 rounded-xl text-sm font-semibold transition ${
              panel === "groups" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Groups
          </button>
          <button
            type="button"
            onClick={() => setPanel("students")}
            className={`h-9 flex-1 rounded-xl text-sm font-semibold transition ${
              panel === "students" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Students
          </button>
        </div>
        <div className="h-full min-h-0 flex-1 overflow-hidden">
          {panel === "groups" ? (
            <TeacherBoard
              groups={groups}
              waiting={waiting}
              activeGroupId={active?.groupId || emptyGroupId}
              onSelectGroup={openGroup}
              onPrefetchGroup={prefetchGroup}
            />
          ) : (
            <StudentAccounts students={students} groups={groups} />
          )}
        </div>
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
            newintervene={active.newintervene}
            readOnly
          />
        ) : (
          <EmptySession
            title={emptyGroupId ? "No chat yet" : "Choose a group"}
            body={
              emptyGroupId
                ? "This group’s chat appears when a student opens it."
                : "Open a group to read its chat."
            }
          />
        )}
      </div>
    </div>
  )
}
