import type { AuthoredSection } from "@/lib/group-post-authorship"

export type GroupPostSubmitMeta = {
  submittedBy: { userId: string; userName: string }
  contributors: { userId: string; userName: string }[]
  comments: {
    id: string
    authorId: string
    authorName: string
    text: string
    quote?: string
    createdAt: string
  }[]
  authoredSections?: AuthoredSection[]
}

const META_RE = /^<!--CONET_SUBMIT_META([\s\S]*?)-->\s*/

export function embedGroupPostSubmitMeta(html: string, meta: GroupPostSubmitMeta): string {
  const payload = JSON.stringify(meta)
  return `<!--CONET_SUBMIT_META${payload}-->${html}`
}

export function parseGroupPostSubmitMeta(content: string): {
  html: string
  meta: GroupPostSubmitMeta | null
} {
  const match = content.match(META_RE)
  if (!match) return { html: content, meta: null }
  try {
    const meta = JSON.parse(match[1]) as GroupPostSubmitMeta
    return { html: content.slice(match[0].length), meta }
  } catch {
    return { html: content, meta: null }
  }
}
