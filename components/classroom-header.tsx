"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, PenLine, UserCog, Users } from "lucide-react"
import BrandLogo from "@/components/brand-logo"
import PendingLink from "@/components/pending-link"
import LogoutButton from "@/components/logout-button"
import SessionMaterialsButton from "@/components/session-materials-button"
import type { StudentWorkspaceMode } from "@/components/student-workspace"
import { cn } from "@/lib/utils"

const STUDENT_NOTES = [
  "You're doing great.",
  "Keep those ideas coming.",
  "Your group is lucky to have you.",
  "Stay with it.",
]

const TEACHER_NOTES = [
  "The class is in good hands.",
  "Your students can do this.",
  "A calm start makes a good lesson.",
]

function greetingFor(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function initialOf(name: string) {
  const letter = name.trim().charAt(0)
  return letter ? letter.toUpperCase() : "?"
}

export default function ClassroomHeader({
  name,
  role,
  groupName,
  showWorkspaceNav = false,
  showDashboardLink = false,
  onDashboardBack,
  showMaterials = true,
  showAccountsLink = false,
  materialsSessionId,
  workspaceMode = "group-project",
  onWorkspaceModeChange,
}: {
  name: string
  role: "teacher" | "student" | "ai"
  groupName?: string | null
  showWorkspaceNav?: boolean
  showDashboardLink?: boolean
  showAccountsLink?: boolean
  onDashboardBack?: () => void
  showMaterials?: boolean
  materialsSessionId?: string | null
  workspaceMode?: StudentWorkspaceMode
  onWorkspaceModeChange?: (mode: StudentWorkspaceMode) => void
}) {
  const isTeacher = role === "teacher"
  const [hello, setHello] = useState("Hello")
  const [note, setNote] = useState<string | null>(null)
  const [noteId, setNoteId] = useState(0)
  const noteIndex = useRef(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setHello(greetingFor(new Date()))
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  function encourage() {
    const lines = isTeacher ? TEACHER_NOTES : STUDENT_NOTES
    setNote(lines[noteIndex.current % lines.length])
    noteIndex.current += 1
    setNoteId((id) => id + 1)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNote(null), 2200)
  }

  const label = note ?? `${hello}, ${firstName(name)}`

  return (
    <header className="relative z-30 shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden sm:gap-3">
          {showDashboardLink &&
            (onDashboardBack ? (
              <button
                type="button"
                onClick={onDashboardBack}
                className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-2.5 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-px hover:bg-slate-800 active:scale-[0.98] sm:px-3"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition duration-200 group-hover:-translate-x-0.5" />
                <span className="hidden sm:inline">Back</span>
              </button>
            ) : (
              <PendingLink
                href="/dashboard"
                className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-2.5 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-px hover:bg-slate-800 active:scale-[0.98] sm:px-3"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition duration-200 group-hover:-translate-x-0.5" />
                <span className="hidden sm:inline">Back</span>
              </PendingLink>
            ))}
          <BrandLogo priority className="h-11 w-auto shrink-0 transition duration-200 hover:scale-[1.03] sm:h-12" />
          <button
            type="button"
            onClick={encourage}
            title={isTeacher ? "Tap for a note" : "Tap for a cheer"}
            className="group flex h-9 min-w-0 items-center gap-2 overflow-hidden rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-left shadow-sm transition duration-200 hover:-translate-y-px hover:border-slate-300 hover:shadow-md active:scale-[0.99]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white transition duration-200 group-hover:scale-105 group-active:scale-95">
              {initialOf(name)}
            </span>
            <span key={note ? noteId : "hello"} className="truncate text-sm font-semibold text-slate-900 animate-in fade-in duration-300">
              {label}
            </span>
            <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">/</span>
            <span className="hidden shrink-0 text-xs font-medium text-slate-500 sm:inline">
              {isTeacher ? "Teacher" : "Student"}
            </span>
            {groupName && (
              <>
                <span className="hidden shrink-0 text-xs text-slate-300 md:inline">/</span>
                <span className="hidden min-w-0 truncate text-xs font-medium text-slate-500 md:inline">{groupName}</span>
              </>
            )}
          </button>
          {note && (
            <span className="sr-only" role="status">
              {note}
            </span>
          )}
        </div>

        {showWorkspaceNav && onWorkspaceModeChange && (
          <WorkspaceSwitch mode={workspaceMode} onChange={onWorkspaceModeChange} />
        )}

        <div className="flex shrink-0 items-center gap-2">
          {showAccountsLink && (
            <PendingLink
              href="/dashboard/accounts"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:px-3"
            >
              <UserCog className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Accounts</span>
            </PendingLink>
          )}
          {showMaterials && <SessionMaterialsButton role={role} sessionId={materialsSessionId || "current"} />}
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}

function WorkspaceSwitch({
  mode,
  onChange,
}: {
  mode: StudentWorkspaceMode
  onChange: (mode: StudentWorkspaceMode) => void
}) {
  return (
    <nav
      aria-label="Workspace"
      className="relative grid h-9 w-[9.5rem] shrink-0 grid-cols-2 items-center rounded-xl border border-slate-200 bg-slate-50 p-1 md:w-[18.5rem]"
    >
      <span
        aria-hidden
        className={cn(
          "absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-lg bg-neutral-950 shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none",
          mode === "group-project" && "translate-x-full"
        )}
      />
      <SwitchButton
        active={mode === "in-class"}
        label="Individual Note"
        shortLabel="Note"
        icon={<PenLine className="h-3.5 w-3.5" />}
        onClick={() => onChange("in-class")}
      />
      <SwitchButton
        active={mode === "group-project"}
        label="Group Post"
        shortLabel="Post"
        icon={<Users className="h-3.5 w-3.5" />}
        onClick={() => onChange("group-project")}
      />
    </nav>
  )
}

function SwitchButton({
  active,
  label,
  shortLabel,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  shortLabel: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative z-10 inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition duration-200 active:scale-[0.98] sm:px-3",
        active ? "text-white" : "text-slate-600 hover:text-slate-900"
      )}
    >
      <span className={cn("transition duration-200", active && "-rotate-6")}>{icon}</span>
      <span className="md:hidden">{shortLabel}</span>
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}
