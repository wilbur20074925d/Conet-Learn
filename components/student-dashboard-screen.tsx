"use client"

import { useState } from "react"
import ClassDashboard from "@/components/class-dashboard"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import StudentClassroom from "@/components/student-classroom"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { loadStudentWorkspace, type OpenedStudentSession } from "@/lib/open-session"
import type { CatalogClass } from "@/lib/catalog"

export default function StudentDashboardScreen({
  name,
  profileId,
  classes,
  joinedGroupIds,
  showMaterials = true,
  initialSession = null,
}: {
  name: string
  profileId: string
  classes: CatalogClass[]
  joinedGroupIds: string[]
  showMaterials?: boolean
  initialSession?: OpenedStudentSession | null
}) {
  const [session, setSession] = useState<OpenedStudentSession | null>(initialSession)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")

  async function openGroup(groupId: string, chatSessionId: string | null) {
    if (openingId) return
    setOpeningId(groupId)
    const result = await loadStudentWorkspace(groupId, chatSessionId)
    setOpeningId(null)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setSession(result.session)
    const params = new URLSearchParams({ group: result.session.groupId })
    if (result.session.classroom.session?.id) params.set("session", result.session.classroom.session.id)
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
        <ClassroomHeader name={name} role="student" showMaterials={false} />
        <ClassDashboard
          role="student"
          classes={classes}
          showMaterials={showMaterials}
          joinedGroupIds={joinedGroupIds}
          onOpen={openGroup}
          openingId={openingId}
        />
      </div>
      {session && (
        <div className="fixed inset-0 z-40">
          <StudentClassroom
            key={session.groupId}
            initialMode="in-class"
            name={session.name}
            groupId={session.groupId}
            groupName={session.groupName}
            session={session.classroom.session}
            initialMessages={session.classroom.initialMessages}
            currentUserId={profileId}
            currentUserName={name}
            newintervene={session.newintervene}
            initialNotes={session.classroom.initialNotes}
            document={session.classroom.document}
            peers={session.classroom.peers}
            classSessionId={session.classroom.classSessionId}
            onDashboardBack={back}
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
