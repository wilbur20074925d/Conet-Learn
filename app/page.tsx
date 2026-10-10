import { redirect } from "next/navigation"
import { BookOpen, LogOut } from "lucide-react"
import ChatPanel from "@/components/chat-panel"
import EditorPanel from "@/components/editor-panel"
import ConsentWrapper from "@/components/consent-wrapper"
import NateModeSwitch from "@/components/nate-mode-switch"
import { getDocument, getMessages, getSessionContext } from "@/lib/actions"
import { logout } from "@/lib/auth.actions"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

const PRE_TEST = "https://docs.google.com/forms/d/e/1FAIpQLSd7K9E5F6Zc9Q-7_D7hUbq9Tw9F0tvBxXO-8p987neg2futgA/viewform?usp=header"
const POST_TEST = "https://docs.google.com/forms/d/e/1FAIpQLSc2ZBYWpaFGkSBQHkdKyLcLLQJrK8ogomjcN185vna6TJEnZg/viewform?usp=publish-editor"

export default async function Home() {
  const session = await getSessionContext()
  if (!session.ok) {
    if (session.error === "Unauthorized") redirect("/login")
    return (
      <main className="conet-page-bg flex min-h-screen items-center justify-center px-6">
        <div className="conet-surface max-w-lg p-8">
          <p className="text-sm font-bold">
            <span className="text-brand-blue">CoNet</span>
            <span className="text-brand-green">Learn</span>
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Almost ready</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">{session.error}</p>
        </div>
      </main>
    )
  }

  const { ctx, members } = session
  const [messages, document] = await Promise.all([
    getMessages(ctx.groupId),
    getDocument(ctx.groupId, ctx.profileId),
  ])
  const peers = members.filter((member) => member.id !== ctx.profileId && member.role !== "ai")

  return (
    <div className="conet-page-bg flex h-dvh flex-col overflow-hidden text-slate-900">
      <ConsentWrapper userId={ctx.profileId} />
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue to-brand-green text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none tracking-tight">
                <span className="text-brand-blue">CoNet</span>
                <span className="text-brand-green">Learn</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {ctx.name}
                <span className="mx-1.5 text-slate-300">/</span>
                {ctx.role === "teacher" ? "Teacher" : "Student"}
                <span className="mx-1.5 text-slate-300">/</span>
                {ctx.groupName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ctx.role === "teacher" && <NateModeSwitch groupId={ctx.groupId} mode={ctx.newintervene} />}
            <a
              href={PRE_TEST}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              Pre test
            </a>
            <a
              href={POST_TEST}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              Post test
            </a>
            <form action={logout}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-2">
        <div className="conet-surface min-h-0 overflow-hidden">
          <ChatPanel
            initialMessages={messages}
            currentUserId={ctx.profileId}
            groupId={ctx.groupId}
            groupName={ctx.groupName}
            currentUserName={ctx.name}
            newintervene={ctx.newintervene}
          />
        </div>
        <div className="conet-surface min-h-0 overflow-hidden">
          <EditorPanel initialContent={document} groupId={ctx.groupId} groupMembers={peers} />
        </div>
      </div>
    </div>
  )
}
