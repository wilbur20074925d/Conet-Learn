"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { BookOpen } from "lucide-react"
import { createClient } from "@/lib/supabase/browser"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    const supabase = createClient()
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) {
      const message = result.error.message.toLowerCase()
      setError(
        message.includes("confirm")
          ? "This email still needs to be confirmed in Supabase before it can sign in."
          : "Wrong email or password. Please try again."
      )
      setPending(false)
      return
    }
    router.push("/")
    router.refresh()
  }

  return (
    <main className="conet-page-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_20px_50px_-24px_rgba(15,23,42,0.25)]">
        <div className="border-b border-slate-100 px-8 py-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue to-brand-green text-white shadow-sm">
            <BookOpen className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold tracking-tight">
            <span className="text-brand-blue">CoNet</span>
            <span className="text-brand-green">Learn</span>
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-slate-500">Enter your email and password to continue</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-8 py-7">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              placeholder="your.email@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          {error && (
            <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="mt-2 h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="border-t border-slate-100 px-8 py-5 text-center text-[11px] leading-relaxed text-slate-400">
          <p>Argue together. Write what the conversation changes.</p>
          <p className="mt-1">Use the email and password given for your role.</p>
        </div>
      </div>
    </main>
  )
}
