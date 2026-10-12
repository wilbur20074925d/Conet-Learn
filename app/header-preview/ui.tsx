"use client"

import { useState } from "react"
import ClassroomHeader from "@/components/classroom-header"
import type { StudentWorkspaceMode } from "@/components/student-workspace"

export default function HeaderPreview() {
  const [role, setRole] = useState<"student" | "teacher">("student")
  const [mode, setMode] = useState<StudentWorkspaceMode>("group-project")

  return (
    <div className="conet-page-bg min-h-dvh">
      <ClassroomHeader
        name={role === "student" ? "Alex Chen" : "Mina Wong"}
        role={role}
        groupName="Group Orion"
        showWorkspaceNav={role === "student"}
        showDashboardLink
        showMaterials={false}
        workspaceMode={mode}
        onWorkspaceModeChange={setMode}
      />
      <div className="p-4">
        <button
          type="button"
          onClick={() => setRole((current) => (current === "student" ? "teacher" : "student"))}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Show {role === "student" ? "teacher" : "student"} bar
        </button>
      </div>
    </div>
  )
}
