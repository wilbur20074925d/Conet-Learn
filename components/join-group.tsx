export default function StudentAwaitingGroup() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8">
      <div className="max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Student</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Waiting for your teacher</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Your teacher places you in one class. Inside that class you can be in more than one session, and in one group for each session.
        </p>
      </div>
      <div className="conet-surface mt-8 px-6 py-10 text-center">
        <p className="text-lg font-bold tracking-tight text-slate-900">No group yet</p>
        <p className="mt-2 text-sm text-slate-500">You will see your class here after your teacher places you in it.</p>
      </div>
    </div>
  )
}
