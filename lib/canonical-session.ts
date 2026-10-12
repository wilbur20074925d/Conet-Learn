export function canonicalSession<T extends { createdAt: string }>(sessions: T[]): T | null {
  if (sessions.length === 0) return null
  return sessions.reduce((oldest, session) => (session.createdAt < oldest.createdAt ? session : oldest))
}
