"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Users } from "lucide-react"
import { joinGroup } from "@/lib/classroom-actions"
import type { JoinableGroup } from "@/lib/classroom"

export default function JoinGroup({ groups }: { groups: JoinableGroup[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function join(groupId: string) {
    if (pendingId) return
    setPendingId(groupId)
    setError("")
    const result = await joinGroup(groupId)
    if (!result.ok) {
      setError(result.error)
      setPendingId(null)
      return
    }
    router.refresh()
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8">
      <div className="max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Student</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Join a group</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Choose the group your teacher created. After you join, your teacher is the only person who can move you.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="conet-surface mt-8 px-6 py-10 text-center">
          <p className="text-lg font-bold tracking-tight text-slate-900">No groups yet</p>
          <p className="mt-2 text-sm text-slate-500">Your teacher needs to create a group before you can join.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id} className="conet-surface flex flex-col justify-between p-5">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">{group.name}</h2>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {group.memberCount} {group.memberCount === 1 ? "student" : "students"}
                </p>
              </div>
              <button
                type="button"
                disabled={pendingId !== null}
                onClick={() => join(group.id)}
                className="mt-5 h-10 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {pendingId === group.id ? "Joining..." : "Join group"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  )
}
