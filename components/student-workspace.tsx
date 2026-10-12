"use client"

import { useEffect, useState } from "react"
import ChatPanel from "@/components/chat-panel"
import CollaborativeDocumentationPanel from "@/components/collaborative-docs/CollaborativeDocumentationPanel"
import EditorPanel from "@/components/editor-panel"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { EMPTY_MESSAGES, useSessionBundles } from "@/components/use-session-bundles"
import type { ChatSession } from "@/lib/classroom"
import type { CollaborativeNote } from "@/lib/collaborative-notes"
import type { Message } from "@/lib/map-messages"
import { createChatSessionNow } from "@/lib/session-browser"

export type StudentWorkspaceMode = "group-project" | "in-class"

function useSplitDirection() {
  const [direction, setDirection] = useState<"horizontal" | "vertical">("horizontal")

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setDirection(query.matches ? "horizontal" : "vertical")
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return direction
}

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
  mode = "in-class",
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
  const direction = useSplitDirection()
  const minSize = direction === "horizontal" ? 28 : 22

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden p-3">
      <ResizablePanelGroup
        key={direction}
        direction={direction}
        autoSaveId={`conet-student-split-${direction}`}
        className="min-h-0"
      >
        <ResizablePanel id="chat" defaultSize={50} minSize={minSize} maxSize={100 - minSize} className="min-h-0 min-w-0">
          <div className="conet-surface h-full min-h-0 overflow-hidden">
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
        </ResizablePanel>
        <ResizableHandle withHandle aria-label="Drag to resize the chat and the workspace" />
        <ResizablePanel id="workspace" defaultSize={50} minSize={minSize} maxSize={100 - minSize} className="min-h-0 min-w-0">
          <div className="conet-surface relative h-full min-h-0 overflow-hidden">
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
