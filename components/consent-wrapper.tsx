"use client"

import { useState } from "react"
import WelcomeModal from "./welcome-modal"

interface ConsentWrapperProps {
  userId: string
}

export default function ConsentWrapper({ userId }: ConsentWrapperProps) {
  const [consentHandled, setConsentHandled] = useState(false)

  const handleConsentGiven = (consent: boolean) => {
    console.log(`User ${userId} consent given:`, consent)
    setConsentHandled(true)
  }

  return (
    <WelcomeModal 
      userId={userId} 
      onConsentGiven={handleConsentGiven}
    />
  )
}
