"use client"

import { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { DoorOpen, Loader2, LogOut } from "lucide-react"
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { endBrowserSession } from "@/lib/logout-browser"
import { cn } from "@/lib/utils"

export default function LogoutButton() {
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  function confirmLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        endBrowserSession()
        window.location.replace("/login")
      })
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (loggingOut) return
        setOpen(next)
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition duration-200 hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:shadow-md active:scale-[0.98]"
      >
        <LogOut className="h-3.5 w-3.5 transition duration-200 group-hover:translate-x-0.5" />
        Logout
      </button>

      <DialogPortal>
        <DialogOverlay className="bg-slate-950/20 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(100%-2rem,20.5rem)] -translate-x-1/2 -translate-y-1/2",
            "overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)]",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          <div className="bg-gradient-to-b from-rose-50 via-white to-white px-6 pb-6 pt-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-rose-100">
              <DoorOpen className="h-6 w-6 text-rose-500" />
            </div>
            <DialogTitle className="mt-4 text-xl font-bold tracking-tight text-slate-900">
              Don&apos;t leave me
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-sm leading-relaxed text-slate-500">
              Your group and notes will still be here. Stay a little longer?
            </DialogDescription>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setOpen(false)}
                className="h-10 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
              >
                I&apos;ll stay
              </button>
              <button
                type="button"
                disabled={loggingOut}
                aria-busy={loggingOut}
                onClick={confirmLogout}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
              >
                {loggingOut ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Logging out…
                  </>
                ) : (
                  "Log out anyway"
                )}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
