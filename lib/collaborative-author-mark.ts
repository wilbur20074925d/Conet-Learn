import { Mark, mergeAttributes } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { ySyncPluginKey } from "y-prosemirror"

export type { AuthoredSection } from "@/lib/group-post-authorship"
export { extractAuthoredSectionsFromHtml } from "@/lib/group-post-authorship"

/** CRDT-safe mark recording who inserted each span of text (stored in submitted HTML). */
export const ConetAuthorMark = Mark.create({
  name: "conetAuthor",
  inclusive: true,
  addAttributes() {
    return {
      authorId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-author-id"),
        renderHTML: (attrs) => (attrs.authorId ? { "data-author-id": attrs.authorId } : {}),
      },
      authorName: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-author-name"),
        renderHTML: (attrs) => (attrs.authorName ? { "data-author-name": attrs.authorName } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-author-id]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0]
  },
})

export function createAuthorStampPlugin(userId: string, userName: string) {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      const markType = newState.schema.marks.conetAuthor
      if (!markType) return null

      let tr = newState.tr
      let modified = false

      for (const transaction of transactions) {
        if (!transaction.docChanged) continue
        const syncMeta = transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined
        if (syncMeta?.isChangeOrigin !== true) continue

        transaction.steps.forEach((step, stepIndex) => {
          step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
            if (newEnd <= newStart) return
            tr = tr.addMark(newStart, newEnd, markType.create({ authorId: userId, authorName: userName }))
            modified = true
          })
          void stepIndex
        })
      }

      return modified ? tr : null
    },
  })
}
