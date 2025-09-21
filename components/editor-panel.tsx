"use client"

import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { saveDocumentSnapshot, submitFinalDocument, type DocumentHistory } from "@/lib/actions"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

type SaveStatus = "idle" | "saving" | "saved" | "error"

function SaveStatusIndicator({ status }: { status: SaveStatus }): React.JSX.Element {
  let text = "Saved"
  let colorClass = "text-green-600"
  if (status === "saving") {
    text = "Saving..."
    colorClass = "text-blue-600"
  }
  if (status === "idle") {
    text = "Waiting for input..."
    colorClass = "text-gray-500"
  }
  if (status === "error") {
    text = "Save failed"
    colorClass = "text-red-600"
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${
        status === "saving" ? "bg-blue-400 animate-pulse" : 
        status === "saved" ? "bg-green-400" : 
        status === "error" ? "bg-red-400" : "bg-gray-400"
      }`} />
      <span className={`text-sm font-medium ${colorClass}`}>{text}</span>
    </div>
  )
}

interface EditorPanelProps {
  initialContent: string
  groupId: number
  currentUser?: {
    id: number
    name: string
    avatar_url?: string
  }
}

interface StructuredContent {
  part1_concept1: string
  part1_concept2: string
  proposition_arg1_claim: string
  proposition_arg1_evidence: string
  proposition_arg1_reasoning: string
  proposition_arg2_claim: string
  proposition_arg2_evidence: string
  proposition_arg2_reasoning: string
  opposition_arg1_claim: string
  opposition_arg1_evidence: string
  opposition_arg1_reasoning: string
  opposition_arg2_claim: string
  opposition_arg2_evidence: string
  opposition_arg2_reasoning: string
}

export default function EditorPanel({
  initialContent,
  groupId,
  currentUser
}: EditorPanelProps): React.JSX.Element {
  const [content, setContent] = useState(initialContent)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle")

  // Structured content state
  const [structuredContent, setStructuredContent] = useState<StructuredContent>({
    part1_concept1: "",
    part1_concept2: "",
    proposition_arg1_claim: "",
    proposition_arg1_evidence: "",
    proposition_arg1_reasoning: "",
    proposition_arg2_claim: "",
    proposition_arg2_evidence: "",
    proposition_arg2_reasoning: "",
    opposition_arg1_claim: "",
    opposition_arg1_evidence: "",
    opposition_arg1_reasoning: "",
    opposition_arg2_claim: "",
    opposition_arg2_evidence: "",
    opposition_arg2_reasoning: "",
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 计算单个字段字数
  const calculateFieldWordCount = (text: string): number => {
    const words = text.trim().split(/\s+/).filter(word => word.length > 0)
    return words.length
  }

  // Initialize structured fields from initialContent (JSON or plain text)
  useEffect(() => {
    try {
      const parsed = initialContent ? JSON.parse(initialContent) : null
      if (parsed && typeof parsed === 'object') {
        setStructuredContent((prev: StructuredContent) => ({
          ...prev,
          // keep legacy keys if present
          // fallback: map known fields
          ...(parsed.field1 ? { part1_concept1: parsed.field1 } : {}),
          ...(parsed.field2 ? { part1_concept2: parsed.field2 } : {}
          )
        }))
      } else if (initialContent) {
        setStructuredContent((prev: StructuredContent) => ({ ...prev, part1_concept1: initialContent }))
      }
    } catch {
      if (initialContent) {
        setStructuredContent((prev: StructuredContent) => ({ ...prev, part1_concept1: initialContent }))
      }
    }
  }, [initialContent])


  const debouncedSnapshotSave = (nextContentObj: Record<string, string>) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaveStatus("saving")
      const payload = JSON.stringify({
        field1: nextContentObj.part1_concept1 || "",
        field2: nextContentObj.part1_concept2 || "",
      })
      const result = await saveDocumentSnapshot(payload, groupId)
      setSaveStatus(result?.success ? "saved" : "error")
    }, 800)
  }

  const handleSubmitFinal = async () => {
    setIsSubmitting(true)
    setSubmitStatus("idle")
    
    try {
      const result = await submitFinalDocument(groupId)
      if (result.error) {
        setSubmitStatus("error")
        console.error("Submit failed:", result.error)
      } else {
        setSubmitStatus("success")
        // 可以添加成功提示
        setTimeout(() => setSubmitStatus("idle"), 3000)
      }
    } catch (error) {
      setSubmitStatus("error")
      console.error("Submit failed:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStructuredContentChange = (field: keyof StructuredContent, value: string) => {
    setStructuredContent((prev: StructuredContent) => {
      const next = { ...prev, [field]: value }
      const updatedContent = JSON.stringify(next, null, 2)
      setContent(updatedContent)
      debouncedSnapshotSave(next)
      return next
    })
  }

  const editorComponent = (
    <div className="flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-6">
          {/* Part I: Clarify key concepts */}
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 border-0 bg-gradient-to-br from-blue-50/50 to-indigo-50/30">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                  <FileText className="h-4 w-4 text-white" />
                </div>
                Why user should hold accountability for social media addiction?
              </CardTitle>
            </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">
                    Please collaborate with your partner to write a 300-word article summarizing all claims with your group, along with a clear reasoning process. No evidence is needed.
                    </label>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {calculateFieldWordCount(structuredContent.part1_concept1)} words
                    </span>
                  </div>
                  <Textarea
                    value={structuredContent.part1_concept1}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                      handleStructuredContentChange("part1_concept1", e.target.value)
                    }
                    placeholder="Edit your essay here..."
                    className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
              </div>
            </CardContent>
          </Card>

          {/* Part II: Build arguments */}
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 border-0 bg-gradient-to-br from-purple-50/50 to-pink-50/30">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                Why social media platform should hold accountability for social media addiction?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Please collaborate with your partner to write a 300-word article summarizing all claims with your group, along with a clear reasoning process. No evidence is needed.
                  </label>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {calculateFieldWordCount(structuredContent.part1_concept2)} words
                  </span>
                </div>
                <Textarea
                  value={structuredContent.part1_concept2}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                    handleStructuredContentChange("part1_concept2", e.target.value)
                  }
                  placeholder="Edit your essay here..."
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )

  return (
    <div className="flex flex-col h-full w-full">
      {/* 美化的Header - 与chat-panel保持一致 */}
      <header className="p-4 border-b bg-white shadow-sm flex-shrink-0 relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-50/50 via-pink-50/30 to-rose-50/50" />
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Personal Writing</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Sparkles className="h-3 w-3" />
                <span>Please edit and modify here. After finishing, please click submit.</span>
              </div>
            </div>
          </div>
          
          {/* 右侧状态指示器和操作按钮 */}
          <div className="flex items-center gap-2">
            <SaveStatusIndicator status={saveStatus} />
            
            {/* 提交按钮 */}
            <Button
              onClick={handleSubmitFinal}
              disabled={isSubmitting}
              className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3 w-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : submitStatus === "success" ? (
                <>
                  <div className="h-3 w-3 mr-1 bg-white rounded-full" />
                  Submitted!
                </>
              ) : submitStatus === "error" ? (
                <>
                  <div className="h-3 w-3 mr-1 bg-red-300 rounded-full" />
                  Failed
                </>
              ) : (
                <>
                  <div className="h-3 w-3 mr-1 bg-white rounded-full" />
                  Submit Final
                </>
              )}
            </Button>
            
          </div>
        </div>
        
        {/* 底部装饰线 */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500" />
      </header>

      {editorComponent}
    </div>
  )
}