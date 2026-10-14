"use client"

import { useState } from "react"
import WelcomeModal from "./welcome-modal"

interface ConsentWrapperProps {
  userId: string
  userName?: string | null
}

export default function ConsentWrapper({ userId, userName }: ConsentWrapperProps) {
  const [consentHandled, setConsentHandled] = useState(false)

  const handleConsentGiven = (consent: boolean) => {
    console.log(`User ${userId} consent given:`, consent)
    setConsentHandled(true)
  }

  return (
    <WelcomeModal userId={userId} userName={userName} onConsentGiven={handleConsentGiven} />
  )
}
