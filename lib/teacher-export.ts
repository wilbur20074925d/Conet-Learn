import "server-only"

import JSZip from "jszip"
import { getSessionContext } from "@/lib/actions"
import { getTeacherBoard } from "@/lib/classroom"
import { getClassCatalog } from "@/lib/class-catalog"
import { extractAuthoredSectionsFromHtml } from "@/lib/group-post-authorship"
import { parseGroupPostSubmitMeta } from "@/lib/group-post-submit-meta"
import { listGroupIndividualNotes } from "@/lib/group-notes"
import { fetchSessionMessages } from "@/lib/seminar-sync"
import { rowsToCsv } from "@/lib/csv-export"
import { aiModeLabel, exportChatMessageRow, isThinkingPlaceholder } from "@/lib/teacher-export-chat"
import { createClient } from "@/lib/supabase/server"

const CHAT_CSV_HEADERS = [
  "className",
  "classSessionTitle",
  "groupId",
  "groupName",
  "groupAiMode",
  "chatSessionId",
  "chatSessionTitle",
  "messageId",
  "createdAt",
  "authorId",
  "authorName",
  "authorRole",
  "isAiMessage",
  "content",
  "isReply",
  "replyToMessageId",
  "replyToAuthorName",
  "replyToContent",
  "aiTag",
  "chatAudience",
  "chatAudienceLabel",
  "chatAudienceVia",
  "chatTargetUserIds",
  "chatTargetNames",
] as const

type ChatCsvRow = Record<(typeof CHAT_CSV_HEADERS)[number], string>

const INDIVIDUAL_NOTE_CSV_HEADERS = [
  "className",
  "classSessionTitle",
  "groupId",
  "groupName",
  "userId",
  "userName",
  "recordType",
  "submissionId",
  "submittedAt",
  "submittedPart",
  "concept1",
  "concept2",
] as const

type IndividualNoteCsvRow = Record<(typeof INDIVIDUAL_NOTE_CSV_HEADERS)[number], string>

const GROUP_POST_CSV_HEADERS = [
  "className",
  "classSessionTitle",
  "groupId",
  "groupName",
  "submissionId",
  "submittedAt",
  "submittedByUserId",
  "submittedByUserName",
  "title",
  "noteId",
  "htmlContent",
  "plainTextContent",
  "contributorsPresentNames",
  "contributorsPresentIds",
] as const

type GroupPostCsvRow = Record<(typeof GROUP_POST_CSV_HEADERS)[number], string>

const GROUP_POST_PART_CSV_HEADERS = [
  "className",
  "classSessionTitle",
  "groupId",
  "groupName",
  "submissionId",
  "authorUserId",
  "authorUserName",
  "quotedText",
  "commentText",
  "commentCreatedAt",
] as const

type GroupPostPartCsvRow = Record<(typeof GROUP_POST_PART_CSV_HEADERS)[number], string>

const GROUP_POST_AUTHORED_SECTION_CSV_HEADERS = [
  "className",
  "classSessionTitle",
  "groupId",
  "groupName",
  "submissionId",
  "submittedAt",
  "submittedByUserName",
  "sectionIndex",
  "authorUserId",
  "authorUserName",
  "plainText",
  "htmlSnippet",
] as const

type GroupPostAuthoredSectionCsvRow = Record<(typeof GROUP_POST_AUTHORED_SECTION_CSV_HEADERS)[number], string>

function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function submissionScopeColumns(target: ExportTarget) {
  return {
    className: target.className ?? "",
    classSessionTitle: target.classSessionTitle ?? "",
    groupId: target.groupId,
    groupName: target.groupName,
  }
}

export type TeacherExportScope = {
  exportAll: boolean
  classIds: string[]
  sessionIds: string[]
  groupIds: string[]
}

export type ExportTarget = {
  groupId: string
  groupName: string
  classId: string | null
  className: string | null
  classSessionId: string | null
  classSessionTitle: string | null
  newintervene: number
}

function slug(value: string) {
  return value
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "item"
}

async function requireTeacher() {
  const session = await getSessionContext()
  if (!session.ok) return { ok: false as const, error: session.error }
  if (session.ctx.role !== "teacher") return { ok: false as const, error: "Only a teacher can export data." }
  return { ok: true as const }
}

