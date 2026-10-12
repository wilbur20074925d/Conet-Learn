import { redirect } from "next/navigation"
import BrandLogo from "@/components/brand-logo"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import JoinGroup from "@/components/join-group"
import StudentClassroom from "@/components/student-classroom"
import TeacherWorkspace from "@/components/teacher-workspace"
import { getSessionContext, getSessionMessages } from "@/lib/actions"
import { canonicalSession } from "@/lib/canonical-session"
import { getTeacherBoard, listJoinableGroups } from "@/lib/classroom"
import { loadStudentClassroom } from "@/lib/student-classroom-data"

export const dynamic = "force-dynamic"

function isUuid(value: string | undefined) {
  return Boolean(
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function SetupScreen({ message }: { message: string }) {
  return (
    <main className="conet-page-bg flex min-h-screen items-center justify-center px-6">
      <div className="conet-surface max-w-lg p-8 text-center">
        <BrandLogo className="mx-auto h-auto w-full max-w-[220px]" />
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Almost ready</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{message}</p>
      </div>
    </main>
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ session?: string | string[] }>
}) {
  const session = await getSessionContext()
  if (!session.ok) {
    if (session.error === "Unauthorized") redirect("/login")
    return <SetupScreen message={session.error} />
  }

  const params = await searchParams
  const requested = Array.isArray(params.session) ? params.session[0] : params.session
  const { ctx } = session

  if (ctx.role === "teacher") {
    const board = await getTeacherBoard()
    if (!board.ok) return <SetupScreen message={board.error} />

    let active: {
      id: string
      title: string
      groupId: string
      groupName: string
      newintervene: number
    } | null = null
    if (isUuid(requested)) {
      for (const group of board.groups) {
        if (!group.sessions.some((item) => item.id === requested)) continue
        const session = canonicalSession(group.sessions)
        if (!session) continue
        active = {
          id: session.id,
          title: group.name,
          groupId: group.id,
          groupName: group.name,
          newintervene: group.newintervene,
        }
        break
      }
    }

    const initialMessages = active ? await getSessionMessages(active.id) : []

    return (
      <div className="conet-page-bg flex h-dvh flex-col overflow-hidden text-slate-900">
        <ConsentWrapper userId={ctx.profileId} />
        <ClassroomHeader name={ctx.name} role={ctx.role} />
        <TeacherWorkspace
          groups={board.groups}
          waiting={board.waiting}
          students={board.students}
          activeSessionId={active?.id || null}
          initialMessages={initialMessages}
          currentUserId={ctx.profileId}
          currentUserName={ctx.name}
        />
      </div>
    )
  }

  if (!ctx.groupId || !ctx.groupName) {
    const directory = await listJoinableGroups()
    if (!directory.ok) return <SetupScreen message={directory.error} />
    return (
      <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
        <ConsentWrapper userId={ctx.profileId} />
        <ClassroomHeader name={ctx.name} role="student" />
        <JoinGroup groups={directory.groups} />
      </div>
    )
  }

  const classroom = await loadStudentClassroom(ctx.groupId, ctx.profileId)
  if (!classroom.ok) return <SetupScreen message={classroom.error} />

  return (
    <StudentClassroom
      initialMode="group-project"
      name={ctx.name}
      groupId={ctx.groupId}
      groupName={ctx.groupName}
      session={classroom.data.session}
      initialMessages={classroom.data.initialMessages}
      currentUserId={ctx.profileId}
      currentUserName={ctx.name}
      newintervene={ctx.newintervene}
      initialNotes={classroom.data.initialNotes}
      document={classroom.data.document}
      peers={classroom.data.peers}
    />
  )
}
