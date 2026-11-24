import { useCallback, useEffect, useState } from 'react'
import { api, clearToken, getToken, setUnauthorizedHandler } from './api'
import { LoginPage } from './components/LoginPage'
import { SOSDetailPanel } from './components/SOSDetailPanel'
import { SOSMap } from './components/SOSMap'
import { SOSTable } from './components/SOSTable'
import { StatCards } from './components/StatCards'
import { VolunteerPanel } from './components/VolunteerPanel'
import { Logo } from './components/ui'
import type { Priority, SOS, Stats, User, Volunteer } from './types'

const POLL_MS = 5000

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [rows, setRows] = useState<SOS[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [openOnly, setOpenOnly] = useState(true)
  const [showSim, setShowSim] = useState(true)
  const [priority, setPriority] = useState<Priority | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => setUnauthorizedHandler(() => setAuthed(false)), [])

  const refresh = useCallback(async () => {
    try {
      const [s, r, v] = await Promise.all([
        api.stats(),
        api.listSOS({ open_only: openOnly, include_simulated: showSim, priority }),
        api.volunteers(),
      ])
      setStats(s)
      setRows(r)
      setVolunteers(v)
      setError(null)
      setUpdatedAt(new Date())
    } catch (e) {
      setError((e as Error).message)
    }
  }, [openOnly, showSim, priority])

  useEffect(() => {
    if (!authed) return
    api.me().then(setUser).catch(() => {})
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [authed, refresh])

  if (!authed) return <LoginPage onLoggedIn={() => setAuthed(true)} />

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-4 bg-navy-800 px-6 py-3 text-white shadow">
        <div className="flex items-center gap-3">
          <Logo size={38} />
          <div>
            <div className="text-lg font-bold leading-tight">RescueMesh</div>
            <div className="text-xs text-blue-200">Rescue Coordination Dashboard</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden items-center gap-2 text-blue-200 sm:flex">
            <span className={`h-2 w-2 rounded-full ${error ? 'bg-coral-500' : 'animate-pulse bg-emerald-400'}`} />
            {error ? 'Connection problem' : `Live · updated ${updatedAt ? updatedAt.toLocaleTimeString() : '…'}`}
          </span>
          {user && <span className="hidden md:inline">{user.full_name} <span className="text-blue-300">({user.role.toLowerCase()})</span></span>}
          <button onClick={() => { clearToken(); setAuthed(false) }} className="rounded-lg px-3 py-1.5 ring-1 ring-white/30 hover:bg-white/10">Sign out</button>
        </div>
      </header>

      {error && <div className="bg-coral-50 px-6 py-2 text-sm text-coral-600">{error}</div>}

      <main className="flex-1 space-y-4 p-4 md:p-6">
        <StatCards s={stats} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="h-[460px]"><SOSMap sos={rows} volunteers={volunteers} selected={selected} onSelect={setSelected} /></div>
          <aside className="h-[460px] overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {selected ? (
              <SOSDetailPanel key={selected} id={selected} volunteers={volunteers} onChanged={refresh} onClose={() => setSelected(null)} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <Logo size={56} />
                <p className="mt-4 font-semibold text-navy-800">Select an emergency request</p>
                <p className="mt-1 text-sm text-slate-500">Click a marker or a table row to see details, relay path and actions.</p>
              </div>
            )}
          </aside>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-navy-800">Emergency requests <span className="font-normal text-slate-400">({rows.length}, highest priority first)</span></h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <select value={priority} onChange={e => setPriority(e.target.value as Priority | '')} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                  <option value="">All priorities</option>
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p}>{p}</option>)}
                </select>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} />Open only</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSim} onChange={e => setShowSim(e.target.checked)} />Show simulated</label>
              </div>
            </div>
            <SOSTable rows={rows} selected={selected} onSelect={setSelected} />
            <p className="mt-2 text-xs text-slate-500">
              <b>Delivery</b> = communication status (did the message reach the server / was it seen).
              {' '}<b>Rescue</b> = operation status on the ground. They are tracked separately.
            </p>
          </section>
          <VolunteerPanel volunteers={volunteers} onChanged={refresh} />
        </div>
      </main>
    </div>
  )
}
