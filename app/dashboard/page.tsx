import { redirect } from "next/navigation"
import BrandLogo from "@/components/brand-logo"
import ClassDashboard from "@/components/class-dashboard"
import ClassroomHeader from "@/components/classroom-header"
import ConsentWrapper from "@/components/consent-wrapper"
import JoinGroup from "@/components/join-group"
import StudentDashboardScreen from "@/components/student-dashboard-screen"
import TeacherDashboardScreen from "@/components/teacher-dashboard-screen"
import TeacherManagePanel from "@/components/teacher-manage-panel"
import { getSessionContext } from "@/lib/actions"
import { getClassCatalog } from "@/lib/class-catalog"
import type { CatalogClass } from "@/lib/catalog"
import { getTeacherBoard, listJoinableGroups } from "@/lib/classroom"
import { loadStudentWorkspace, loadTeacherSession } from "@/lib/open-session"

export const dynamic = "force-dynamic"

function isUuid(value: string | undefined): value is string {
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

function studentClasses(classes: CatalogClass[], joinedGroupIds: string[]) {
  const joined = new Set(joinedGroupIds)
  return classes.map((classroom) => ({
    ...classroom,
    sessions: classroom.sessions.map((session) => {
      const mine = session.groups.filter((group) => joined.has(group.id))
      return mine.length > 0 ? { ...session, groups: mine } : session
    }),
  }))
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[]; session?: string | string[]; view?: string | string[] }>
}) {
  const session = await getSessionContext()
  if (!session.ok) {
    if (session.error === "Unauthorized") redirect("/login")
    return <SetupScreen message={session.error} />
  }

  const params = await searchParams
  const requestedGroup = Array.isArray(params.group) ? params.group[0] : params.group
  const requestedSession = Array.isArray(params.session) ? params.session[0] : params.session
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view
  const view = requestedView === "post" ? "post" : "note"
  const { ctx } = session

  if (ctx.role === "teacher") {
    const groupId = isUuid(requestedGroup) ? requestedGroup : null
    const sessionId = isUuid(requestedSession) ? requestedSession : null
    const [board, catalog, opened] = await Promise.all([
      getTeacherBoard(),
      getClassCatalog(),
      groupId || sessionId ? loadTeacherSession(groupId, sessionId) : Promise.resolve(null),
    ])
    if (!board.ok) return <SetupScreen message={board.error} />

    if (!catalog.ok) {
      return (
        <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
          <ConsentWrapper userId={ctx.profileId} />
          <ClassroomHeader name={ctx.name} role="teacher" showMaterials={false} />
          <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              {catalog.error}
            </div>
          </div>
          <TeacherManagePanel groups={board.groups} waiting={board.waiting} />
        </div>
      )
    }

    return (
      <TeacherDashboardScreen
        name={ctx.name}
        profileId={ctx.profileId}
        classes={catalog.classes}
        looseGroups={catalog.looseGroups}
        waiting={catalog.waiting}
        initialSession={opened && opened.ok ? opened.session : null}
        initialView={view}
      />
    )
  }

  const groupId = isUuid(requestedGroup) ? requestedGroup : null
  const sessionId = isUuid(requestedSession) ? requestedSession : null
  const [catalog, opened] = await Promise.all([
    getClassCatalog(),
    groupId && ctx.groupIds.includes(groupId) ? loadStudentWorkspace(groupId, sessionId) : Promise.resolve(null),
  ])
  if (catalog.ok) {
    return (
      <StudentDashboardScreen
        name={ctx.name}
        profileId={ctx.profileId}
        classes={studentClasses(catalog.classes, ctx.groupIds)}
        joinedGroupIds={ctx.groupIds}
        initialSession={opened && opened.ok ? opened.session : null}
      />
    )
  }

  if (ctx.memberships.length === 0) {
    const directory = await listJoinableGroups()
    if (!directory.ok) return <SetupScreen message={directory.error} />
    return (
      <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
        <ConsentWrapper userId={ctx.profileId} />
        <ClassroomHeader name={ctx.name} role="student" showMaterials={false} />
        <JoinGroup groups={directory.groups} />
      </div>
    )
  }

  const classes: CatalogClass[] = [
    {
      id: "class",
      name: "Class",
      createdAt: "",
      sessions: ctx.memberships.map((membership) => ({
        id: membership.groupId,
        classId: "class",
        title: membership.groupName,
        createdAt: "",
        groups: [
          {
            id: membership.groupId,
            name: membership.groupName,
            newintervene: membership.newintervene,
            classSessionId: null,
            members: [],
            chatSessionId: null,
          },
        ],
      })),
    },
  ]

  return (
    <div className="conet-page-bg flex min-h-dvh flex-col text-slate-900">
      <ConsentWrapper userId={ctx.profileId} />
      <ClassroomHeader name={ctx.name} role="student" showMaterials={false} />
      <ClassDashboard role="student" classes={classes} showMaterials={false} joinedGroupIds={ctx.groupIds} />
    </div>
  )
}
