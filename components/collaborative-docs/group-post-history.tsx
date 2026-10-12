"use client"

import { useEffect, useState } from "react"
import { listGroupPostSubmissions, type GroupPostSubmission } from "@/lib/group-post-submissions"

export function submittedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function initialOf(name: string) {
  const letter = name.trim().charAt(0)
  return letter ? letter.toUpperCase() : "?"
}

function safeHtml(raw: string) {
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
}

export function SubmissionBody({ html }: { html: string }) {
  if (!html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim()) {
    return <p className="text-sm text-slate-500">Nothing written.</p>
  }
  return (
    <div
      className="text-sm leading-6 text-slate-700 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ol]:my-2 [&_p]:my-1 [&_ul]:my-2"
      dangerouslySetInnerHTML={{ __html: safeHtml(html) }}
    />
  )
}

export function SubmissionCard({
  item,
  indexLabel,
}: {
  item: GroupPostSubmission
  indexLabel: string
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {initialOf(item.authorName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{item.authorName}</p>
            <p className="truncate text-xs text-slate-500">
              {indexLabel} · {submittedAt(item.createdAt)}
            </p>
          </div>
        </div>
      </div>
      {item.title && <p className="mt-3 text-sm font-semibold text-slate-800">{item.title}</p>}
      <div className="mt-2">
        <SubmissionBody html={item.html} />
      </div>
    </article>
  )
}

export function GroupPostBoard({ groupId }: { groupId: string }) {
  const [submissions, setSubmissions] = useState<GroupPostSubmission[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void listGroupPostSubmissions(groupId).then((result) => {
      if (cancelled) return
      setSubmissions(result.submissions)
      setError(result.error || "")
    })
    return () => {
      cancelled = true
    }
  }, [groupId])

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Submissions</p>
          <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-900">This group</h3>
        </div>
        <p className="text-xs font-medium text-slate-500">
          {submissions.length} {submissions.length === 1 ? "submission" : "submissions"}
        </p>
      </div>
      {error ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">{error}</p>
      ) : submissions.length === 0 ? (
        <p className="mt-3 px-1 text-sm text-slate-500">No submissions yet. They appear here after a student submits the group post.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {submissions.map((item, index) => (
            <li key={item.id}>
              <SubmissionCard item={item} indexLabel={`Submission ${submissions.length - index}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
