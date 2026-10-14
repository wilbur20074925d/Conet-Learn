import { ArrowRight, Users } from "lucide-react"
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
              ) : (
                <ol className="mt-4 space-y-5">
                  {classroom.sessions.map((session, index) => (
                    <li
                      key={session.id}
                      className="group/session conet-surface grid overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-md grid-cols-[10.5rem_minmax(0,1fr)] sm:grid-cols-[14rem_minmax(0,1fr)] md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]"
                    >
                      <SessionArtwork index={art.get(session.id) ?? index} variant="side" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 sm:gap-3 sm:px-4">
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
                        <p className="px-4 py-4 text-sm text-slate-500 sm:px-4">
                          {role === "student"
                            ? "Your teacher will place you in a group for this session."
                            : "No groups in this session yet."}
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2 bg-slate-50/40 px-2.5 py-2.5 sm:px-3 sm:py-3">
                          {session.groups.map((group) => {
                            const member = role !== "student" || joined.has(group.id)
                            const shown = group.members.slice(0, 5)
                            const extra = group.members.length - shown.length
                            const isJoined = role === "student" && member
                            return (
                              <li
                                key={group.id}
                                className={`group/group relative flex w-full flex-col gap-4 overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center sm:gap-6 sm:p-5 ${
                                  isJoined
                                    ? "border-slate-200 ring-1 ring-slate-900/5"
                                    : "border-slate-200/80"
                                }`}
                              >
                                {isJoined && (
                                  <span
                                    className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-slate-900"
                                    aria-hidden
                                  />
                                )}
                                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                  <div className="flex min-w-0 items-start gap-3 sm:w-52 sm:shrink-0 sm:items-center">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
                                      <Users className="h-4 w-4" strokeWidth={2.25} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                          Group
                                        </p>
                                        {isJoined && (
                                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800 ring-1 ring-emerald-200/80">
                                            Joined
                                          </span>
                                        )}
                                      </div>
                                      <h4 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                                        {group.name}
                                      </h4>
                                      {member && (
                                        <p className="mt-0.5 text-xs font-medium text-slate-500">
                                          {memberLabel(group.members.length)}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {member ? (
                                    group.members.length > 0 ? (
                                      <div className="flex min-w-0 flex-1 items-center gap-3 border-t border-slate-100 pt-3 sm:border-t-0 sm:border-l sm:border-slate-100 sm:pl-6 sm:pt-0">
                                        <div className="flex shrink-0 -space-x-2.5">
                                          {shown.map((person) => (
                                            <span
                                              key={person.id}
                                              title={person.name}
                                              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] font-semibold text-slate-700 shadow-sm"
                                            >
                                              {initials(person.name)}
                                            </span>
                                          ))}
                                          {extra > 0 && (
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-semibold text-white shadow-sm">
                                              +{extra}
                                            </span>
                                          )}
                                        </div>
                                        <p className="min-w-0 truncate text-sm text-slate-600">
                                          {group.members.map((person) => person.name).join(", ")}
                                        </p>
                                      </div>
                                    ) : (
                                      <p className="flex-1 text-sm text-slate-500 sm:border-l sm:border-slate-100 sm:pl-6">
                                        No students in this group yet.
                                      </p>
                                    )
                                  ) : (
                                    <p className="flex-1 text-sm text-slate-500 sm:border-l sm:border-slate-100 sm:pl-6">
                                      Your teacher places students in this group.
                                    </p>
                                  )}
                                </div>

                                {member && (
                                  <div className="shrink-0 sm:w-36">
                                    {onOpen ? (
                                      <button
                                        type="button"
                                        disabled={openingId === group.id}
                                        onClick={() => onOpen(group.id, group.chatSessionId)}
                                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60"
                                      >
                                        {openingId === group.id ? "Opening" : "Open"}
                                        {openingId !== group.id && (
                                          <ArrowRight className="h-4 w-4 transition duration-200 group-hover/group:translate-x-0.5" />
                                        )}
                                      </button>
                                    ) : (
                                      <PendingLink
                                        href={workspaceHref(role, group.id, group.chatSessionId, "note")}
                                        className="group/open inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-slate-800 active:scale-[0.98]"
                                      >
                                        Open
                                        <ArrowRight className="h-4 w-4 transition duration-200 group-hover/open:translate-x-0.5" />
                                      </PendingLink>
                                    )}
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      </div>
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
