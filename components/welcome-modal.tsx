"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Users, BookOpen, Sparkles, ShieldCheck, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import welcomeIllustration from "@/components/figure/welcome.png"

const features = [
  {
    icon: Users,
    label: "Team Chat",
    hint: "Discuss ideas with your group in real time.",
  },
  {
    icon: Sparkles,
    label: "Critical Thinking",
    hint: "Structured prompts that sharpen reasoning.",
  },
  {
    icon: BookOpen,
    label: "Co-Author Docs",
    hint: "Write and refine documents together.",
  },
] as const

interface WelcomeModalProps {
  userId: string
  userName?: string | null
  onConsentGiven?: (consent: boolean) => void
}

export default function WelcomeModal({ userId, userName, onConsentGiven }: WelcomeModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)
  const [entered, setEntered] = useState(false)

  // Show on each fresh visit after login (no sessionStorage — remount / new login shows again).
  useEffect(() => {
    if (!userId) return
    setIsOpen(true)
  }, [userId])

  useEffect(() => {
    if (!isOpen) {
      setEntered(false)
      return
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  const handleConsentSubmit = () => {
    if (isSubmitting) return
    setIsSubmitting(true)
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

  const active = features[activeFeature]
  const greeting = userName?.trim() ? `Hi, ${userName.trim().split(/\s+/)[0]}` : "Hello"

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && isSubmitting) return
        setIsOpen(open)
      }}
    >
      <DialogContent
        className={cn(
          "flex h-[min(472px,calc(100dvh-1.25rem))] max-h-[calc(100dvh-1.25rem)] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden border border-neutral-200 bg-white p-0 shadow-[0_28px_70px_-32px_rgba(0,0,0,0.45)] sm:rounded-2xl",
          "[&>button]:z-20 [&>button]:rounded-full [&>button]:border [&>button]:border-neutral-200 [&>button]:bg-white [&>button]:text-neutral-900 [&>button]:shadow-sm [&>button]:transition-transform [&>button]:hover:scale-105",
        )}
      >
        <DialogTitle className="sr-only">Welcome to your collaborative workspace</DialogTitle>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,0.38fr)_minmax(0,0.62fr)] sm:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] sm:grid-rows-1">
          {/* Light visual panel */}
          <section className="relative flex min-h-0 flex-col justify-between overflow-hidden border-b border-neutral-200 bg-gradient-to-br from-neutral-50 via-white to-neutral-100 px-5 py-4 sm:border-b-0 sm:border-r sm:px-6 sm:py-5">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.45]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute left-1/2 top-[42%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-300/80 animate-welcome-ring-pulse"
              aria-hidden
            />

            <p
              className={cn(
                "relative z-10 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500",
                entered && "animate-welcome-fade-up",
              )}
              style={entered ? { animationDelay: "60ms" } : undefined}
            >
              CoNet Learn
            </p>

            <div
              className={cn(
                "relative z-10 flex flex-1 flex-col items-center justify-center py-2",
                entered && "animate-welcome-fade-up",
              )}
              style={entered ? { animationDelay: "120ms" } : undefined}
            >
              <div className={cn("relative w-full max-w-[220px] sm:max-w-[240px]", entered && "animate-welcome-float")}>
                <Image
                  src={welcomeIllustration}
                  alt=""
                  priority
                  className="h-auto w-full grayscale contrast-[1.08] brightness-[1.02]"
                />
              </div>
              <p className="mt-3 max-w-[14rem] text-center text-[11px] font-medium leading-snug text-neutral-600 sm:text-xs">
                Brainstorm, discuss, and co-author — together.
              </p>
            </div>

            <p
              key={activeFeature}
              className={cn(
                "relative z-10 min-h-[2.25rem] text-center text-[11px] leading-snug text-neutral-500 transition-opacity duration-300 sm:text-left",
                entered && "animate-welcome-fade-up",
              )}
              style={entered ? { animationDelay: "180ms" } : undefined}
            >
              {active.hint}
            </p>
          </section>

          {/* Content panel */}
          <section className="flex min-h-0 flex-col overflow-hidden bg-white">
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 px-5 py-3.5 max-[640px]:gap-1.5 max-[640px]:py-3 sm:gap-2.5 sm:px-6 sm:py-4">
              <header
                className={cn("space-y-1", entered && "animate-welcome-fade-up")}
                style={entered ? { animationDelay: "100ms" } : undefined}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{greeting}</p>
                <h2 className="text-balance text-xl font-bold tracking-tight text-neutral-950 sm:text-[1.32rem]">
                  Welcome to your workspace
                </h2>
                <p className="text-pretty text-xs leading-relaxed text-neutral-600 sm:text-[13px]">
                  Discuss ideas and co-author documents with your team in one place.
                </p>
              </header>

              <div
                className={cn("space-y-1.5", entered && "animate-welcome-fade-up")}
                style={entered ? { animationDelay: "160ms" } : undefined}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  What you can do
                </p>
                <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Platform features">
                  {features.map(({ icon: Icon, label }, index) => {
                    const isActive = activeFeature === index
                    return (
                      <button
                        key={label}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveFeature(index)}
                        onFocus={() => setActiveFeature(index)}
                        onClick={() => setActiveFeature(index)}
                        className={cn(
                          "group flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-all duration-200 sm:py-2.5",
                          isActive
                            ? "scale-[1.02] border-neutral-950 bg-neutral-950 text-white shadow-md"
                            : "border-neutral-200 bg-white text-neutral-800 hover:scale-[1.02] hover:border-neutral-400 hover:bg-neutral-50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors sm:h-8 sm:w-8",
                            isActive
                              ? "border-white/25 bg-white/10"
                              : "border-neutral-200 bg-neutral-50 group-hover:border-neutral-400",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="text-[10px] font-semibold leading-tight">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div
                className={cn(
                  "rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 sm:px-3.5 sm:py-3",
                  entered && "animate-welcome-fade-up",
                )}
                style={entered ? { animationDelay: "220ms" } : undefined}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-neutral-900" aria-hidden />
                  <h3 className="text-xs font-bold text-neutral-950 sm:text-sm">Terms of Service</h3>
                </div>
                <ul className="space-y-1 text-[10px] leading-snug text-neutral-600 sm:text-[11px] sm:leading-relaxed">
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-900" aria-hidden />
                    <span>Usage data is collected for academic research only.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-900" aria-hidden />
                    <span>Data is anonymized and not shared with third parties.</span>
                  </li>
                </ul>
              </div>

              <p
                className={cn(
                  "text-[10px] leading-snug text-neutral-500",
                  entered && "animate-welcome-fade-up",
                )}
                style={entered ? { animationDelay: "280ms" } : undefined}
              >
                <span className="font-semibold uppercase tracking-[0.12em] text-neutral-400">Contact </span>
                <a
                  href="mailto:shihuife@hku.hk"
                  className="font-medium text-neutral-800 underline-offset-2 hover:underline"
                >
                  shihuife@hku.hk
                </a>
                <span className="text-neutral-300"> · </span>
                <a
                  href="mailto:yangyuebo@connect.hku.hk"
                  className="font-medium text-neutral-800 underline-offset-2 hover:underline"
                >
                  yangyuebo@connect.hku.hk
                </a>
              </p>
            </div>

            <div
              className={cn(
                "shrink-0 border-t border-neutral-200 bg-white px-5 py-3 sm:px-6 sm:py-3.5",
                entered && "animate-welcome-fade-up",
              )}
              style={entered ? { animationDelay: "340ms" } : undefined}
            >
              <Button
                onClick={handleConsentSubmit}
                disabled={isSubmitting}
                className="group relative h-10 w-full overflow-hidden rounded-xl border border-neutral-950 bg-neutral-950 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-70 sm:h-11"
              >
                <span
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:animate-welcome-shimmer group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
                    backgroundSize: "200% 100%",
                  }}
                  aria-hidden
                />
                <span className="relative flex items-center justify-center gap-2">
                  {isSubmitting ? "Saving…" : "I agree and proceed"}
                  {!isSubmitting && (
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  )}
                </span>
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
