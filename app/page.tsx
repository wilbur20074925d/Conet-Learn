import { redirect } from "next/navigation"
import BrandLogo from "@/components/brand-logo"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import JoinGroup from "@/components/join-group"
import StudentWorkspace from "@/components/student-workspace"
import TeacherWorkspace from "@/components/teacher-workspace"
import { getDocument, getSessionContext, getSessionMessages } from "@/lib/actions"
import { getTeacherBoard, listGroupSessions, listJoinableGroups } from "@/lib/classroom"

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
  const { ctx, members } = session

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
        const found = group.sessions.find((item) => item.id === requested)
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

    const initialMessages = active ? await getSessionMessages(active.id) : []

    return (
      <div className="conet-page-bg flex h-dvh flex-col overflow-hidden text-slate-900">
        <ConsentWrapper userId={ctx.profileId} />
        <ClassroomHeader name={ctx.name} role={ctx.role} />
        <TeacherWorkspace
          groups={board.groups}
          waiting={board.waiting}
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

  const chats = await listGroupSessions(ctx.groupId)
  if (!chats.ok) return <SetupScreen message={chats.error} />
  const active =
    (isUuid(requested) ? chats.sessions.find((item) => item.id === requested) : undefined) ||
    chats.sessions[0] ||
    null
  const [messages, document] = await Promise.all([
    active ? getSessionMessages(active.id) : Promise.resolve([]),
    getDocument(ctx.groupId, ctx.profileId),
  ])
  const peers = members.filter((member) => member.id !== ctx.profileId && member.role !== "ai")

  return (
    <div className="conet-page-bg flex h-dvh flex-col overflow-hidden text-slate-900">
      <ConsentWrapper userId={ctx.profileId} />
      <ClassroomHeader name={ctx.name} role="student" groupName={ctx.groupName} />
      <StudentWorkspace
        groupId={ctx.groupId}
        groupName={ctx.groupName}
        sessions={chats.sessions}
        activeSessionId={active?.id || null}
        initialMessages={messages}
        currentUserId={ctx.profileId}
        currentUserName={ctx.name}
        newintervene={ctx.newintervene}
        document={document}
        peers={peers}
      />
    </div>
  )
}
