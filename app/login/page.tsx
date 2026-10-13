"use client"

import { FormEvent, useEffect, useState, useTransition } from "react"
import BrandLogo from "@/components/brand-logo"
import LoadingScreen from "@/components/loading-screen"
import { signIn } from "@/lib/auth.actions"

const REMEMBER_KEY = "conet-remembered-login"

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"

type SavedLogin = {
  email?: string
  password?: string
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as SavedLogin
        if (typeof saved.email === "string") setEmail(saved.email)
        if (typeof saved.password === "string") setPassword(saved.password)
        setRemember(true)
      }
    } catch {
      window.localStorage.removeItem(REMEMBER_KEY)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!remember) {
      window.localStorage.removeItem(REMEMBER_KEY)
      return
    }
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }))
  }, [ready, remember, email, password])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    startTransition(async () => {
      const result = await signIn(email, password)
      if (result?.error) setError(result.error)
    })
  }

  if (pending) {
    return (
      <LoadingScreen
        label="Signing in"
        message="Checking your account and opening the classroom…"
      />
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div className="conet-page-bg absolute inset-0" />
      <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-sky-200/70 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-emerald-200/60 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="order-2 flex flex-col justify-between gap-8 bg-gradient-to-br from-slate-50 via-white to-sky-50/80 px-8 py-8 sm:px-10 sm:py-10 lg:order-1 lg:border-r lg:border-slate-100">
          <div>
            <BrandLogo priority className="h-auto w-full max-w-[250px]" />
            <p className="mt-6 max-w-sm text-balance text-[1.65rem] font-semibold leading-snug tracking-tight text-slate-900">
              Argue together, then write what the conversation changes.
            </p>
          </div>

          <div className="text-sm leading-relaxed text-slate-500">
            <p className="font-semibold text-slate-800">Networks and AI for Learning (NAIL)</p>
            <p>The University of Hong Kong</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Contact</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>
                Professor Shihui Feng{" "}
                <a
                  href="mailto:shihuife@hku.hk"
                  className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-800"
                >
                  shihuife@hku.hk
                </a>
              </li>
              <li>
                Mr. Yuebo Yang{" "}
                <a
                  href="mailto:yangyuebo@connect.hku.hk"
                  className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-800"
                >
                  yangyuebo@connect.hku.hk
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section className="order-1 flex flex-col justify-center px-8 py-8 sm:px-10 sm:py-10 lg:order-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-slate-500">Enter your email and password to continue.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                placeholder="student@school.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
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
                className={fieldClass}
              />
            </div>

            <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 transition hover:border-slate-300">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Remember my login details</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                  Saves your email and password on this device and fills them in the next time you open this page.
                  {remember ? " Saved on this device." : ""}
                </span>
              </span>
            </label>

            {error && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              Sign in
            </button>
          </form>

          <p className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm leading-relaxed text-slate-600">
            Students and teachers sign in with the email and password your teacher set when creating your account. If you
            are unsure, ask your teacher for your login details.
          </p>
        </section>
      </div>
    </main>
  )
}