function resolveTargets(
  scope: TeacherExportScope,
  catalog: Awaited<ReturnType<typeof getClassCatalog>>,
  board: Awaited<ReturnType<typeof getTeacherBoard>>
): ExportTarget[] {
  if (!catalog.ok || !board.ok) return []

  const targets: ExportTarget[] = []
  const seen = new Set<string>()

  function addTarget(input: ExportTarget) {
    if (seen.has(input.groupId)) return
    seen.add(input.groupId)
    targets.push(input)
  }

  const boardGroupById = new Map(board.groups.map((group) => [group.id, group]))

  if (scope.exportAll) {
    for (const classroom of catalog.classes) {
      for (const session of classroom.sessions) {
        for (const group of session.groups) {
          const live = boardGroupById.get(group.id)
          addTarget({
            groupId: group.id,
            groupName: group.name,
            classId: classroom.id,
            className: classroom.name,
            classSessionId: session.id,
            classSessionTitle: session.title,
            newintervene: live?.newintervene ?? group.newintervene,
          })
        }
      }
    }
    for (const group of catalog.looseGroups) {
      const live = boardGroupById.get(group.id)
      addTarget({
        groupId: group.id,
        groupName: group.name,
        classId: null,
        className: null,
        classSessionId: null,
        classSessionTitle: null,
        newintervene: live?.newintervene ?? group.newintervene,
      })
    }
    return targets
  }

  const classIdSet = new Set(scope.classIds)
  const sessionIdSet = new Set(scope.sessionIds)
  const groupIdSet = new Set(scope.groupIds)

  for (const classroom of catalog.classes) {
    if (classIdSet.size > 0 && !classIdSet.has(classroom.id)) continue
    for (const session of classroom.sessions) {
      if (sessionIdSet.size > 0 && !sessionIdSet.has(session.id)) continue
      for (const group of session.groups) {
        if (groupIdSet.size > 0 && !groupIdSet.has(group.id)) continue
        const live = boardGroupById.get(group.id)
        addTarget({
          groupId: group.id,
          groupName: group.name,
          classId: classroom.id,
          className: classroom.name,
          classSessionId: session.id,
          classSessionTitle: session.title,
          newintervene: live?.newintervene ?? group.newintervene,
        })
      }
    }
  }

  if (groupIdSet.size > 0) {
    for (const group of catalog.looseGroups) {
      if (!groupIdSet.has(group.id)) continue
      const live = boardGroupById.get(group.id)
      addTarget({
        groupId: group.id,
        groupName: group.name,
        classId: null,
        className: null,
        classSessionId: null,
        classSessionTitle: null,
        newintervene: live?.newintervene ?? group.newintervene,
      })
    }
  }

  return targets
}

async function loadGroupPostSubmissions(groupId: string) {
  const supabase = await createClient()
  const rows = await supabase
    .from("ConetGroupPostSubmissions")
    .select("id, title, content, created_at, user_id, note_id")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })

  if (rows.error || !rows.data) return []

  const userIds = [...new Set(rows.data.map((row) => row.user_id as string))]
  const names = new Map<string, string>()
  if (userIds.length > 0) {
    const people = await supabase.from("ConetUsers").select("id, name").in("id", userIds)
    for (const person of people.data || []) names.set(person.id as string, person.name as string)
  }

  return rows.data.map((row) => {
    const parsed = parseGroupPostSubmitMeta((row.content as string) || "")
    const authorId = row.user_id as string
    const authorName = names.get(authorId) || "Student"
    const partsFromComments =
      parsed.meta?.comments
        ?.filter((comment) => comment.quote?.trim() || comment.text.trim())
        .map((comment) => ({
          userId: comment.authorId,
          userName: comment.authorName,
          quote: comment.quote || null,
          commentText: comment.text,
          createdAt: comment.createdAt,
        })) ?? []

    const authoredSections =
      parsed.meta?.authoredSections && parsed.meta.authoredSections.length > 0
        ? parsed.meta.authoredSections
        : extractAuthoredSectionsFromHtml(parsed.html)

    return {
      id: row.id as string,
      noteId: (row.note_id as string | null) ?? null,
      title: (row.title as string) || "Group document",
      html: parsed.html,
      createdAt: row.created_at as string,
      submittedBy: {
        userId: authorId,
        userName: authorName,
      },
      contributorsPresent: parsed.meta?.contributors ?? [],
      annotatedParts: partsFromComments,
      authoredSections,
      submitMeta: parsed.meta,
    }
  })
}

