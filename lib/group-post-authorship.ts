export type AuthoredSection = {
  sectionIndex: number
  userId: string
  userName: string
  plainText: string
  html: string
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripInlineTags(html: string) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
}

function readSpanAttributes(tag: string): { authorId: string; authorName: string } | null {
  const idMatch = tag.match(/data-author-id="([^"]*)"/i)
  if (!idMatch) return null
  const nameMatch = tag.match(/data-author-name="([^"]*)"/i)
  return {
    authorId: idMatch[1],
    authorName: nameMatch?.[1] || "Student",
  }
}

/** Merge consecutive spans by author; unattributed runs are labeled separately. */
export function extractAuthoredSectionsFromHtml(html: string): AuthoredSection[] {
  if (!html.trim()) return []

  const pieces: Omit<AuthoredSection, "sectionIndex">[] = []
  const spanOpen = /<span\b([^>]*)>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  const pushPlain = (chunk: string) => {
    const plain = stripInlineTags(chunk)
    if (!plain) return
    pieces.push({ userId: "", userName: "Unattributed", plainText: plain, html: chunk })
  }

  while ((match = spanOpen.exec(html)) !== null) {
    if (match.index > lastIndex) {
      pushPlain(html.slice(lastIndex, match.index))
    }

    const attrs = readSpanAttributes(match[0])
    const closeIndex = html.indexOf("</span>", spanOpen.lastIndex)
    if (closeIndex < 0) break
    const inner = html.slice(spanOpen.lastIndex, closeIndex)
    const plain = stripInlineTags(inner)
    if (plain && attrs) {
      pieces.push({
        userId: attrs.authorId,
        userName: attrs.authorName,
        plainText: plain,
        html: html.slice(match.index, closeIndex + 7),
      })
    } else if (plain) {
      pushPlain(inner)
    }
    lastIndex = closeIndex + 7
    spanOpen.lastIndex = lastIndex
  }

  if (lastIndex < html.length) {
    pushPlain(html.slice(lastIndex))
  }

  if (pieces.length === 0) {
    const plain = stripInlineTags(html)
    if (plain) {
      pieces.push({ userId: "", userName: "Unattributed", plainText: plain, html })
    }
  }

  const merged: Omit<AuthoredSection, "sectionIndex">[] = []
  for (const piece of pieces) {
    const prev = merged[merged.length - 1]
    if (prev && prev.userId === piece.userId && prev.userName === piece.userName) {
      prev.plainText = `${prev.plainText} ${piece.plainText}`.trim()
      prev.html = `${prev.html}${piece.html}`
      continue
    }
    merged.push({ ...piece })
  }

  return merged.map((item, index) => ({ ...item, sectionIndex: index + 1 }))
}
