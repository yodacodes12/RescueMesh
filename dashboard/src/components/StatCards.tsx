import type { Stats } from '../types'

function Card({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-3xl font-bold text-navy-800 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export function StatCards({ s }: { s: Stats | null }) {
  const v = (n?: number) => n ?? 0
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Card label="Total requests" value={v(s?.total)} sub={s ? `${s.via_gateway} via mesh gateway · ${s.via_direct} direct` : undefined} accent="bg-navy-800" />
      <Card label="Critical open" value={v(s?.critical_open)} sub="Life-threatening, not closed" accent="bg-rose-600" />
      <Card label="Pending" value={v(s?.pending)} sub="Awaiting acknowledgement" accent="bg-coral-500" />
      <Card label="Assigned" value={v(s?.assigned)} sub="Assigned or in progress" accent="bg-indigo-500" />
      <Card label="Resolved" value={v(s?.resolved)} sub={s?.cancelled ? `${s.cancelled} cancelled` : undefined} accent="bg-emerald-500" />
      <Card label="Volunteers free" value={v(s?.volunteers_available)} sub={s ? `of ${s.volunteers_total} registered` : undefined} accent="bg-brand-500" />
    </div>
  )
}
