"use client"

import { useFormStatus } from "react-dom"
import { useSearchParams } from "next/navigation"
import { login } from "@/lib/auth.actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GraduationCap, Users, BookOpen, Sparkles } from "lucide-react"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button 
      type="submit" 
      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]" 
      disabled={pending}
    >
      {pending ? (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span>Logging in...</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>Enter Learning Space</span>
        </div>
      )}
    </Button>
  )
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-200/30 to-indigo-200/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-cyan-200/20 to-blue-200/20 rounded-full blur-3xl"></div>
      </div>

      {/* Floating icons */}
      <div className="absolute top-20 left-20 text-blue-300/40 animate-bounce" style={{ animationDelay: '0s' }}>
        <BookOpen className="w-8 h-8" />
      </div>
      <div className="absolute top-32 right-32 text-indigo-300/40 animate-bounce" style={{ animationDelay: '1s' }}>
        <Users className="w-6 h-6" />
      </div>
      <div className="absolute bottom-32 left-32 text-purple-300/40 animate-bounce" style={{ animationDelay: '2s' }}>
        <GraduationCap className="w-7 h-7" />
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-8 pt-8">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              CoNetLearn
            </CardTitle>
            <CardDescription className="text-gray-600 text-lg mt-2">
              Welcome to your learning space!
            </CardDescription>
          </CardHeader>
          
          <CardContent className="px-8 pb-8">
            <form action={login} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="studentId" className="text-gray-700 font-semibold text-sm">
                  Student ID
                </Label>
                <div className="relative">
                  <Input 
                    id="studentId" 
                    name="studentId" 
                    type="number" 
                    placeholder="Enter your student ID" 
                    required 
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 bg-gray-50/50 hover:bg-white"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm">#</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-700 font-semibold text-sm">
                  Full Name
                </Label>
                <Input 
                  id="name" 
                  name="name" 
                  type="text" 
                  placeholder="Enter your full name" 
                  required 
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-300 bg-gray-50/50 hover:bg-white"
                />
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                </div>
              )}
              
              <SubmitButton />
            </form>
            
            {/* Additional info */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Join your group and start collaborating on your debate preparation
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
