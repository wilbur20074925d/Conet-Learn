"use client"

import { useState } from "react"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import TeacherClassBoard from "@/components/teacher-class-board"
import TeacherSessionView from "@/components/teacher-session-view"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { loadTeacherSession, type OpenedTeacherSession } from "@/lib/open-session"
import type { CatalogClass, CatalogGroup } from "@/lib/catalog"

export default function TeacherDashboardScreen({
  name,
  profileId,
  classes,
  looseGroups,
  waiting,
  initialSession = null,
  initialView = "note",
}: {
  name: string
  profileId: string
  classes: CatalogClass[]
  looseGroups: CatalogGroup[]
  waiting: { id: string; name: string }[]
  initialSession?: OpenedTeacherSession | null
  initialView?: "note" | "post"
}) {
  const [session, setSession] = useState<OpenedTeacherSession | null>(initialSession)
  const [view, setViewState] = useState<"note" | "post">(initialView)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")

  async function openGroup(groupId: string, chatSessionId: string | null) {
    if (openingId) return
    setOpeningId(groupId)
    const result = await loadTeacherSession(groupId, chatSessionId)
    setOpeningId(null)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setViewState("note")
    setSession(result.session)
    const params = new URLSearchParams({ group: result.session.groupId, view: "note" })
    if (result.session.sessionId) params.set("session", result.session.sessionId)
    window.history.replaceState(window.history.state, "", `/dashboard?${params}`)
  }

  function setView(next: "note" | "post") {
    if (!session) return
    setViewState(next)
    const params = new URLSearchParams({ group: session.groupId, view: next })
    if (session.sessionId) params.set("session", session.sessionId)
    window.history.replaceState(window.history.state, "", `/dashboard?${params}`)
  }

  function back() {
    setSession(null)
    window.history.replaceState(window.history.state, "", "/dashboard")
  }

  return (
    <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
      <ConsentWrapper userId={profileId} />
      <div className={session ? "hidden" : "flex min-h-dvh flex-col"}>
        <ClassroomHeader name={name} role="teacher" showMaterials={false} />
        <TeacherClassBoard
          classes={classes}
          looseGroups={looseGroups}
          waiting={waiting}
          onOpen={openGroup}
          openingId={openingId}
        />
      </div>
      {session && (
        <div className="conet-page-bg fixed inset-0 z-40 flex flex-col overflow-hidden">
          <ClassroomHeader
            name={name}
            role="teacher"
            groupName={session.groupName}
            showDashboardLink
            onDashboardBack={back}
            materialsSessionId={session.classSessionId}
          />
          <TeacherSessionView
            key={session.groupId}
            groupId={session.groupId}
            groupName={session.groupName}
            sessionId={session.sessionId}
            sessionTitle={session.sessionTitle}
            view={view}
            initialMessages={session.initialMessages}
            initialNotes={session.initialNotes}
            individualNotes={session.individualNotes}
            notesUnavailable={session.notesUnavailable}
            currentUserId={profileId}
            currentUserName={name}
            newintervene={session.newintervene}
            onBack={back}
            onViewChange={setView}
          />
        </div>
      )}
      <Dialog open={Boolean(notice)} onOpenChange={(open) => !open && setNotice("")}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-3xl border-slate-200 p-0">
          <div className="border-b border-slate-100 px-5 pb-4 pt-5 pr-12">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">Please try again</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-500">{notice}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end px-5 py-4">
            <button
              type="button"
              onClick={() => setNotice("")}
              className="h-9 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              OK
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
