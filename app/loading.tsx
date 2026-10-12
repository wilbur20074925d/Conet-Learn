export default function Loading() {
  return (
    <main className="conet-page-bg flex min-h-dvh items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
          aria-hidden
        />
        <p className="text-sm font-medium text-slate-600">Loading your classroom…</p>
      </div>
    </main>
  )
}
