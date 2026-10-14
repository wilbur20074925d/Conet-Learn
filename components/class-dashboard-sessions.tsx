import { ArrowRight, Users } from "lucide-react"
import PendingLink from "@/components/pending-link"
import SessionArtwork from "@/components/session-artwork"
import SessionMaterialsButton from "@/components/session-materials-button"
import { workspaceHref } from "@/lib/class-dashboard"
import type { CatalogGroup, CatalogSession } from "@/lib/catalog"

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

type SessionGroupsProps = {
  role: "teacher" | "student"
  session: CatalogSession
  joined: Set<string>
  showMaterials: boolean
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  openingId?: string | null
  compact?: boolean
}

function SessionGroups({
  role,
  session,
  joined,
  showMaterials: _showMaterials,
  onOpen,
  openingId = null,
  compact = false,
}: SessionGroupsProps) {
  if (session.groups.length === 0) {
    return (
      <p className={compact ? "px-4 py-3 text-sm text-slate-500" : "px-4 py-4 text-sm text-slate-500 sm:px-4"}>
        {role === "student"
          ? "Your teacher will place you in a group for this session."
          : "No groups in this session yet."}
      </p>
    )
  }

  return (
    <ul
      className={
        compact
          ? "flex flex-col gap-2 px-3 py-3"
          : "flex flex-col gap-2 bg-slate-50/40 px-2.5 py-2.5 sm:px-3 sm:py-3"
      }
    >
      {session.groups.map((group) => (
        <GroupRow
          key={group.id}
          role={role}
          group={group}
          joined={joined}
          onOpen={onOpen}
          openingId={openingId}
          compact={compact}
        />
      ))}
    </ul>
  )
}

function GroupRow({
  role,
  group,
  joined,
  onOpen,
  openingId,
  compact,
}: {
  role: "teacher" | "student"
  group: CatalogGroup
  joined: Set<string>
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  openingId?: string | null
  compact: boolean
}) {
  const member = role !== "student" || joined.has(group.id)
  const shown = group.members.slice(0, compact ? 4 : 5)
  const extra = group.members.length - shown.length
  const isJoined = role === "student" && member

  if (compact) {
    return (
      <li
        className={`rounded-xl border bg-white p-3 shadow-sm ${
          isJoined ? "border-slate-200 ring-1 ring-slate-900/5" : "border-slate-200/80"
        }`}
      >
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Users className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Group</p>
              {isJoined && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800 ring-1 ring-emerald-200/80">
                  Joined
                </span>
              )}
            </div>
            <h4 className="truncate text-sm font-bold text-slate-900">{group.name}</h4>
            {member && group.members.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {group.members.map((person) => person.name).join(", ")}
              </p>
            )}
          </div>
        </div>
        {member && (
          <div className="mt-3">
            <OpenGroupButton role={role} group={group} onOpen={onOpen} openingId={openingId} compact />
          </div>
        )}
        {!member && (
          <p className="mt-2 text-xs text-slate-500">Your teacher places students in this group.</p>
        )}
      </li>
    )
  }

  return (
    <li
      className={`group/group relative flex w-full flex-col gap-4 overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center sm:gap-6 sm:p-5 ${
        isJoined ? "border-slate-200 ring-1 ring-slate-900/5" : "border-slate-200/80"
      }`}
    >
      {isJoined && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-slate-900" aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 items-start gap-3 sm:w-52 sm:shrink-0 sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
            <Users className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Group</p>
              {isJoined && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800 ring-1 ring-emerald-200/80">
                  Joined
                </span>
              )}
            </div>
            <h4 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">{group.name}</h4>
            {member && (
              <p className="mt-0.5 text-xs font-medium text-slate-500">{memberLabel(group.members.length)}</p>
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
          <OpenGroupButton role={role} group={group} onOpen={onOpen} openingId={openingId} />
        </div>
      )}
    </li>
  )
}