export async function buildTeacherChatExportZip(scope: TeacherExportScope) {
  const auth = await requireTeacher()
  if (!auth.ok) return auth

  const [catalog, board] = await Promise.all([getClassCatalog(), getTeacherBoard()])
  if (!catalog.ok) return { ok: false as const, error: catalog.error }
  if (!board.ok) return { ok: false as const, error: board.error }

  const targets = resolveTargets(scope, catalog, board)
  if (targets.length === 0) {
    return { ok: false as const, error: "Choose at least one class, session, or group to export." }
  }

  const supabase = await createClient()
  const boardGroupById = new Map(board.groups.map((group) => [group.id, group]))
  const exportedAt = new Date().toISOString()
  const allRows: ChatCsvRow[] = []
  const zip = new JSZip()

  for (const target of targets) {
    const live = boardGroupById.get(target.groupId)
    const members =
      live?.members.filter((member) => member.role !== "ai" && member.role !== "teacher").map((member) => ({
        id: member.id,
        name: member.name,
      })) ?? []
    const chatSessions = live?.sessions ?? []
    const mode = aiModeLabel(target.newintervene)
    const groupRows: ChatCsvRow[] = []

    for (const chatSession of chatSessions) {
      const messages = await fetchSessionMessages(supabase, chatSession.id)
      if (!messages) continue
      for (const message of messages) {
        if (isThinkingPlaceholder(message)) continue
        const row = exportChatMessageRow(message, members, mode, messages)
        const csvRow: ChatCsvRow = {
          className: target.className ?? "",
          classSessionTitle: target.classSessionTitle ?? "",
          groupId: target.groupId,
          groupName: target.groupName,
          groupAiMode: mode,
          chatSessionId: chatSession.id,
          chatSessionTitle: chatSession.title,
          messageId: row.id,
          createdAt: row.createdAt,
          authorId: row.authorId,
          authorName: row.authorName,
          authorRole: row.authorRole ?? "",
          isAiMessage: row.isAiMessage ? "true" : "false",
          content: row.content,
          isReply: row.isReply ? "true" : "false",
          replyToMessageId: row.replyToMessageId ?? "",
          replyToAuthorName: row.replyToPreview?.authorName ?? "",
          replyToContent: row.replyToPreview?.content ?? "",
          aiTag: row.aiTag,
          chatAudience: row.chatAudience,
          chatAudienceLabel: row.chatAudienceLabel,
          chatAudienceVia: row.chatAudienceVia ?? "",
          chatTargetUserIds: row.chatTargetUserIds.join(";"),
          chatTargetNames: row.chatTargetNames.join(";"),
        }
        groupRows.push(csvRow)
        allRows.push(csvRow)
      }
    }

    const pathParts = [
      target.className ? slug(target.className) : "ungrouped",
      target.classSessionTitle ? slug(target.classSessionTitle) : "no-session",
      slug(target.groupName),
      "chat.csv",
    ]
    zip.file(pathParts.join("/"), rowsToCsv([...CHAT_CSV_HEADERS], groupRows))
  }

  if (allRows.length > 0) {
    zip.file("all-chat-messages.csv", rowsToCsv([...CHAT_CSV_HEADERS], allRows))
  }

  zip.file(
    "README.txt",
    [
      "Co-net Learn — chat export (CSV)",
      `Exported at: ${exportedAt}`,
      "",
      "Files:",
      "  - all-chat-messages.csv — every message in one sheet",
      "  - <class>/<session>/<group>/chat.csv — messages for one group",
      "",
      "Columns include groupAiMode / aiTag (Nate, Remy, Off), chatAudience (ai, user, group),",
      "and chatAudienceVia (mention, reply, broadcast).",
    ].join("\n")
  )

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  return {
    ok: true as const,
    filename: `conet-chat-export-${exportedAt.slice(0, 10)}.zip`,
    buffer,
  }
}

