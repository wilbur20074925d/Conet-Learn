"use client"

import { createClient } from "@/lib/supabase/browser"

const MAX_BYTES = 20 * 1024 * 1024

export async function uploadSessionFile(
  sessionId: string,
  file: File
): Promise<{ ok: true; url: string; fileName: string } | { ok: false; error: string }> {
  if (file.size > MAX_BYTES) return { ok: false, error: "Use a file smaller than 20 MB." }
  const safe = file.name.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "file"
  const path = `${sessionId}/${crypto.randomUUID()}-${safe}`
  const supabase = createClient()
  const uploaded = await supabase.storage.from("conet-materials").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploaded.error) {
    const message = uploaded.error.message || ""
    if (/bucket|not found|schema/i.test(message)) {
      return { ok: false, error: "File upload is not ready yet. Run supabase/conet-classes.sql, then try again." }
    }
    return { ok: false, error: "Could not upload that file." }
  }
  const { data } = supabase.storage.from("conet-materials").getPublicUrl(path)
  return { ok: true, url: data.publicUrl, fileName: file.name }
}
