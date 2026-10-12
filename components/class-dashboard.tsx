import { ArrowRight, Users } from "lucide-react"
import { JoinSessionGroup } from "@/components/join-group"
import PendingLink from "@/components/pending-link"
import SessionArtwork, { artworkIndexes } from "@/components/session-artwork"
import SessionMaterialsButton from "@/components/session-materials-button"
import { workspaceHref } from "@/lib/class-dashboard"
import type { CatalogClass } from "@/lib/catalog"

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "student" : "students"}`
}

function groupLabel(count: number) {
  return `${count} ${count === 1 ? "group" : "groups"}`
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const letters = parts.map((part) => part[0]?.toUpperCase() || "").join("")
  return letters || "?"
}

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
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      {classes.length === 0 ? (
        <div className="conet-surface px-6 py-10 text-center">
          <p className="text-lg font-bold tracking-tight text-slate-900">No class yet</p>
          <p className="mt-2 text-sm text-slate-500">Your teacher needs to create a class before a session can open.</p>
        </div>
      ) : (
        <div className="space-y-8">
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
                  This class has no sessions yet.
                </div>
              ) : (
                <ol className="mt-4 space-y-5">
                  {classroom.sessions.map((session, index) => (
                    <li
                      key={session.id}
                      className="group/session conet-surface overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <SessionArtwork index={art.get(session.id) ?? index} />
                      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Session</p>
                          <h3 className="truncate text-base font-bold tracking-tight text-slate-900">{session.title}</h3>
                        </div>
                        <p className="text-xs font-medium text-slate-500">{groupLabel(session.groups.length)}</p>
                        {showMaterials && <SessionMaterialsButton role={role} sessionId={session.id} compact />}
                      </div>

                      {session.groups.length === 0 ? (
                        <p className="px-5 py-6 text-sm text-slate-500">No groups in this session yet.</p>
                      ) : (
                        <ul className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
                          {session.groups.map((group) => {
                            const member = role !== "student" || joined.has(group.id)
                            const shown = group.members.slice(0, 4)
                            const extra = group.members.length - shown.length
                            return (
                              <li
                                key={group.id}
                                className="group/group flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Group</p>
                                  {role === "student" && member && (
                                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                                      Joined
                                    </span>
                                  )}
                                </div>
                                <h4 className="mt-1 truncate text-lg font-bold tracking-tight text-slate-900">{group.name}</h4>
                                {member ? (
                                  <>
                                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                      <Users className="h-3.5 w-3.5" />
                                      {memberLabel(group.members.length)}
                                    </p>
                                    {group.members.length > 0 && (
                                      <div className="mt-3">
                                        <div className="flex -space-x-2">
                                          {shown.map((person) => (
                                            <span
                                              key={person.id}
                                              title={person.name}
                                              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-700"
                                            >
                                              {initials(person.name)}
                                            </span>
                                          ))}
                                          {extra > 0 && (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-semibold text-white">
                                              +{extra}
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                                          {group.members.map((person) => person.name).join(", ")}
                                        </p>
                                      </div>
                                    )}
                                    <div className="mt-auto pt-4">
                                      {onOpen ? (
                                        <button
                                          type="button"
                                          disabled={openingId === group.id}
                                          onClick={() => onOpen(group.id, group.chatSessionId)}
                                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60"
                                        >
                                          {openingId === group.id ? "Opening" : "Open"}
                                          {openingId !== group.id && (
                                            <ArrowRight className="h-4 w-4 transition duration-200 group-hover/group:translate-x-0.5" />
                                          )}
                                        </button>
                                      ) : (
                                        <PendingLink
                                          href={workspaceHref(role, group.id, group.chatSessionId, "note")}
                                          className="group/open inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-slate-800 active:scale-[0.98]"
                                        >
                                          Open
                                          <ArrowRight className="h-4 w-4 transition duration-200 group-hover/open:translate-x-0.5" />
                                        </PendingLink>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <div className="mt-auto">
                                    <JoinSessionGroup groupId={group.id} />
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
