"use client"

import { useState } from "react"
import DataCollectionConsent from "@/components/data-collection-consent"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function TestConsentPage() {
  const [showConsent, setShowConsent] = useState(false)
  const [consentResult, setConsentResult] = useState<string | null>(null)

  const handleConsentGiven = (consent: boolean) => {
    setConsentResult(consent ? "用户同意收集数据" : "用户不同意收集数据")
    setShowConsent(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">
              数据收集同意功能测试
            </CardTitle>
            <CardDescription className="text-center">
              测试数据收集同意弹窗的功能
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <Button 
                onClick={() => setShowConsent(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
              >
                显示同意弹窗
              </Button>
            </div>

            {consentResult && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">测试结果：</h3>
                <p className="text-green-700">{consentResult}</p>
                <Button 
                  onClick={() => setConsentResult(null)}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  清除结果
                </Button>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">功能说明：</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• 点击"显示同意弹窗"按钮来测试弹窗功能</li>
                <li>• 弹窗会显示详细的数据收集说明</li>
                <li>• 用户可以选择同意或不同意</li>
                <li>• 选择后会显示测试结果</li>
                <li>• 在实际应用中，这个弹窗会在用户首次登录时自动显示</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">测试要点：</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• 检查弹窗是否正常显示和关闭</li>
                <li>• 验证同意和不同意的选择功能</li>
                <li>• 确认按钮状态是否正确（未选择时禁用）</li>
                <li>• 测试响应式设计在不同屏幕尺寸下的表现</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {showConsent && (
        <DataCollectionConsent 
          userId={999} 
          onConsentGiven={handleConsentGiven}
        />
      )}
    </div>
  )
}
