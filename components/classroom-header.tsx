"use client"

import { Lock, LogOut } from "lucide-react"
import BrandLogo from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import type { StudentWorkspaceMode } from "@/components/student-workspace"
import { logout } from "@/lib/auth.actions"
import { cn } from "@/lib/utils"

export default function ClassroomHeader({
  name,
  role,
  groupName,
  showWorkspaceNav = false,
  workspaceMode = "group-project",
  onWorkspaceModeChange,
}: {
  name: string
  role: "teacher" | "student" | "ai"
  groupName?: string | null
  showWorkspaceNav?: boolean
  workspaceMode?: StudentWorkspaceMode
  onWorkspaceModeChange?: (mode: StudentWorkspaceMode) => void
}) {
  return (
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <BrandLogo priority className="h-16 w-auto" />
          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              {name}
              <span className="mx-1.5 text-slate-300">/</span>
              {role === "teacher" ? "Teacher" : "Student"}
              {groupName && (
                <>
                  <span className="mx-1.5 text-slate-300">/</span>
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3 text-slate-400" />
                    {groupName}
                  </span>
                </>
              )}
            </p>
            {role === "student" && groupName && (
              <p className="mt-0.5 text-[11px] text-slate-400">
                Your teacher is the only person who can move you to another group.
              </p>
            )}
          </div>

        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showWorkspaceNav && onWorkspaceModeChange && (
            <nav className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => onWorkspaceModeChange("in-class")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  workspaceMode === "in-class"
                    ? "bg-neutral-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                )}
              >
                Individual Note
              </button>
              <button
                type="button"
                onClick={() => onWorkspaceModeChange("group-project")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  workspaceMode === "group-project"
                    ? "bg-neutral-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                )}
              >
                Group Post
              </button>
            </nav>
          )}
          <form action={logout}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-8 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Logout
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
