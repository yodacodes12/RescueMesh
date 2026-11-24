import { useState, type FormEvent } from 'react'
import { api } from '../api'
import type { Volunteer } from '../types'
import { Button, DemoBadge } from './ui'

const STATUS_CLASS = { AVAILABLE: 'text-emerald-700 bg-emerald-50', BUSY: 'text-indigo-700 bg-indigo-50', OFF_DUTY: 'text-slate-500 bg-slate-100' }

export function VolunteerPanel({ volunteers, onChanged }: { volunteers: Volunteer[]; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      await api.createVolunteer({ name, team_name: team || undefined })
      setName('')
      setTeam('')
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-navy-800">Volunteers & rescue teams</div>
      <ul className="divide-y divide-slate-100">
        {volunteers.map(v => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">{v.name}{v.is_demo && <DemoBadge />}</div>
              <div className="truncate text-xs text-slate-500">{v.team_name ?? 'Volunteer'}{v.skills ? ` · ${v.skills}` : ''}{v.active_assignments ? ` · ${v.active_assignments} active` : ''}</div>
            </div>
            <select value={v.status} onChange={e => api.setVolunteerStatus(v.id, e.target.value as Volunteer['status']).then(onChanged).catch(er => setError(er.message))}
              className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${STATUS_CLASS[v.status]}`}>
              <option value="AVAILABLE">Available</option><option value="BUSY">Busy</option><option value="OFF_DUTY">Off duty</option>
            </select>
          </li>
        ))}
        {!volunteers.length && <li className="px-5 py-6 text-center text-sm text-slate-500">No volunteers registered yet.</li>}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="Name" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Team" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <Button type="submit" small>Add</Button>
        {error && <p className="w-full text-xs text-coral-600">{error}</p>}
      </form>
    </div>
  )
}
