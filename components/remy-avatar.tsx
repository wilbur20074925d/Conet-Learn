import Image from "next/image"
import remyFigure from "@/components/figure/Remy.png"

export function RemyAvatar({
  className = "h-8 w-8",
  title = "Remy",
}: {
  className?: string
  title?: string
}) {
  return (
    <div
      title={title}
      aria-label={title}
      className={`relative shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 ${className}`}
    >
      <Image src={remyFigure} alt="" fill sizes="48px" className="object-cover" />
    </div>
  )
}
