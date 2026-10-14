import { NextRequest, NextResponse } from "next/server"
import { withApiLogging } from "@/lib/api-logger"
import {
  buildTeacherChatExportZip,
  buildTeacherSubmissionsExportZip,
  type TeacherExportScope,
} from "@/lib/teacher-export"

function parseScope(body: unknown): TeacherExportScope | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  const kind = record.kind
  if (kind !== "chat" && kind !== "submissions") return null

  const exportAll = record.exportAll === true
  const classIds = Array.isArray(record.classIds)
    ? record.classIds.filter((item): item is string => typeof item === "string")
    : []
  const sessionIds = Array.isArray(record.sessionIds)
    ? record.sessionIds.filter((item): item is string => typeof item === "string")
    : []
  const groupIds = Array.isArray(record.groupIds)
    ? record.groupIds.filter((item): item is string => typeof item === "string")
    : []

  return { exportAll, classIds, sessionIds, groupIds }
}

export const POST = withApiLogging("teacher-export:POST", async (request: NextRequest) => {
  try {
    const body = await request.json()
    const scope = parseScope(body)
    const kind = body?.kind
    if (!scope || (kind !== "chat" && kind !== "submissions")) {
      return NextResponse.json({ error: "Invalid export request." }, { status: 400 })
    }

    const result =
      kind === "chat" ? await buildTeacherChatExportZip(scope) : await buildTeacherSubmissionsExportZip(scope)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.error === "Unauthorized" ? 401 : 400 })
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
