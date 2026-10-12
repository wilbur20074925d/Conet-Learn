export type DashboardMember = {
  id: string
  name: string
  role: string
}

export type DashboardSourceGroup = {
  id: string
  name: string
  newintervene: number
  members: DashboardMember[]
  sessions: { id: string; title: string; createdAt: string }[]
}

export type DashboardGroupCard = {
  id: string
  name: string
  newintervene: number
  members: DashboardMember[]
  sessionId: string | null
  sessionTitle: string
  openedAt: string | null
}

export type DashboardSessionBlock = {
  key: string
  title: string
  openedAt: string | null
  groups: DashboardGroupCard[]
}

export type DashboardClass = {
  id: string
  name: string
  sessions: DashboardSessionBlock[]
}

const OPEN_SESSION_KEY = "open"

function sessionKey(title: string) {
  const cleaned = title.trim().toLowerCase()
  return cleaned || "session"
}

export function buildClassDashboard(className: string, groups: DashboardSourceGroup[]): DashboardClass {
  const blocks = new Map<string, DashboardSessionBlock>()

  const ensure = (key: string, title: string) => {
    const existing = blocks.get(key)
    if (existing) return existing
    const created: DashboardSessionBlock = { key, title, openedAt: null, groups: [] }
    blocks.set(key, created)
    return created
  }

  for (const group of groups) {
    const students = group.members.filter((member) => member.role !== "ai" && member.role !== "teacher")
    if (group.sessions.length === 0) {
      const block = ensure(OPEN_SESSION_KEY, "Current session")
      block.groups.push({
        id: group.id,
        name: group.name,
        newintervene: group.newintervene,
        members: students,
        sessionId: null,
        sessionTitle: "Current session",
        openedAt: null,
      })
      continue
    }

    for (const session of group.sessions) {
      const title = session.title.trim() || "Session"
      const block = ensure(sessionKey(title), title)
      if (!block.openedAt || session.createdAt < block.openedAt) block.openedAt = session.createdAt
      block.groups.push({
        id: group.id,
        name: group.name,
        newintervene: group.newintervene,
        members: students,
        sessionId: session.id,
        sessionTitle: title,
        openedAt: session.createdAt,
      })
    }
  }

  const sessions = [...blocks.values()]
    .map((block) => ({
      ...block,
      groups: [...block.groups].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.key === OPEN_SESSION_KEY) return -1
      if (b.key === OPEN_SESSION_KEY) return 1
      if (a.openedAt && b.openedAt && a.openedAt !== b.openedAt) return a.openedAt < b.openedAt ? -1 : 1
      return a.title.localeCompare(b.title)
    })

  return {
    id: "class",
    name: className.trim() || "Class",
    sessions,
  }
}

export function workspaceHref(
  role: "teacher" | "student",
  groupId: string,
  sessionId: string | null,
  view: "note" | "post"
) {
  if (role === "teacher") {
    const params = new URLSearchParams({ group: groupId, view })
    if (sessionId) params.set("session", sessionId)
    return `/dashboard?${params.toString()}`
  }
  const params = new URLSearchParams({ group: groupId })
  if (sessionId) params.set("session", sessionId)
  const query = params.toString()
  return view === "note" ? `/in-class-session?${query}` : `/?${query}`
}
