import "server-only"
import { cookies } from "next/headers"

// This is an insecure way to manage sessions, suitable only for local, non-critical applications.
// It simply stores the user ID in a plain cookie.

export async function setUserIdInCookie(userId: number) {
  const cookieStore = await cookies()
  const headers = new Headers(cookieStore as any)
  const port = headers.get('host')?.split(':')[1] || '3000'
  cookieStore.set(`userId_${port}`, String(userId), {
    path: "/",
  })
}

export async function getUserIdFromCookie() {
  const cookieStore = await cookies()
  const headers = new Headers(cookieStore as any)
  const port = headers.get('host')?.split(':')[1] || '3000'
  const userId = cookieStore.get(`userId_${port}`)?.value
  return userId ? Number(userId) : undefined
}

export async function deleteUserIdFromCookie() {
  const cookieStore = await cookies()
  const headers = new Headers(cookieStore as any)
  const port = headers.get('host')?.split(':')[1] || '3000'
  cookieStore.delete(`userId_${port}`)
}
