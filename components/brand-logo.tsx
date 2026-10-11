import Image from "next/image"
import logo from "@/components/figure/conet-learn.png"

type BrandLogoProps = {
  className?: string
  priority?: boolean
}

export default function BrandLogo({ className = "h-auto w-full", priority = false }: BrandLogoProps) {
  return <Image src={logo} alt="ConetLearn" priority={priority} className={className} />
}
