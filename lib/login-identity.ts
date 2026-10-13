/** Synthetic email domain for student username logins (e.g. CHANTAIMEN → chantaimen@…). */
export const STUDENT_LOGIN_DOMAIN =
  process.env.NEXT_PUBLIC_STUDENT_LOGIN_DOMAIN?.trim() || "students.conetlearn.local"

export function usernameFromName(name: string) {
  return name.replace(/\s+/g, "").toUpperCase()
}

export function loginEmailFromUsername(username: string) {
  const clean = username.trim().toLowerCase()
  if (!clean) return ""
  return `${clean}@${STUDENT_LOGIN_DOMAIN}`
}

/** Accepts a username (CHANTAIMEN) or a full email (teacher@school.edu). */
export function loginEmailFromIdentifier(identifier: string) {
  const trimmed = identifier.trim()
  if (!trimmed) return ""
  if (trimmed.includes("@")) return trimmed.toLowerCase()
  return loginEmailFromUsername(trimmed)
}

export function displayLoginUsername(email: string | null | undefined) {
  if (!email) return "—"
  const at = email.indexOf("@")
  if (at <= 0) return email
  const domain = email.slice(at + 1).toLowerCase()
  if (domain === STUDENT_LOGIN_DOMAIN.toLowerCase()) {
    return email.slice(0, at).toUpperCase()
  }
  return email
}
