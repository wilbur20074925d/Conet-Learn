"use client"

import { useState } from "react"
import DataCollectionConsent from "./data-collection-consent"

interface ConsentWrapperProps {
  userId: number
}

export default function ConsentWrapper({ userId }: ConsentWrapperProps) {
  const [consentHandled, setConsentHandled] = useState(false)

  const handleConsentGiven = (consent: boolean) => {
    console.log(`User ${userId} consent given:`, consent)
    setConsentHandled(true)
  }

  return (
    <DataCollectionConsent 
      userId={userId} 
      onConsentGiven={handleConsentGiven}
    />
  )
}
