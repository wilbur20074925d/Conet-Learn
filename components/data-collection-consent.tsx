"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Shield, Database, Eye, Users, Lock } from "lucide-react"

interface DataCollectionConsentProps {
  userId: number
  onConsentGiven: (consent: boolean) => void
}

export default function DataCollectionConsent({ userId, onConsentGiven }: DataCollectionConsentProps) {
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    // 检查用户是否已经设置过同意状态
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
          if (data.hasConsentRecord === false) {
            // 用户还没有设置过同意状态，显示弹窗
            setShowDialog(true)
          }
        } else {
          // 如果API调用失败，默认显示弹窗
          setShowDialog(true)
        }
      } catch (error) {
        console.error('Error checking consent status:', error)
        // 出错时默认显示弹窗
        setShowDialog(true)
      }
    }

    checkConsentStatus()
  }, [userId])

  const handleSubmit = async () => {
    if (consentGiven === null) return
    
    try {
      const response = await fetch('/api/user-consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          consentGiven,
        }),
      })

      if (response.ok) {
        setShowDialog(false)
        onConsentGiven(consentGiven)
      } else {
        console.error('Failed to save consent status')
      }
    } catch (error) {
      console.error('Error saving consent status:', error)
    }
  }

  if (!showDialog) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border shadow-lg bg-white max-h-[80vh] flex flex-col">
        <CardHeader className="flex-shrink-0 pb-4">
          <CardTitle className="text-2xl font-bold text-center">
            Welcome to the CoNet Learn platform!
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-4">
            {/* Main Consent Text */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-base text-gray-800 leading-relaxed">
                This system is designed to support your collaborative completion of learning tasks with peers and GAI tools, 
                facilitating communication and joint problem solving. During this process, we will collect process data 
                generated from your collaborative learning activities. All data will be anonymized and used solely for 
                scientific research, such as improving instructional design and enhancing teaching quality. Participation 
                is entirely voluntary and will not affect your learning or any related rights in any way. 
              </p>
            </div>

            {/* Form Link */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-700 mb-2">
                    For more information, please refer to the consent form:
                  </p>
                  <a 
                    href="/consent-form" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline text-sm font-medium"
                  >
                    View Detailed Consent Form →
                  </a>
                </div>
              </div>
            </div>

            {/* Consent Options */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Please choose your preference:</h3>
              
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <Checkbox 
                  id="consent-agree" 
                  checked={consentGiven === true}
                  onCheckedChange={(checked) => setConsentGiven(checked ? true : null)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label htmlFor="consent-agree" className="text-sm text-green-800 cursor-pointer font-medium">
                    I agree to data collection
                  </label>
                  <p className="text-xs text-green-600 mt-1">
                    This helps us improve the learning experience
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                <Checkbox 
                  id="consent-disagree" 
                  checked={consentGiven === false}
                  onCheckedChange={(checked) => setConsentGiven(checked ? false : null)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label htmlFor="consent-disagree" className="text-sm text-orange-800 cursor-pointer font-medium">
                    I do not agree to data collection
                  </label>
                  <p className="text-xs text-orange-600 mt-1">
                    You can still use all basic platform features
                  </p>
                </div>
              </div>
            </div>


          </div>
        </CardContent>
        
        {/* Fixed Footer with Button */}
        <div className="flex-shrink-0 px-6 pb-6 pt-4 border-t bg-gray-50">
          <Button 
            onClick={handleSubmit}
            disabled={consentGiven === null}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {consentGiven === null ? 'Please select your preference' : 'I understand and proceed'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
