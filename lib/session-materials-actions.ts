"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSessionContext } from "./actions"
import type { SessionBrief, SessionMaterial } from "./session-materials"
import { createClient } from "./supabase/server"

const materialSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => value === "" || /^https?:\/\//i.test(value), "Use a link that starts with http:// or https://."),
  note: z.string().trim().max(400),
  fileName: z.string().trim().max(180).optional().or(z.literal("")),
})

const briefSchema = z.object({
  title: z.string().trim().max(120),
  instructions: z.string().trim().max(8000),
  materials: z.array(materialSchema).max(16),
})

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message || ""
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    (/ConetSessionBrief/i.test(message) && /schema cache|does not exist/i.test(message))
  )
}

function asMaterials(value: unknown): SessionMaterial[] {
  if (!Array.isArray(value)) return []
  const materials: SessionMaterial[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const title = typeof row.title === "string" ? row.title.trim() : ""
    if (!title) continue
    const fileName = typeof row.fileName === "string" ? row.fileName.trim() : ""
    materials.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID(),
      title,
      url: typeof row.url === "string" ? row.url.trim() : "",
      note: typeof row.note === "string" ? row.note.trim() : "",
      ...(fileName ? { fileName } : {}),
    })
  }
  return materials
}

function asBrief(row: { title?: string | null; instructions?: string | null; materials?: unknown; updated_at?: string | null } | null): SessionBrief {
  if (!row) {
    return { title: "", instructions: "", materials: [], updatedAt: null }
  }
  return {
    title: (row.title || "").trim(),
    instructions: (row.instructions || "").trim(),
    materials: asMaterials(row.materials),
    updatedAt: row.updated_at || null,
  }
}

export async function getSessionBrief(sessionId = "current"): Promise<
  { ok: true; brief: SessionBrief } | { ok: false; error: string; needsSetup?: boolean }
> {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false, error: session.error }
  const briefId = sessionId.trim() || "current"

  const supabase = await createClient()
  const result = await supabase
    .from("ConetSessionBrief")
    .select("title, instructions, materials, updated_at")
    .eq("id", briefId)
    .maybeSingle()

  if (result.error) {
    if (missingTable(result.error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "Session materials are not in the database yet.",
      }
    }
    return { ok: false, error: "Could not load session materials." }
  }

  return { ok: true, brief: asBrief(result.data) }
}

export async function saveSessionBrief(input: {
  sessionId?: string
  title: string
  instructions: string
  materials: SessionMaterial[]
}): Promise<{ ok: true; brief: SessionBrief } | { ok: false; error: string; needsSetup?: boolean }> {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false, error: session.error }
  if (session.ctx.role !== "teacher") return { ok: false, error: "Only a teacher can update session materials." }

  const parsed = briefSchema.safeParse(input)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Check the session materials and try again."
    return { ok: false, error: message }
  }

  const supabase = await createClient()
  const updatedAt = new Date().toISOString()
  const briefId = input.sessionId?.trim() || "current"
  const materials = parsed.data.materials.map((item) => {
    const fileName = item.fileName?.trim()
    return fileName ? { ...item, fileName } : { id: item.id, title: item.title, url: item.url, note: item.note }
  })
  const saved = await supabase.from("ConetSessionBrief").upsert({
    id: briefId,
    title: parsed.data.title,
    instructions: parsed.data.instructions,
    materials,
    updated_at: updatedAt,
    updated_by: session.ctx.profileId,
  })

  if (saved.error) {
    if (missingTable(saved.error)) {
      return {
        ok: false,
        needsSetup: true,
        error: "Session materials are not in the database yet.",
      }
    }
    return { ok: false, error: "Could not save session materials." }
  }

  revalidatePath("/")
  revalidatePath("/dashboard")
  revalidatePath("/in-class-session")
  return {
    ok: true,
    brief: {
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      materials,
      updatedAt,
    },
  }
}
