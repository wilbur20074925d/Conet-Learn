"use client"

import DashboardLayoutToggle, { useDashboardLayout } from "@/components/dashboard-layout-toggle"
import DashboardSessionsGrid, { DashboardSessionsGridItem } from "@/components/dashboard-sessions-grid"
import {
  ClassDashboardSessionCardItem,
  ClassDashboardSessionListItem,
} from "@/components/class-dashboard-sessions"
import { artworkIndexes } from "@/components/session-artwork"
import type { CatalogClass } from "@/lib/catalog"

export default function ClassDashboard({
  role,
  classes,
  showMaterials = true,
  joinedGroupIds = [],
  onOpen,
  openingId = null,
}: {
  role: "teacher" | "student"
  classes: CatalogClass[]
  showMaterials?: boolean
  joinedGroupIds?: string[]
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  openingId?: string | null
}) {
  const joined = new Set(joinedGroupIds)
  const art = artworkIndexes(classes)
  const { layout, setLayout } = useDashboardLayout()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      {classes.length === 0 ? (
        <div className="conet-surface px-6 py-10 text-center">
          <p className="text-lg font-bold tracking-tight text-slate-900">
            {role === "student" ? "No group yet" : "No class yet"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {role === "student"
              ? "Your teacher places you in one class, then in its sessions and groups."
              : "Your teacher needs to create a class before a session can open."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <DashboardLayoutToggle layout={layout} onChange={setLayout} />
          </div>

          {classes.map((classroom) => (
            <section key={classroom.id}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Class</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{classroom.name}</h2>
                </div>
                <p className="text-xs font-medium text-slate-500">
                  {classroom.sessions.length} {classroom.sessions.length === 1 ? "session" : "sessions"}
                </p>
              </div>

              {classroom.sessions.length === 0 ? (
                <div className="conet-surface mt-4 px-6 py-8 text-center text-sm text-slate-500">
                  {role === "student" ? "Your teacher will place you in a session." : "This class has no sessions yet."}
                </div>
              ) : layout === "list" ? (
                <ol className="mt-4 space-y-5">
                  {classroom.sessions.map((session, index) => (
                    <li key={session.id}>
                      <ClassDashboardSessionListItem
                        session={session}
                        index={index}
                        artIndex={art.get(session.id) ?? index}
                        role={role}
                        joined={joined}
                        showMaterials={showMaterials}
                        onOpen={onOpen}
                        openingId={openingId}
                      />
                    </li>
                  ))}
                </ol>
              ) : classroom.sessions.length === 1 ? (
                <DashboardSessionsGrid count={1}>
                  <ClassDashboardSessionCardItem
                    session={classroom.sessions[0]}
                    index={0}
                    artIndex={art.get(classroom.sessions[0].id) ?? 0}
                    role={role}
                    joined={joined}
                    showMaterials={showMaterials}
                    onOpen={onOpen}
                    openingId={openingId}
                  />
                </DashboardSessionsGrid>
              ) : (
                <DashboardSessionsGrid count={classroom.sessions.length}>
                  {classroom.sessions.map((session, index) => (
                    <DashboardSessionsGridItem key={session.id} index={index} total={classroom.sessions.length}>
                      <ClassDashboardSessionCardItem
                        session={session}
                        index={index}
                        artIndex={art.get(session.id) ?? index}
                        role={role}
                        joined={joined}
                        showMaterials={showMaterials}
                        onOpen={onOpen}
                        openingId={openingId}
                      />
                    </DashboardSessionsGridItem>
                  ))}
                </DashboardSessionsGrid>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
