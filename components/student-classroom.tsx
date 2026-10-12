"use client"

import { useEffect, useState } from "react"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import StudentWorkspace, { type StudentWorkspaceMode } from "@/components/student-workspace"
import type { ChatSession } from "@/lib/classroom"
import type { CollaborativeNote } from "@/lib/collaborative-notes"
import type { Message } from "@/lib/map-messages"

function modeFromPath(pathname: string): StudentWorkspaceMode {
  return pathname.startsWith("/in-class-session") ? "in-class" : "group-project"
}

function writeWorkspaceMode(mode: StudentWorkspaceMode) {
  const path = mode === "in-class" ? "/in-class-session" : "/"
  const url = new URL(window.location.href)
  const next = `${path}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (current === next) return
  const state = window.history.state
  const nextState = state?.__NA || state?._N ? state : { ...state, __NA: true }
  window.history.pushState(nextState, "", next)
}

export default function StudentClassroom({
  initialMode,
  name,
  groupId,
  groupName,
  session,
  initialMessages,
  currentUserId,
  currentUserName,
  newintervene,
  initialNotes,
  document,
  peers,
}: {
  initialMode: StudentWorkspaceMode
  name: string
  groupId: string
  groupName: string
  session: ChatSession | null
  initialMessages: Message[]
  currentUserId: string
  currentUserName: string
  newintervene: number
  initialNotes: CollaborativeNote[]
  document: string
  peers: { id: string; name: string; avatar_url?: string | null }[]
}) {
  const [mode, setMode] = useState(initialMode)

  useEffect(() => {
    const onPopState = () => setMode(modeFromPath(window.location.pathname))
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function switchMode(next: StudentWorkspaceMode) {
    if (next === mode) return
    setMode(next)
    writeWorkspaceMode(next)
  }

  return (
    <div className="conet-page-bg flex h-dvh flex-col overflow-hidden text-slate-900">
      <ConsentWrapper userId={currentUserId} />
      <ClassroomHeader
        name={name}
        role="student"
        groupName={groupName}
        showWorkspaceNav
        workspaceMode={mode}
        onWorkspaceModeChange={switchMode}
      />
      <StudentWorkspace
        mode={mode}
        groupId={groupId}
        groupName={groupName}
        session={session}
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        newintervene={newintervene}
        initialNotes={initialNotes}
        document={document}
        peers={peers}
      />
    </div>
  )
}
