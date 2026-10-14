"use client"

import { useEffect, useState } from "react"
import { LayoutGrid, List } from "lucide-react"
import {
  readDashboardLayout,
  writeDashboardLayout,
  type DashboardLayout,
} from "@/lib/dashboard-layout"
import { cn } from "@/lib/utils"

export function useDashboardLayout() {
  const [layout, setLayoutState] = useState<DashboardLayout>("list")

  useEffect(() => {
    setLayoutState(readDashboardLayout())
  }, [])

  function setLayout(next: DashboardLayout) {
    setLayoutState(next)
    writeDashboardLayout(next)
  }

  return { layout, setLayout }
}

export default function DashboardLayoutToggle({
  layout,
  onChange,
  className,
}: {
  layout: DashboardLayout
  onChange: (layout: DashboardLayout) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm",
        className
      )}
      role="group"
      aria-label="Dashboard display"
    >
      <button
        type="button"
        onClick={() => onChange("list")}
        aria-pressed={layout === "list"}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition",
          layout === "list" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
        )}
      >
        <List className="h-3.5 w-3.5" aria-hidden />
        List
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        aria-pressed={layout === "cards"}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition",
          layout === "cards" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
        Cards
      </button>
    </div>
  )
}
