import Image from "next/image"
import BrandLogo from "@/components/brand-logo"
import guineaPig from "@/components/figure/conetlearn_guinea_pig_loading(1).gif"
import { cn } from "@/lib/utils"

type LoadingScreenProps = {
  label?: string
  message?: string
  overlay?: boolean
  className?: string
}

export default function LoadingScreen({
  label = "Loading",
  message,
  overlay = false,
  className,
}: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex items-center justify-center overflow-hidden px-4 py-8 sm:px-6",
        overlay ? "fixed inset-0 z-[80]" : "relative min-h-dvh",
        className,
      )}
    >
      <div className="conet-page-bg absolute inset-0" />
      <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-sky-200/70 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-emerald-200/60 blur-3xl" />

      <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-white/80 bg-white px-6 py-8 text-center shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)] sm:px-10 sm:py-10">
        <BrandLogo priority className="mx-auto h-auto w-full max-w-[180px]" />

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>

        <Image
          src={guineaPig}
          alt="A guinea pig reading a book. A little learning magic is on its way."
          priority
          className="mx-auto mt-1 h-auto w-full max-w-md"
        />

        {message ? <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{message}</p> : null}

        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-1.5 w-1.5 animate-nate-ellipsis rounded-full bg-slate-900"
              style={{ animationDelay: `${dot * 0.18}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
