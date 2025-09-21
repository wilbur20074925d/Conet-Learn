"use client"

import { useEffect, useRef, useState, useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { sendMessage, getMessages, checkAndSendInterventionMessages, type Message } from "@/lib/actions"
import { SendHorizonal, User, Bot, Reply, X, MessageCircle, Sparkles, Users, Brain } from "lucide-react"
import { EmojiPicker } from "@/components/ui/emoji-picker"

interface ChatPanelProps {
  initialMessages: Message[]
  currentUserId: number
  groupId: number
  groupName: string
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button 
      type="submit" 
      size="icon" 
      disabled={pending}
      className="bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <SendHorizonal className="h-4 w-4" />
      <span className="sr-only">Send</span>
    </Button>
  )
}

// 简单的Markdown渲染函数
function renderMarkdown(text: string) {
  // 先处理标题，从最具体的开始
  text = text.replace(/^###\s*(.+)$/gm, '<h3 class="text-sm font-semibold text-blue-700 mt-2 mb-1">$1</h3>')
  text = text.replace(/^##\s*(.+)$/gm, '<h2 class="text-base font-bold text-blue-800 mt-3 mb-2 border-b border-blue-200 pb-1">$1</h2>')
  text = text.replace(/^#\s*(.+)$/gm, '<h1 class="text-lg font-bold text-blue-900 mt-4 mb-3 border-b-2 border-blue-300 pb-2">$1</h1>')
  
  // 然后处理其他格式
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-blue-800">$1</strong>')
  text = text.replace(/\*(.*?)\*/g, '<em class="italic text-blue-700">$1</em>')
  text = text.replace(/`(.*?)`/g, '<code class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
  text = text.replace(/\n/g, '<br>')
  text = text.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc text-blue-700">$1</li>')
  text = text.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal text-blue-700">$1</li>')
  
  return text
}

// 消息内容组件
function MessageContent({ content, isNATE, isCurrentUser }: { content: string; isNATE: boolean; isCurrentUser?: boolean }) {
  // 所有消息都支持markdown渲染
  const markdownContent = renderMarkdown(content)
  
  if (isNATE) {
    return (
      <div 
        className="text-sm break-words overflow-wrap-anywhere [&>h1]:text-purple-900 [&>h2]:text-purple-800 [&>h3]:text-purple-700 [&>strong]:text-purple-900 [&>em]:text-purple-700 [&>code]:bg-purple-200 [&>code]:text-purple-900 [&>ul]:list-disc [&>ol]:list-decimal [&>li]:ml-4 [&>p]:mb-2 [&>h1]:text-lg [&>h1]:font-bold [&>h1]:mb-2 [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mb-1 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-1"
        dangerouslySetInnerHTML={{ __html: markdownContent }}
      />
    )
  }
  
  if (isCurrentUser) {
    return (
      <div 
        className="text-sm leading-relaxed break-words overflow-wrap-anywhere [&>h1]:text-white/90 [&>h2]:text-white/90 [&>h3]:text-white/90 [&>strong]:text-white [&>em]:text-white/90 [&>code]:bg-white/20 [&>code]:text-white [&>ul]:list-disc [&>ol]:list-decimal [&>li]:ml-4 [&>p]:mb-2 [&>h1]:text-lg [&>h1]:font-bold [&>h1]:mb-2 [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mb-1 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-1"
        dangerouslySetInnerHTML={{ __html: markdownContent }}
      />
    )
  }
  
  return (
    <div 
      className="text-sm leading-relaxed break-words overflow-wrap-anywhere [&>h1]:text-gray-800 [&>h2]:text-gray-800 [&>h3]:text-gray-800 [&>strong]:text-gray-900 [&>em]:text-gray-700 [&>code]:bg-gray-100 [&>code]:text-gray-800 [&>ul]:list-disc [&>ol]:list-decimal [&>li]:ml-4 [&>p]:mb-2 [&>h1]:text-lg [&>h1]:font-bold [&>h1]:mb-2 [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mb-1 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mb-1"
      dangerouslySetInnerHTML={{ __html: markdownContent }}
    />
  )
}

export default function ChatPanel({ initialMessages, currentUserId, groupId, groupName }: ChatPanelProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [state, formAction] = useActionState(sendMessage, null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [inputValue, setInputValue] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 轮询获取最新消息
  const pollMessages = async () => {
    try {
      // 首先检查并发送干预消息
      await checkAndSendInterventionMessages()
      
      // 然后获取最新消息
      const latestMessages = await getMessages(groupId)
      setMessages(latestMessages)
    } catch (error) {
      console.error('Error polling messages:', error)
    }
  }

  // 自动滚动到底部的函数
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: "smooth",
      block: "end"
    })
  }

  // 强制滚动到底部（无动画）
  const scrollToBottomInstant = () => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: "auto",
      block: "end"
    })
  }

  useEffect(() => {
    setMessages(initialMessages)
    setTimeout(scrollToBottomInstant, 100)
  }, [initialMessages])

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      setReplyingTo(null)
      setInputValue("")
      
      // 立即获取最新消息
      setTimeout(pollMessages, 200)
      
      setTimeout(scrollToBottom, 100)
    }
  }, [state, groupId])

  // 设置定时轮询 - 这是关键修复
  useEffect(() => {
    const interval = setInterval(pollMessages, 2000) // 每2秒轮询一次
    return () => clearInterval(interval)
  }, [groupId])

  // 监听消息变化，自动滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = setTimeout(() => {
        scrollToBottom()
      }, 50)

      return () => clearTimeout(timeoutId)
    }
  }, [messages.length])

  // 页面可见性变化时也滚动到底部
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && messages.length > 0) {
        setTimeout(scrollToBottom, 100)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [messages.length])

  // Check if message is from NATE
  const isNATE = (userId: number) => userId === 999
  
  // Check if message is NATE's thinking message
  const isNATEThinking = (msg: Message) => isNATE(msg.user_id) && msg.content === "I am thinking..."

  const handleReply = (message: Message) => {
    setReplyingTo(message)
  }

  const cancelReply = () => {
    setReplyingTo(null)
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 美化的Header */}
      <header className="p-4 border-b bg-white shadow-sm flex-shrink-0 relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/50" />
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{groupName}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Users className="h-3 w-3" />
                <span>Group Chat: you can discuss with your group members here</span>
                <div className="h-1 w-1 bg-gray-400 rounded-full" />
                <span className="text-green-600 font-medium">Online</span>
              </div>
            </div>
          </div>
          
          {/* 右侧状态指示器 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-full border border-green-200">
              <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-700 font-medium">NATE Active</span>
            </div>
          </div>
        </div>
        
        {/* 底部装饰线 */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
      </header>

      {/* Messages area - 改进的滚动区域 */}
      <div className="flex-1 min-h-0 max-h-[calc(100vh-200px)] overflow-hidden">
        <ScrollArea className="h-full w-full" ref={scrollAreaRef}>
          <div className="p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`group flex items-start gap-3 w-full ${
                  msg.user_id === currentUserId ? "justify-end" : "justify-start"
                }`}
              >
                {/* 其他用户的消息布局 (左侧) */}
                {msg.user_id !== currentUserId && (
                  <>
                    <div className="flex-shrink-0">
                      {isNATE(msg.user_id) ? (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md relative ring-2 ring-purple-200">
                          <Brain className="h-5 w-5 text-white" />
                          <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center shadow-md">
                          <User className="h-5 w-5 text-white" />
                        </div>
                      )}
                    </div>
                    
                    <div
                      className={`rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow duration-200 min-w-0 flex-1 ${
                        isNATEThinking(msg)
                          ? "bg-gradient-to-br from-yellow-100 to-orange-100 text-orange-900 border-2 border-yellow-300 max-w-[200px] sm:max-w-[240px] md:max-w-[280px] shadow-yellow-100"
                          : isNATE(msg.user_id)
                          ? "bg-gradient-to-br from-purple-100 to-pink-100 text-purple-900 border-2 border-purple-300 max-w-[320px] sm:max-w-[360px] md:max-w-[450px] shadow-purple-100"
                          : "bg-gradient-to-br from-gray-50 to-gray-100 text-gray-800 border border-gray-300 max-w-[280px] sm:max-w-[320px] md:max-w-[400px]"
                      }`}
                    >
                      {/* 显示被回复的消息 */}
                      {msg.original_message && (
                        <div className={`mb-2 p-2 rounded border-l-2 ${
                          isNATE(msg.user_id)
                            ? "bg-purple-200/60 border-purple-400"
                            : "bg-gray-100 border-gray-400"
                        }`}>
                          <p className="text-xs opacity-70 mb-1 font-medium">
                            回复 {msg.original_message.user_name}
                          </p>
                          <p className="text-xs truncate">
                            {msg.original_message.content}
                          </p>
                        </div>
                      )}
                      
                      <div className="min-w-0 break-words">
                        {isNATEThinking(msg) ? (
                          <div className="flex items-center gap-2 text-orange-800">
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-sm font-medium">I am thinking...</span>
                          </div>
                        ) : (
                          <MessageContent content={msg.content} isNATE={isNATE(msg.user_id)} isCurrentUser={false} />
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1">
                          {isNATE(msg.user_id) && !isNATEThinking(msg) && (
                            <Sparkles className="h-3 w-3 text-purple-600 animate-pulse" />
                          )}
                          {isNATEThinking(msg) && (
                            <div className="h-3 w-3 bg-orange-500 rounded-full animate-pulse" />
                          )}
                          <p
                            className={`text-xs font-medium ${
                              isNATEThinking(msg)
                                ? "text-orange-700 font-semibold"
                                : isNATE(msg.user_id)
                                ? "text-purple-700 font-semibold"
                                : "text-gray-600"
                            }`}
                          >
                            {isNATEThinking(msg) ? "🤔 NATE" : isNATE(msg.user_id) ? "🤖 NATE" : msg.name}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 rounded-full"
                          onClick={() => handleReply(msg)}
                        >
                          <Reply className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* 当前用户的消息布局 (右侧) */}
                {msg.user_id === currentUserId && (
                  <>
                    <div className="rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow duration-200 min-w-0 bg-blue-600 text-white max-w-[280px] sm:max-w-[320px] md:max-w-[400px]">
                      {/* 显示被回复的消息 */}
                      {msg.original_message && (
                        <div className="mb-2 p-2 rounded border-l-2 bg-white/20 border-white/40">
                          <p className="text-xs opacity-70 mb-1 font-medium">
                            回复 {msg.original_message.user_name}
                          </p>
                          <p className="text-xs truncate">
                            {msg.original_message.content}
                          </p>
                        </div>
                      )}
                      
                      <div className="min-w-0 break-words">
                        <MessageContent content={msg.content} isNATE={isNATE(msg.user_id)} isCurrentUser={true} />
                      </div>
                      
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-medium text-white/80">
                            {msg.name}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
            {/* 用于自动滚动的隐形元素 */}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        </ScrollArea>
      </div>

      {/* 简约的Footer */}
      <footer className="p-4 border-t bg-white flex-shrink-0">
        {/* 回复提示 */}
        {replyingTo && (
          <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Reply className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">
                回复 {replyingTo.name}: {replyingTo.content.substring(0, 50)}...
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelReply}
              className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        
        <form action={formAction} ref={formRef} className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Input 
              ref={inputRef}
              name="message"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={replyingTo ? `回复 ${replyingTo.name}...` : "Type a message... (Use @NATE to ask the AI)"} 
              autoComplete="off" 
              className="pr-20 bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 rounded-lg shadow-sm hover:shadow-md transition-all duration-200" 
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <EmojiPicker 
                onEmojiSelect={(emoji) => {
                  const cursorPos = inputRef.current?.selectionStart || inputValue.length
                  const newValue = inputValue.slice(0, cursorPos) + emoji + inputValue.slice(cursorPos)
                  setInputValue(newValue)
                  setTimeout(() => {
                    if (inputRef.current) {
                      inputRef.current.focus()
                      inputRef.current.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length)
                    }
                  }, 0)
                }} 
              />
              <MessageCircle className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          <input type="hidden" name="groupId" value={groupId} />
          {replyingTo && (
            <input type="hidden" name="replyTo" value={replyingTo.id} />
          )}
          <SubmitButton />
        </form>
        {state?.error && (
          <p className="text-red-500 text-sm mt-2">
            {state.error}
          </p>
        )}
      </footer>
    </div>
  )
}