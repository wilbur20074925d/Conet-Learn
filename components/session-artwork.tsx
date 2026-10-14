import Image, { type StaticImageData } from "next/image"
import image01 from "@/components/figure/Food/image_01.png"
import image02 from "@/components/figure/Food/image_02.png"
import image03 from "@/components/figure/Food/image_03.png"
import image04 from "@/components/figure/Food/image_04.png"
import image05 from "@/components/figure/Food/image_05.png"
import image06 from "@/components/figure/Food/image_06.png"
import image07 from "@/components/figure/Food/image_07.png"
import image08 from "@/components/figure/Food/image_08.png"
import image09 from "@/components/figure/Food/image_09.png"

const FOOD_IMAGES: StaticImageData[] = [
  image01,
  image02,
  image03,
  image04,
  image05,
  image06,
  image07,
  image08,
  image09,
]

/** First session uses image 01. After image 09, the next session starts again at image 01. */
export function sessionFoodImage(index: number) {
  const count = FOOD_IMAGES.length
  return FOOD_IMAGES[((index % count) + count) % count]
}

export function artworkIndexes(classes: { sessions: { id: string }[] }[]) {
  const indexes = new Map<string, number>()
  let index = 0
  for (const classroom of classes) {
    for (const session of classroom.sessions) {
      indexes.set(session.id, index)
      index += 1
    }
  }
  return indexes
}

const variantClass = {
  banner: "h-40 sm:h-48",
  side: "",
} as const

const sideWidth = "w-full min-w-0"

const variantBorder = {
  banner: "border-b border-slate-100",
  side: "border-r border-slate-100",
} as const

export default function SessionArtwork({
  index,
  className,
  variant = "banner",
}: {
  index: number
  className?: string
  variant?: keyof typeof variantClass
}) {
  const image = (
    <Image
      src={sessionFoodImage(index)}
      alt=""
      fill
      sizes={variant === "side" ? "(min-width: 1024px) 26rem, (min-width: 768px) 22rem, (min-width: 640px) 18rem, 13rem" : "(min-width: 1152px) 72rem, 100vw"}
      className="object-cover object-[center_46%] transition duration-700 ease-out group-hover/session:scale-[1.035]"
    />
  )

  if (variant === "side") {
    return (
      <div
        className={`flex h-full min-h-[6.5rem] flex-col overflow-hidden bg-slate-100 ${variantBorder.side} ${sideWidth} ${className ?? variantClass.side}`}
      >
        <div className="relative min-h-0 flex-1">{image}</div>
      </div>
    )
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-slate-100 ${variantBorder[variant]} ${className ?? variantClass[variant]}`}
    >
      {image}
    </div>
  )
}
