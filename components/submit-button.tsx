"use client"

import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { CheckCircle, Loader2 } from "lucide-react"

export default function SubmitButton() {
  const { pending } = useFormStatus()
  
  return (
    <Button 
      type="submit" 
      size="sm"
      disabled={pending}
      className="h-9 px-4 bg-green-600 hover:bg-green-700 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Submitting...
        </>
      ) : (
        <>
          <CheckCircle className="h-4 w-4 mr-2" />
          Submit Final
        </>
      )}
    </Button>
  )
}
