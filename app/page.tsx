import { redirect } from "next/navigation"
import BrandLogo from "@/components/brand-logo"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import StudentAwaitingGroup from "@/components/join-group"
import StudentClassroom from "@/components/student-classroom"
import { getSessionContext } from "@/lib/actions"
import { membershipFor } from "@/lib/session-membership"
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
  searchParams: Promise<{ session?: string | string[]; group?: string | string[] }>
}) {
  const session = await getSessionContext()
  if (!session.ok) {
    if (session.error === "Unauthorized") redirect("/login")
    return <SetupScreen message={session.error} />
  }

  const params = await searchParams
  const requested = Array.isArray(params.session) ? params.session[0] : params.session
  const requestedGroup = Array.isArray(params.group) ? params.group[0] : params.group
  const { ctx } = session

  if (ctx.role === "teacher") {
    if (isUuid(requested)) redirect(`/dashboard?session=${requested}&view=note`)
    redirect("/dashboard")
  }

  const active = membershipFor(ctx, isUuid(requestedGroup) ? requestedGroup : null)
  if (!active) {
    return (
      <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
        <ConsentWrapper userId={ctx.profileId} userName={ctx.name} />
        <ClassroomHeader name={ctx.name} role="student" profileId={ctx.profileId} />
        <StudentAwaitingGroup />
      </div>
    )
  }

  const classroom = await loadStudentClassroom(active.groupId, ctx.profileId, isUuid(requested) ? requested : null)
  if (!classroom.ok) return <SetupScreen message={classroom.error} />

  return (
    <StudentClassroom
      initialMode="group-project"
      name={ctx.name}
      groupId={active.groupId}
      groupName={active.groupName}
      session={classroom.data.session}
      initialMessages={classroom.data.initialMessages}
      currentUserId={ctx.profileId}
      currentUserName={ctx.name}
      newintervene={active.newintervene}
      initialNotes={classroom.data.initialNotes}
      document={classroom.data.document}
      peers={classroom.data.peers}
      classSessionId={classroom.data.classSessionId}
    />
  )
}
