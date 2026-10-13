"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function ChatStickerBubble({
  label,
  src,
  emoji,
  inverted = false,
}: {
  label: string
  src: string
  emoji?: string
  inverted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-1 inline-flex max-w-full flex-col items-start gap-1 rounded-2xl text-left"
        aria-label={`${label} reaction`}
      >
        {failed ? (
          <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 text-3xl">
            {emoji || "✨"}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label}
            className="max-h-36 max-w-44 rounded-2xl bg-white object-contain ring-1 ring-black/5"
            onError={() => setFailed(true)}
          />
        )}
        <span
          className={cn(
            "max-w-[7rem] truncate px-0.5 text-[11px] font-semibold",
            inverted ? "text-white/75" : "text-slate-500"
          )}
        >
          {label}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">{label}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">Reaction GIF</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center bg-slate-50 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="max-h-[min(70vh,420px)] w-full rounded-xl object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
