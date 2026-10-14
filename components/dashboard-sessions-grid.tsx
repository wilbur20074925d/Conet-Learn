import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Two cards per row; a lone session (or last odd card) is centered at half width. */
export default function DashboardSessionsGrid({
  count,
  className,
  children,
}: {
  count: number
  className?: string
  children: ReactNode
}) {
  if (count === 0) return null

  if (count === 1) {
    return (
      <ul className={cn("mt-4 flex justify-center", className)}>
        <li className="w-full max-w-[calc(50%-0.625rem)] min-w-0">{children}</li>
      </ul>
    )
  }

  return (
    <ul className={cn("mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2", className)}>
      {children}
    </ul>
  )
}

export function DashboardSessionsGridItem({
  index,
  total,
  className,
  children,
}: {
  index: number
  total: number
  className?: string
  children: ReactNode
}) {
  const loneLast = total > 1 && total % 2 === 1 && index === total - 1

  if (loneLast) {
    return (
      <li className={cn("sm:col-span-2 sm:flex sm:justify-center", className)}>
        <div className="w-full min-w-0 sm:max-w-[calc(50%-0.625rem)]">{children}</div>
      </li>
    )
  }

  return <li className={cn("min-w-0", className)}>{children}</li>
}
