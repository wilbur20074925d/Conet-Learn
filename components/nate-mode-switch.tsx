"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { updateGroupNewIntervention } from "@/lib/actions"
import { refreshRoute } from "@/lib/refresh-route"
import { cn } from "@/lib/utils"

const modes = [
  { id: 1, label: "Nate", hint: "Socratic help, plus one group-regulation move" },
  { id: 2, label: "Remy", hint: "Socratic help for the student who asked" },
] as const

export default function NateModeSwitch({
  groupId,
  mode,
  compact = false,
}: {
  groupId: string
  mode: number
  compact?: boolean
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(mode)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setCurrent(mode)
  }, [mode])

  const activeIndex = current === 2 ? 1 : 0
  const activeMode = modes.find((item) => item.id === current) ?? modes[0]

  async function choose(next: number) {
    if (next === current || pending) return
    const previous = current
    setCurrent(next)
    setPending(true)
    try {
      const result = await updateGroupNewIntervention(groupId, next)
      if (result.success) {
        refreshRoute(router)
      } else {
        setCurrent(previous)
      }
    } catch {
      setCurrent(previous)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full" title="Students always see this teammate as Remy">
      <div className={cn("flex items-center justify-between gap-2", compact ? "mb-1" : "mb-2")}>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">AI</span>
        {current !== 1 && current !== 2 && (
          <span className="text-[10px] font-medium text-neutral-400">Off</span>
        )}
      </div>

      <div
        className={cn(
          "relative grid w-full grid-cols-2 rounded-lg bg-neutral-100 p-0.5",
          compact ? "rounded-md" : "rounded-xl p-1",
          pending && "opacity-90",
        )}
        role="tablist"
        aria-label="AI teammate mode"
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-0.5 top-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-neutral-950 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            !compact && "bottom-1 top-1 left-1 w-[calc(50%-0.25rem)] rounded-lg",
          )}
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {modes.map((item) => {
          const selected = current === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={item.hint}
              disabled={pending}
              onClick={() => choose(item.id)}
              className={cn(
                "relative z-10 rounded-md px-2 font-semibold transition-colors duration-200",
                compact ? "min-h-7 py-1 text-[11px]" : "min-h-9 rounded-lg py-1.5 text-xs",
                selected ? "text-white" : "text-neutral-600 hover:text-neutral-900",
                pending && !selected && "pointer-events-none",
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {!compact && (
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">{activeMode.hint}</p>
      )}
    </div>
  )
}
