"use client"

import { Button } from "@/components/ui/button"

interface GroupMember {
  id: string
  name: string
  avatar_url?: string | null
}

export default function InspiredByButton({
  groupMembers,
  onSelect,
}: {
  groupMembers: GroupMember[]
  onSelect: (name: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-[10px] leading-snug text-neutral-500">
        Who did you get this idea from? Tap a name below — we&apos;ll add{" "}
        <span className="font-medium text-neutral-600">(inspired by …)</span> in your note.
      </p>
      <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        Inspired by
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onSelect("NATE")}
        className="h-6 shrink-0 rounded-full border-neutral-950 bg-neutral-950 px-2 text-[11px] font-semibold text-white hover:bg-neutral-800"
      >
        NATE
      </Button>
      {groupMembers.map((member) => (
        <Button
          key={member.id}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(member.name)}
          className="h-6 shrink-0 rounded-full border-neutral-300 bg-white px-2 text-[11px] font-semibold text-neutral-950 hover:bg-neutral-100"
        >
          {member.name}
        </Button>
      ))}
      </div>
    </div>
  )
}
