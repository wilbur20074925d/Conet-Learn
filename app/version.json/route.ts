import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/** Build stamp polled by the client. Same value baked into NEXT_PUBLIC_APP_VERSION. */
export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION || "" },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  )
}
