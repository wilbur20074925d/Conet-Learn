"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Loader2, LogOut } from "lucide-react"
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import LoadingScreen from "@/components/loading-screen"
import stayWithMe from "@/components/figure/do_not_leave_me .png"
import { endBrowserSession } from "@/lib/logout-browser"
import { cn } from "@/lib/utils"

export default function LogoutButton() {
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  function confirmLogout() {
    if (loggingOut) return
    setOpen(false)
    setLoggingOut(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        endBrowserSession()
        window.location.replace("/login")
      })
    })
  }

  return (
    <>
    <Dialog
      open={open && !loggingOut}
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

      {!loggingOut && (
      <DialogPortal>
        <DialogOverlay className="bg-slate-950/25 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(100%-1.5rem,26rem)] -translate-x-1/2 -translate-y-1/2",
            "overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)]",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          <div className="bg-gradient-to-b from-slate-50 via-white to-white px-3 pt-3">
            <Image
              src={stayWithMe}
              alt="Don't leave me. A guinea pig holding onto a shoe."
              priority
              className="h-auto w-full"
            />
          </div>
          <div className="border-t border-slate-100 px-6 pb-6 pt-5 text-center sm:px-7">
            <DialogTitle className="sr-only">Don&apos;t leave me</DialogTitle>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Before you go</p>
            <DialogDescription className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              Your group and notes will still be here. Stay a little longer?
            </DialogDescription>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setOpen(false)}
                className="h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
              >
                I&apos;ll stay
              </button>
              <button
                type="button"
                disabled={loggingOut}
                aria-busy={loggingOut}
                onClick={confirmLogout}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
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
      )}
    </Dialog>
    {loggingOut &&
      createPortal(
        <LoadingScreen
          overlay
          className="z-[100]"
          label="Signing out"
          message="Taking you back to the sign-in page…"
        />,
        document.body,
      )}
    </>
  )
}
