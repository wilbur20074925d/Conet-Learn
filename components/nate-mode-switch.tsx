"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { updateGroupNewIntervention } from "@/lib/actions"
import { refreshRoute } from "@/lib/refresh-route"

const modes = [
  { id: 1, label: "Nate", hint: "Socratic help, plus one group-regulation move" },
  { id: 2, label: "Remy", hint: "Socratic help for the student who asked" },
] as const

export default function NateModeSwitch({ groupId, mode }: { groupId: string; mode: number }) {
  const router = useRouter()
  const [current, setCurrent] = useState(mode)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setCurrent(mode)
  }, [mode])

  async function choose(next: number) {
    if (next === current || pending) return
    setPending(true)
    try {
      const result = await updateGroupNewIntervention(groupId, next)
      if (result.success) {
        setCurrent(next)
        refreshRoute(router)
      }
    } catch {
      setCurrent(mode)
    }
    setPending(false)
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-1.5"
      title="Students always see this teammate as Remy"
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">AI</span>
      {current !== 1 && current !== 2 && (
        <span className="text-[11px] font-medium text-slate-500">Off</span>
      )}
      <div className="flex rounded-full bg-slate-100 p-0.5">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.hint}
            disabled={pending}
            onClick={() => choose(item.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              current === item.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