export async function buildTeacherSubmissionsExportZip(scope: TeacherExportScope) {
  const auth = await requireTeacher()
  if (!auth.ok) return auth

  const [catalog, board] = await Promise.all([getClassCatalog(), getTeacherBoard()])
  if (!catalog.ok) return { ok: false as const, error: catalog.error }
  if (!board.ok) return { ok: false as const, error: board.error }

  const targets = resolveTargets(scope, catalog, board)
  if (targets.length === 0) {
    return { ok: false as const, error: "Choose at least one class, session, or group to export." }
  }

  const exportedAt = new Date().toISOString()
  const zip = new JSZip()
  const allIndividualRows: IndividualNoteCsvRow[] = []
  const allGroupPostRows: GroupPostCsvRow[] = []
  const allPartRows: GroupPostPartCsvRow[] = []
  const allAuthoredSectionRows: GroupPostAuthoredSectionCsvRow[] = []

  for (const target of targets) {
    const [notes, submissions] = await Promise.all([
      listGroupIndividualNotes(target.groupId),
      loadGroupPostSubmissions(target.groupId),
    ])

    const scope = submissionScopeColumns(target)
    const individualRows: IndividualNoteCsvRow[] = []
    for (const note of notes.notes) {
      individualRows.push({
        ...scope,
        userId: note.userId,
        userName: note.name,
        recordType: "draft",
        submissionId: "",
        submittedAt: "",
        submittedPart: "",
        concept1: note.concept1,
        concept2: note.concept2,
      })
      for (const item of note.submissions) {
        individualRows.push({
          ...scope,
          userId: note.userId,
          userName: note.name,
          recordType: "submission",
          submissionId: item.id,
          submittedAt: item.createdAt,
          submittedPart: item.part,
          concept1: item.concept1,
          concept2: item.concept2,
        })
      }
    }
    allIndividualRows.push(...individualRows)

    const groupPostRows: GroupPostCsvRow[] = []
    const partRows: GroupPostPartCsvRow[] = []
    const authoredSectionRows: GroupPostAuthoredSectionCsvRow[] = []
    for (const item of submissions) {
      groupPostRows.push({
        ...scope,
        submissionId: item.id,
        submittedAt: item.createdAt,
        submittedByUserId: item.submittedBy.userId,
        submittedByUserName: item.submittedBy.userName,
        title: item.title,
        noteId: item.noteId ?? "",
        htmlContent: item.html,
        plainTextContent: htmlToPlainText(item.html),
        contributorsPresentNames: item.contributorsPresent.map((person) => person.userName).join(";"),
        contributorsPresentIds: item.contributorsPresent.map((person) => person.userId).join(";"),
      })
      for (const part of item.annotatedParts) {
        partRows.push({
          ...scope,
          submissionId: item.id,
          authorUserId: part.userId,
          authorUserName: part.userName,
          quotedText: part.quote ?? "",
          commentText: part.commentText,
          commentCreatedAt: part.createdAt,
        })
      }
      for (const section of item.authoredSections) {
        authoredSectionRows.push({
          ...scope,
          submissionId: item.id,
          submittedAt: item.createdAt,
          submittedByUserName: item.submittedBy.userName,
          sectionIndex: String(section.sectionIndex),
          authorUserId: section.userId,
          authorUserName: section.userName,
          plainText: section.plainText,
          htmlSnippet: section.html,
        })
      }
    }
    allGroupPostRows.push(...groupPostRows)
    allPartRows.push(...partRows)
    allAuthoredSectionRows.push(...authoredSectionRows)

    const folder = [
      target.className ? slug(target.className) : "ungrouped",
      target.classSessionTitle ? slug(target.classSessionTitle) : "no-session",
      slug(target.groupName),
    ].join("/")

    zip.file(`${folder}/individual-notes.csv`, rowsToCsv([...INDIVIDUAL_NOTE_CSV_HEADERS], individualRows))
    zip.file(`${folder}/group-post-submissions.csv`, rowsToCsv([...GROUP_POST_CSV_HEADERS], groupPostRows))
    if (partRows.length > 0) {
      zip.file(`${folder}/group-post-annotated-parts.csv`, rowsToCsv([...GROUP_POST_PART_CSV_HEADERS], partRows))
    }
    if (authoredSectionRows.length > 0) {
      zip.file(
        `${folder}/group-post-authored-sections.csv`,
        rowsToCsv([...GROUP_POST_AUTHORED_SECTION_CSV_HEADERS], authoredSectionRows)
      )
    }
  }

  if (allIndividualRows.length > 0) {
    zip.file("all-individual-notes.csv", rowsToCsv([...INDIVIDUAL_NOTE_CSV_HEADERS], allIndividualRows))
  }
  if (allGroupPostRows.length > 0) {
    zip.file("all-group-post-submissions.csv", rowsToCsv([...GROUP_POST_CSV_HEADERS], allGroupPostRows))
  }
  if (allPartRows.length > 0) {
    zip.file("all-group-post-annotated-parts.csv", rowsToCsv([...GROUP_POST_PART_CSV_HEADERS], allPartRows))
  }
  if (allAuthoredSectionRows.length > 0) {
    zip.file(
      "all-group-post-authored-sections.csv",
      rowsToCsv([...GROUP_POST_AUTHORED_SECTION_CSV_HEADERS], allAuthoredSectionRows)
    )
  }

  zip.file(
    "README.txt",
    [
      "Co-net Learn — submissions / documentation export (CSV)",
      `Exported at: ${exportedAt}`,
      "",
      "Combined files:",
      "  - all-individual-notes.csv",
      "  - all-group-post-submissions.csv",
      "  - all-group-post-authored-sections.csv — per submit version, who wrote which part",
      "  - all-group-post-annotated-parts.csv (when comment quotes exist)",
      "",
      "Per group folder:",
      "  - individual-notes.csv — draft (recordType=draft) and each submit (recordType=submission)",
      "  - group-post-submissions.csv — each submitted group post version",
      "  - group-post-authored-sections.csv — authorship breakdown for each submit version",
      "  - group-post-annotated-parts.csv — who annotated which quoted excerpt",
    ].join("\n")
  )

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  return {
    ok: true as const,
    filename: `conet-submissions-export-${exportedAt.slice(0, 10)}.zip`,
    buffer,
  }
}
