import Image from "next/image"
import { studentFigureImage } from "@/lib/student-figure-avatars"

export function StudentFigureAvatar({
  figureIndex,
  className = "h-9 w-9",
  title,
}: {
  figureIndex: number
  className?: string
  title?: string
}) {
  return (
    <div
      title={title}
      aria-label={title}
      className={`relative shrink-0 overflow-hidden rounded-full bg-slate-200 ${className}`}
    >
      <Image
        src={studentFigureImage(figureIndex)}
        alt=""
        fill
        sizes="48px"
        className="object-cover"
      />
    </div>
  )
}
