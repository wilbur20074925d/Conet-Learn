import "server-only"

import { inflateSync } from "node:zlib"
import type { SupabaseClient } from "@supabase/supabase-js"
import { formatSessionMaterialsForNate, sessionBriefFromRow, type SessionBrief, type SessionMaterial } from "./session-materials"

export type NateSessionMaterials = {
  text: string
  images: string[]
}

const EMPTY: NateSessionMaterials = { text: "", images: [] }
const EXCERPT_LIMIT = 6000
const TOTAL_EXCERPT_LIMIT = 20000
const DOWNLOAD_LIMIT = 2_000_000
const cache = new Map<string, NateSessionMaterials>()

export async function loadNateSessionMaterials(
  supabase: SupabaseClient,
  groupId: string
): Promise<NateSessionMaterials> {
  try {
    const group = await supabase.from("ConetGroups").select("class_session_id").eq("id", groupId).maybeSingle()
    const classSessionId =
      !group.error && typeof group.data?.class_session_id === "string" ? group.data.class_session_id : ""
    const loaded = await readBrief(supabase, classSessionId || "current")
    return loaded || EMPTY
  } catch (error) {
    console.error("Could not load session materials for NATE", error)
    return EMPTY
  }
}

async function readBrief(supabase: SupabaseClient, briefId: string): Promise<NateSessionMaterials | null> {
  const result = await supabase
    .from("ConetSessionBrief")
    .select("title, instructions, materials, updated_at")
    .eq("id", briefId)
    .maybeSingle()
  if (result.error) return null

  const brief = sessionBriefFromRow(result.data)
  const cacheKey = `${briefId}:${brief.updatedAt || "empty"}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const prepared = await prepareMaterials(brief)
  cache.set(cacheKey, prepared)
  if (cache.size > 40) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  return prepared
}

async function prepareMaterials(brief: SessionBrief): Promise<NateSessionMaterials> {
  const excerpts: Record<string, string> = {}
  const images: string[] = []
  const reads = await Promise.all(brief.materials.map((item) => readMaterial(item)))
  reads.forEach((read, index) => {
    const item = brief.materials[index]
    if (read.image) images.push(read.image)
    if (read.text) excerpts[item.id] = read.text.slice(0, EXCERPT_LIMIT)
  })

  let used = 0
  for (const item of brief.materials) {
    const excerpt = excerpts[item.id]
    if (!excerpt) continue
    const room = TOTAL_EXCERPT_LIMIT - used
    if (room <= 0) {
      delete excerpts[item.id]
      continue
    }
    excerpts[item.id] = excerpt.slice(0, room)
    used += excerpts[item.id].length
  }

  return {
    text: formatSessionMaterialsForNate(brief, excerpts),
    images: images.slice(0, 4),
  }
}

async function readMaterial(item: SessionMaterial): Promise<{ text?: string; image?: string }> {
  if (!isPublicHttpUrl(item.url)) return {}
  const path = item.url.split("?")[0]
  const namedImage = !/\.[a-z0-9]+$/i.test(path) && IMAGE_EXT.test(item.fileName || "")
  if (IMAGE_EXT.test(path) || namedImage) return { image: item.url }

  try {
    const response = await fetchPublic(item.url)
    if (!response?.ok) return {}
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (type.startsWith("image/")) return { image: item.url }

    const length = Number(response.headers.get("content-length") || 0)
    if (length > DOWNLOAD_LIMIT) return {}
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > DOWNLOAD_LIMIT) return {}

    if (type === "application/pdf" || PDF_EXT.test(path) || buffer.subarray(0, 5).toString() === "%PDF-") {
      const text = extractPdfText(buffer)
      return text ? { text } : {}
    }
    if (type.startsWith("text/") || type.includes("json") || type.includes("xml") || TEXT_EXT.test(path)) {
      const raw = buffer.toString("utf8")
      const text = type.includes("html") || /\.html?$/i.test(path) ? htmlToText(raw) : raw.replace(/\s+/g, " ").trim()
      return text ? { text: text.slice(0, EXCERPT_LIMIT) } : {}
    }
  } catch (error) {
    console.error("Could not read a session material", item.url, error)
  }
  return {}
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i
const PDF_EXT = /\.pdf$/i
const TEXT_EXT = /\.(txt|md|markdown|csv|json|html?|xml)$/i

async function fetchPublic(start: string): Promise<Response | null> {
  let current = start
  for (let hop = 0; hop < 3; hop += 1) {
    if (!isPublicHttpUrl(current)) return null
    const response = await fetch(current, { signal: AbortSignal.timeout(8000), redirect: "manual" })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) return null
      current = new URL(location, current).toString()
      continue
    }
    return response
  }
  return null
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return false
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") return false
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
    return true
  } catch {
    return false
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function extractPdfText(buffer: Buffer): string {
  const pieces: string[] = []
  const source = buffer.toString("latin1")
  const streams = source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)
  for (const match of streams) {
    const raw = Buffer.from(match[1], "latin1")
    let decoded = ""
    try {
      decoded = inflateSync(raw).toString("latin1")
    } catch {
      decoded = raw.toString("latin1")
    }
    collectPdfStrings(decoded, pieces)
    if (pieces.join(" ").length > EXCERPT_LIMIT) break
  }
  if (pieces.length === 0) collectPdfStrings(source, pieces)
  const text = pieces.join(" ").replace(/\s+/g, " ").trim()
  const letters = text.replace(/[^A-Za-z]/g, "")
  if (letters.length < 40) return ""
  return text.slice(0, EXCERPT_LIMIT)
}

function collectPdfStrings(source: string, pieces: string[]) {
  for (const match of source.matchAll(/\((?:\\.|[^\\)]){1,800}\)\s*Tj/g)) {
    pieces.push(pdfLiteral(match[0].replace(/\)\s*Tj$/, "").slice(1)))
  }
  for (const match of source.matchAll(/\[((?:\s*\((?:\\.|[^\\)])*\)\s*){1,40})\]\s*TJ/g)) {
    for (const inner of match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      pieces.push(pdfLiteral(inner[0].slice(1, -1)))
    }
  }
}

function pdfLiteral(value: string): string {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(Number.parseInt(oct, 8)))
}
