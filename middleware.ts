import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { ensureRequestId } from "./lib/logger"
import { supabasePublishableKey, supabaseUrl } from "./lib/supabase/env"

export async function middleware(request: NextRequest) {
  const rid = ensureRequestId(request.headers.get("x-request-id"))
  let response = NextResponse.next({ request })
  response.headers.set("x-request-id", rid)

  const supabase = createServerClient(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          response.headers.set("x-request-id", rid)
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
