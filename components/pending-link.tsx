"use client"

import Link from "next/link"
import { useLinkStatus } from "next/link"
import type { ReactNode } from "react"

export default function PendingLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <Link href={href} prefetch className={className}>
      <PendingLabel>{children}</PendingLabel>
    </Link>
  )
}

function PendingLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus()
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {pending && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </span>
  )
}
