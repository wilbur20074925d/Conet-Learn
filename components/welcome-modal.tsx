"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GraduationCap, Users, BookOpen, Sparkles } from "lucide-react"

interface WelcomeModalProps {
  userId: string
  onConsentGiven?: (consent: boolean) => void
}

export default function WelcomeModal({ userId, onConsentGiven }: WelcomeModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    
    // Check if user has already set consent status
    const checkConsentStatus = async () => {
      try {
        const response = await fetch('/api/user-consent-status', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.hasConsentRecord === false && isMountedRef.current) {
            // User hasn't set consent status yet, show modal
            setIsOpen(true)
          }
          // If user already set consent, don't show modal at all
        } else {
          // Default to showing modal if API fails
          if (isMountedRef.current) {
            setIsOpen(true)
          }
        }
      } catch (error) {
        console.error('Error checking consent status:', error)
        if (isMountedRef.current) {
          setIsOpen(true)
        }
      }
    }

    const timer = setTimeout(() => {
      checkConsentStatus()
    }, 500)
    
    return () => {
      isMountedRef.current = false
      clearTimeout(timer)
    }
  }, [userId])

  const handleConsentSubmit = async () => {
    try {
      const response = await fetch('/api/user-consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          consentGiven: true,
        }),
      })

      if (response.ok) {
        setIsOpen(false)
        onConsentGiven?.(true)
      } else {
        console.error('Failed to save consent status')
      }
    } catch (error) {
      console.error('Error saving consent status:', error)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex max-h-[80vh] flex-col border border-slate-200 bg-white shadow-xl sm:max-w-lg sm:rounded-[28px]">
        <DialogHeader className="flex-shrink-0 pb-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue to-brand-green shadow-sm">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className="text-center text-2xl font-bold tracking-tight text-slate-900">
            Welcome to{" "}
            <span className="text-brand-blue">CoNet</span>
            <span className="text-brand-green">Learn</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 space-y-6 overflow-y-auto">
          <div className="space-y-4 text-center">
            <div className="space-y-3">
              <p className="text-base leading-relaxed text-slate-600">
                Hello！ Welcome to your collaborative workspace! Here, you and your team can discuss ideas and co-author documents. This space is designed to support your creative process—helping you brainstorm, organize thoughts, and bring your project to life.
              </p>
              <p className="text-base font-semibold leading-relaxed text-slate-800">
                Let&apos;s build something great, together!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 py-2">
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                <Users className="h-6 w-6 text-brand-blue" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Team Chat</p>
            </div>
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                <Sparkles className="h-6 w-6 text-slate-700" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Critical Thinking</p>
            </div>
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
                <BookOpen className="h-6 w-6 text-brand-green" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Co-Author Docs</p>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <h3 className="text-lg font-bold text-slate-900">Terms of Service</h3>
            
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm leading-relaxed text-slate-700">
                By using the CoNetLearn system, you agree to the following terms:
              </p>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-brand-blue">•</span>
                  <span>Your activity and usage data—including interactions with the system and any external links—will be collected solely for academic research.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-brand-blue">•</span>
                  <span>All data will be anonymized prior to analysis and will not be shared with any third parties.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-center border-t border-slate-100 pt-4">
          <Button 
            onClick={handleConsentSubmit}
            className="w-full rounded-xl bg-slate-900 px-8 py-3 font-semibold text-white hover:bg-slate-800"
          >
            I agree and proceed
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
