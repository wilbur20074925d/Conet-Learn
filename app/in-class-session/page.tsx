import { redirect } from "next/navigation"
import BrandLogo from "@/components/brand-logo"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import JoinGroup from "@/components/join-group"
import StudentClassroom from "@/components/student-classroom"
import { getSessionContext } from "@/lib/actions"
import { listJoinableGroups } from "@/lib/classroom"
import { loadStudentClassroom } from "@/lib/student-classroom-data"

export const dynamic = "force-dynamic"

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

export default async function InClassSessionPage() {
  const session = await getSessionContext()
  if (!session.ok) {
    if (session.error === "Unauthorized") redirect("/login")
    return <SetupScreen message={session.error} />
  }

  const { ctx } = session
  if (ctx.role === "teacher") redirect("/")

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
      initialMode="in-class"
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
