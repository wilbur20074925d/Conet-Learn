"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Users, BookOpen, Sparkles, ShieldCheck } from "lucide-react"
import welcomeIllustration from "@/components/figure/welcome.png"

const welcomeDismissedKey = (userId: string) => `conet-welcome-dismissed:${userId}`

const features = [
  {
    icon: Users,
    label: "Team Chat",
    className: "bg-sky-50 text-sky-700 ring-sky-100",
  },
  {
    icon: Sparkles,
    label: "Critical Thinking",
    className: "bg-violet-50 text-violet-700 ring-violet-100",
  },
  {
    icon: BookOpen,
    label: "Co-Author Docs",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
] as const

interface WelcomeModalProps {
  userId: string
  onConsentGiven?: (consent: boolean) => void
}

export default function WelcomeModal({ userId, onConsentGiven }: WelcomeModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!userId) return
    const dismissed = sessionStorage.getItem(welcomeDismissedKey(userId))
    if (!dismissed) {
      setIsOpen(true)
    }
  }, [userId])

  const handleConsentSubmit = () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    sessionStorage.setItem(welcomeDismissedKey(userId), "1")
    setIsOpen(false)
    onConsentGiven?.(true)

    void fetch("/api/user-consent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        consentGiven: true,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error("Failed to save consent status")
        }
      })
      .catch((error) => {
        console.error("Error saving consent status:", error)
      })
      .finally(() => {
        setIsSubmitting(false)
      })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && isSubmitting) return
        setIsOpen(open)
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden border-white/80 bg-white p-0 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.5)] sm:rounded-[32px] [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-white/90 [&>button]:shadow-sm [&>button]:ring-1 [&>button]:ring-slate-200/80">
        <DialogTitle className="sr-only">Welcome to your collaborative workspace</DialogTitle>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="relative flex flex-col justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/90 px-6 py-7 sm:px-8 sm:py-8 lg:border-r lg:border-slate-100">
            <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-sky-200/50 blur-3xl" />
            <div className="pointer-events-none absolute -right-10 bottom-0 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl" />

            <div className="relative z-10 flex flex-col justify-center">
              <Image
                src={welcomeIllustration}
                alt="Welcome illustration — a friendly character at a desk ready to collaborate"
                priority
                className="mx-auto h-auto w-full max-w-[320px] drop-shadow-sm sm:max-w-[360px]"
              />
              <p className="mx-auto mt-4 max-w-xs text-center text-sm font-medium leading-relaxed text-slate-600">
                Brainstorm, discuss, and co-author — all in one place.
              </p>
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600">CoNet Learn</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem]">
                  Hello! Welcome to your workspace
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                  Here, you and your team can discuss ideas and co-author documents. This space supports your creative
                  process—helping you brainstorm, organize thoughts, and bring your project to life.
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-800">Let&apos;s build something great, together!</p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {features.map(({ icon: Icon, label, className }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm sm:px-3 sm:py-4"
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset sm:h-11 sm:w-11 ${className}`}
                    >
                      <Icon className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={2} />
                    </div>
                    <p className="text-[11px] font-semibold leading-tight text-slate-700 sm:text-xs">{label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-sky-600" aria-hidden />
                  <h3 className="text-base font-bold text-slate-900">Terms of Service</h3>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  By using the CoNetLearn system, you agree to the following terms:
                </p>
                <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
                  <li className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
                    <span>
                      Your activity and usage data—including interactions with the system and any external links—will
                      be collected solely for academic research.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
                    <span>
                      All data will be anonymized prior to analysis and will not be shared with any third parties.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="text-sm leading-relaxed text-slate-500">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Contact</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  <li>
                    Professor Shihui Feng{" "}
                    <a
                      href="mailto:shihuife@hku.hk"
                      className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-800"
                    >
                      shihuife@hku.hk
                    </a>
                  </li>
                  <li>
                    Mr. Yuebo Yang{" "}
                    <a
                      href="mailto:yangyuebo@connect.hku.hk"
                      className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-800"
                    >
                      yangyuebo@connect.hku.hk
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4 sm:px-8 sm:py-5">
              <Button
                onClick={handleConsentSubmit}
                disabled={isSubmitting}
                className="h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-70"
              >
                I agree and proceed
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