function OpenGroupButton({
  role,
  group,
  onOpen,
  openingId,
  compact = false,
}: {
  role: "teacher" | "student"
  group: CatalogGroup
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  openingId?: string | null
  compact?: boolean
}) {
  const height = compact ? "h-9" : "h-11"
  const text = compact ? "text-xs" : "text-sm"

  if (onOpen) {
    return (
      <button
        type="button"
        disabled={openingId === group.id}
        onClick={() => onOpen(group.id, group.chatSessionId)}
        className={`inline-flex ${height} w-full items-center justify-center gap-2 rounded-xl bg-slate-900 ${text} font-semibold text-white shadow-sm transition duration-200 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60`}
      >
        {openingId === group.id ? "Opening" : "Open"}
        {openingId !== group.id && <ArrowRight className="h-4 w-4" />}
      </button>
    )
  }

  return (
    <PendingLink
      href={workspaceHref(role, group.id, group.chatSessionId, "note")}
      className={`group/open inline-flex ${height} w-full items-center justify-center gap-2 rounded-xl bg-slate-900 ${text} font-semibold text-white shadow-sm transition duration-200 hover:bg-slate-800 active:scale-[0.98]`}
    >
      Open
      <ArrowRight className="h-4 w-4 transition duration-200 group-hover/open:translate-x-0.5" />
    </PendingLink>
  )
}

function SessionHeader({
  index,
  session,
  role,
  showMaterials,
  groupCount,
}: {
  index: number
  session: CatalogSession
  role: "teacher" | "student"
  showMaterials: boolean
  groupCount: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 sm:gap-3 sm:px-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Session</p>
        <h3 className="truncate text-base font-bold tracking-tight text-slate-900">{session.title}</h3>
      </div>
      <p className="text-xs font-medium text-slate-500">{groupLabel(groupCount)}</p>
      {showMaterials && <SessionMaterialsButton role={role} sessionId={session.id} compact />}
    </div>
  )
}

export function ClassDashboardSessionListItem({
  session,
  index,
  artIndex,
  role,
  joined,
  showMaterials,
  onOpen,
  openingId,
}: {
  session: CatalogSession
  index: number
  artIndex: number
  role: "teacher" | "student"
  joined: Set<string>
  showMaterials: boolean
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  openingId?: string | null
}) {
  return (
    <div className="group/session conet-surface grid overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-md grid-cols-[13rem_minmax(0,1fr)] sm:grid-cols-[18rem_minmax(0,1fr)] md:grid-cols-[22rem_minmax(0,1fr)] lg:grid-cols-[minmax(26rem,38%)_minmax(0,1fr)]">
      <SessionArtwork index={artIndex} variant="side" />
      <div className="flex min-w-0 flex-1 flex-col">
        <SessionHeader
          index={index}
          session={session}
          role={role}
          showMaterials={showMaterials}
          groupCount={session.groups.length}
        />
        <SessionGroups
          role={role}
          session={session}
          joined={joined}
          showMaterials={showMaterials}
          onOpen={onOpen}
          openingId={openingId}
        />
      </div>
    </div>
  )
}

export function ClassDashboardSessionCardItem({
  session,
  index,
  artIndex,
  role,
  joined,
  showMaterials,
  onOpen,
  openingId,
}: {
  session: CatalogSession
  index: number
  artIndex: number
  role: "teacher" | "student"
  joined: Set<string>
  showMaterials: boolean
  onOpen?: (groupId: string, chatSessionId: string | null) => void
  openingId?: string | null
}) {
  return (
    <div className="group/session conet-surface flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <SessionArtwork index={artIndex} variant="banner" className="h-36 sm:h-40" />
      <SessionHeader
        index={index}
        session={session}
        role={role}
        showMaterials={showMaterials}
        groupCount={session.groups.length}
      />
      <div className="flex flex-1 flex-col bg-slate-50/40">
        <SessionGroups
          role={role}
          session={session}
          joined={joined}
          showMaterials={showMaterials}
          onOpen={onOpen}
          openingId={openingId}
          compact
        />
      </div>
    </div>
  )
}
