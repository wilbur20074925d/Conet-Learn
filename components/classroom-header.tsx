import { Lock, LogOut } from "lucide-react"
import BrandLogo from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { logout } from "@/lib/auth.actions"

const PRE_TEST = "https://docs.google.com/forms/d/e/1FAIpQLSd7K9E5F6Zc9Q-7_D7hUbq9Tw9F0tvBxXO-8p987neg2futgA/viewform?usp=header"
const POST_TEST = "https://docs.google.com/forms/d/e/1FAIpQLSc2ZBYWpaFGkSBQHkdKyLcLLQJrK8ogomjcN185vna6TJEnZg/viewform?usp=publish-editor"

export default function ClassroomHeader({
  name,
  role,
  groupName,
}: {
  name: string
  role: "teacher" | "student" | "ai"
  groupName?: string | null
}) {
  return (
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <BrandLogo priority className="h-16 w-auto" />
          <div>
            <p className="text-xs text-slate-500">
              {name}
              <span className="mx-1.5 text-slate-300">/</span>
              {role === "teacher" ? "Teacher" : "Student"}
              {groupName && (
                <>
                  <span className="mx-1.5 text-slate-300">/</span>
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3 text-slate-400" />
                    {groupName}
                  </span>
                </>
              )}
            </p>
            {role === "student" && groupName && (
              <p className="mt-0.5 text-[11px] text-slate-400">Your teacher is the only person who can move you to another group.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
  )
}
