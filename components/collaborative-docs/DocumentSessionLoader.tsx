"use client"

import { useEffect, useState } from "react"
import { Check, FileText, Loader2, Users } from "lucide-react"

export type LoadStage = "finding" | "opening" | "joining" | "connecting"

const LOAD_STEPS: { id: LoadStage; label: string }[] = [
  { id: "finding", label: "Finding your document" },
  { id: "opening", label: "Opening the session" },
  { id: "joining", label: "Joining collaborators" },
  { id: "connecting", label: "Connecting live sync" },
]

const LOAD_STAGE_PROGRESS: Record<LoadStage, number> = {
  finding: 22,
  opening: 48,
  joining: 74,
  connecting: 92,
}

const LOAD_TIPS = [
  "Your group shares one live document — edits sync as you type.",
  "Teammate cursors appear in real time while you write together.",
  "Use Ctrl/⌘ + click to open links without leaving the doc.",
]

export function DocumentSessionLoader({
  sessionTitle,
  userName,
  stage,
}: {
  sessionTitle: string
  userName: string
  stage: LoadStage
}) {
  const [tipIndex, setTipIndex] = useState(0)
  const activeStepIndex = Math.max(0, LOAD_STEPS.findIndex((step) => step.id === stage))
  const userInitial = (userName.trim()[0] || "U").toUpperCase()

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTipIndex((index) => (index + 1) % LOAD_TIPS.length)
    }, 2800)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 shadow-sm">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-slate-900">{sessionTitle}</p>
            <p className="text-[11px] font-medium tracking-tight text-slate-500">Shared document</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1">
            <div className="h-6 w-6 rounded-full bg-slate-900 text-center text-[10px] font-semibold leading-6 text-white">
              {userInitial}
            </div>
            <Users className="h-3.5 w-3.5 text-slate-500" />
          </div>
        </div>

        <div className="px-4 py-5 sm:px-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Opening your document</h2>
              <p className="mt-0.5 text-sm font-medium tracking-tight text-slate-500">
                Getting {userName || "you"} into {sessionTitle}
              </p>
            </div>
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-700" />
          </div>

          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-500 ease-out"
              style={{ width: `${LOAD_STAGE_PROGRESS[stage]}%` }}
            />
          </div>

          <ol className="space-y-1.5">
            {LOAD_STEPS.map((step, index) => {
              const done = index < activeStepIndex
              const active = index === activeStepIndex
              return (
                <li
                  key={step.id}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                    active ? "bg-slate-50" : ""
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      done
                        ? "bg-slate-900 text-white"
                        : active
                          ? "border border-slate-400 text-slate-700"
                          : "border border-slate-200 text-slate-300"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span
                    className={`text-sm tracking-tight ${
                      active
                        ? "font-semibold text-slate-900"
                        : done
                          ? "font-medium text-slate-600"
                          : "font-medium text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  {active ? (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-slate-900" />
                  ) : null}
                </li>
              )
            })}
          </ol>

          <button
            type="button"
            key={tipIndex}
            onClick={() => setTipIndex((index) => (index + 1) % LOAD_TIPS.length)}
            className="mt-4 w-full border-t border-slate-100 pt-3 text-left text-xs font-medium tracking-tight text-slate-500 transition-colors hover:text-slate-700"
            title="Click for another tip"
          >
            {LOAD_TIPS[tipIndex]}
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {tipIndex + 1}/{LOAD_TIPS.length}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
