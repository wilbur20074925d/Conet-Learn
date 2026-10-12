"use client"

import { useRouter } from "next/navigation"
import TeacherBoard from "@/components/teacher-board"
import { canonicalSession } from "@/lib/canonical-session"
import type { BoardGroup } from "@/lib/classroom"

export default function TeacherManagePanel({
  groups,
  waiting,
}: {
  groups: BoardGroup[]
  waiting: { id: string; name: string }[]
}) {
  const router = useRouter()

  function openGroup(groupId: string) {
    const group = groups.find((item) => item.id === groupId)
    const session = group ? canonicalSession(group.sessions) : null
    const params = new URLSearchParams({ group: groupId, view: "post" })
    if (session) params.set("session", session.id)
    router.push(`/dashboard?${params.toString()}`)
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
      <div className="conet-surface h-[36rem] overflow-hidden">
        <TeacherBoard
          groups={groups}
          waiting={waiting}
          activeGroupId={null}
          onSelectGroup={openGroup}
          onPrefetchGroup={() => {}}
        />
      </div>
    </section>
  )
}
