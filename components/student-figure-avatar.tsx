import Image from "next/image"
import { cn } from "@/lib/utils"
import { studentFigureImage } from "@/lib/student-figure-avatars"

const sizeStyles = {
  sm: { box: "h-6 w-6 ring-2 ring-white", sizes: "24px" },
  md: { box: "h-9 w-9 ring-2 ring-white", sizes: "48px" },
  lg: {
    box: "h-[5.5rem] w-[5.5rem] ring-[3px] ring-white sm:h-24 sm:w-24 sm:ring-4",
    sizes: "96px",
  },
} as const

export function StudentFigureAvatar({
  figureIndex,
  size = "md",
  className,
  title,
  ring = true,
}: {
  figureIndex: number
  size?: keyof typeof sizeStyles
  className?: string
  title?: string
  ring?: boolean
}) {
  const preset = sizeStyles[size]

  return (
    <div
      title={title}
      aria-label={title}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-slate-200",
        ring && preset.box,
        !ring && size === "sm" && "h-6 w-6",
        !ring && size === "md" && "h-9 w-9",
        !ring && size === "lg" && "h-[5.5rem] w-[5.5rem] sm:h-24 sm:w-24",
        className,
      )}
    >
      <Image
        src={studentFigureImage(figureIndex)}
        alt=""
        fill
        sizes={preset.sizes}
        className="object-cover"
      />
    </div>
  )
}
