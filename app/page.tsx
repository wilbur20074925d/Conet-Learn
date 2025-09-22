import { redirect } from "next/navigation"
import ChatPanel from "@/components/chat-panel"
import EditorPanel from "@/components/editor-panel"
import { getMessages, getDocument, submitFinalDocument } from "@/lib/actions"
import { getUserIdFromCookie } from "@/lib/session"
import sql from "@/lib/db"
import { Button } from "@/components/ui/button"
import { logout } from "@/lib/auth.actions"
import { GraduationCap, LogOut, Users, BookOpen, CheckCircle } from "lucide-react"
import SubmitButton from "@/components/submit-button"

export default async function Home() {
  const currentUserId = await getUserIdFromCookie()

  // If no user is "logged in", redirect to the login page
  if (!currentUserId) {
    redirect("/login")
  }

  // Get the user's group info
  const groupInfo = await sql<{ group_id: number; group_name: string }[]>`
    SELECT g.id as group_id, g.name as group_name
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ${currentUserId}
    LIMIT 1;
  `

  if (!groupInfo.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md mx-auto mb-4">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No Group Found</h1>
          <p className="text-gray-600">You are not assigned to any group yet.</p>
        </div>
      </div>
    )
  }

  const groupId = groupInfo[0].group_id
  const groupName = groupInfo[0].group_name

  // Get initial data and current user info
  const [messages, document, currentUser] = await Promise.all([
    getMessages(groupId),
    getDocument(groupId, currentUserId),
    sql<{ id: number; name: string; avatar_url: string }[]>`
      SELECT id, name, avatar_url
      FROM users
      WHERE id = ${currentUserId}
      LIMIT 1;
    `.then(users => users[0])
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 美化的Header - 与chat-panel和editor-panel保持一致 */}
      <header className="border-b bg-white shadow-sm flex-shrink-0 relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/50" />
        
        <div className="relative z-10 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">CCST9076 Course Activity</h1>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <BookOpen className="h-3 w-3" />
                  <span>Collaborative Learning Platform</span>
                  <div className="h-1 w-1 bg-gray-400 rounded-full" />
                  <span className="text-blue-600 font-medium">Active Session</span>
                </div>
              </div>
            </div>
            
            {/* 右侧操作按钮 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-200">
                <Users className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700 font-medium">{groupName}</span>
              </div>
              
              {/* Current User Info */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-200">
                <span className="text-sm text-green-700 font-medium">UID: {currentUserId}</span>
                {currentUser && (
                  <span className="text-sm text-green-600">({currentUser.name})</span>
                )}
              </div>
              
              
              {/* Logout Button */}
              <form action={logout}>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-9 px-4 bg-white border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </form>
            </div>
          </div>
        </div>
        
        {/* 底部装饰线 */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-88px)]">
        {/* Chat Panel */}
        <div className="w-1/2 border-r bg-white">
          <ChatPanel
            initialMessages={messages}
            currentUserId={currentUserId}
            groupId={groupId}
            groupName={groupName}
          />
        </div>

        {/* Editor Panel */}
        <div className="w-1/2 bg-white">
          <EditorPanel
            initialContent={document}
            groupId={groupId}
            currentUser={currentUser}
          />
        </div>
      </div>
    </div>
  )
}
