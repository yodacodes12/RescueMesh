import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AssignmentStatus, Priority, RescueStatus, SOSDetail, Volunteer } from '../types'
import {
  ASSIGNMENT_LABEL, Button, DeliveryBadge, PriorityBadge, RescueBadge, SimBadge, TYPE_ICON, TYPE_LABEL, ViaBadge,
  fmtCoord, fmtTime, shortId, timeAgo,
} from './ui'

const TRANSPORT_LABEL = { LOCAL: 'Created', NEARBY: 'Nearby radio', SIMULATED: 'Simulated radio', INTERNET: 'Internet upload' }
const NEXT_ASSIGNMENT: Partial<Record<AssignmentStatus, AssignmentStatus[]>> = {
  ASSIGNED: ['EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED'],
  EN_ROUTE: ['ON_SITE', 'COMPLETED', 'CANCELLED'],
  ON_SITE: ['COMPLETED', 'CANCELLED'],
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

export function SOSDetailPanel({ id, volunteers, onChanged, onClose }: {
  id: string; volunteers: Volunteer[]; onChanged: () => void; onClose: () => void
}) {
  const [d, setD] = useState<SOSDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [volunteerId, setVolunteerId] = useState<number | ''>('')

  useEffect(() => {
    let alive = true
    const load = () => api.getSOS(id).then(x => alive && setD(x)).catch(e => alive && setError(e.message))
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [id])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setD(await api.getSOS(id))
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!d) {
    return <div className="p-6 text-sm text-slate-500">{error ?? 'Loading…'}</div>
  }
  const closed = d.rescue_status === 'RESOLVED' || d.rescue_status === 'CANCELLED'
  const active = d.assignments.filter(a => ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'].includes(a.status))
  const free = volunteers.filter(v => v.status !== 'OFF_DUTY' && !active.some(a => a.volunteer_id === v.id))
  const setStatus = (s: RescueStatus) => act(() => api.setStatus(id, s))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 bg-navy-800 px-5 py-4 text-white">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold">{TYPE_ICON[d.emergency_type]} {TYPE_LABEL[d.emergency_type]}
            {d.people_affected ? <span className="text-sm font-normal text-blue-200">· {d.people_affected} people</span> : null}</div>
          <div className="mt-0.5 font-mono text-xs text-blue-200" title={d.message_id}>ID {shortId(d.message_id)} · {d.message_id}</div>
        </div>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-blue-200 hover:bg-white/10 hover:text-white" aria-label="Close">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          <PriorityBadge p={d.priority} /><RescueBadge s={d.rescue_status} /><DeliveryBadge s={d.delivery_status} />
          <ViaBadge via={d.received_via} hops={d.hop_count} />{d.is_simulated && <SimBadge />}
        </div>
        {error && <div className="mx-5 mt-3 rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{error}</div>}

        <Section title="Emergency description">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{d.description || <i className="text-slate-400">No description provided</i>}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-slate-500">GPS location</dt>
            <dd className="font-mono">{fmtCoord(d.latitude, d.longitude)}{d.location_accuracy_m ? ` (±${Math.round(d.location_accuracy_m)} m)` : ''}
              {d.latitude !== null && <a className="ml-1 text-brand-500 hover:underline" target="_blank" rel="noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=17/${d.latitude}/${d.longitude}`}>open map ↗</a>}</dd>
            <dt className="text-slate-500">Sender</dt><dd>{d.sender_name ?? '—'} <span className="font-mono text-slate-400">{d.sender_id.slice(0, 14)}</span></dd>
            <dt className="text-slate-500">Created on phone</dt><dd>{fmtTime(d.created_at)} ({timeAgo(d.created_at)})</dd>
            <dt className="text-slate-500">Received by server</dt><dd>{fmtTime(d.received_at)}</dd>
            <dt className="text-slate-500">Expires</dt><dd>{fmtTime(d.expiry_at)}</dd>
            <dt className="text-slate-500">Duplicate receipts</dt><dd>{d.duplicate_receipts} <span className="text-slate-400">(merged, not new records)</span></dd>
          </dl>
        </Section>

        <Section title="Priority review">
          <div className="flex items-center gap-2">
            <select value={d.priority} disabled={busy}
              onChange={e => act(() => api.setPriority(id, e.target.value as Priority))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(p => <option key={p}>{p}</option>)}
            </select>
            <span className="text-xs text-slate-500">Sender chose <b>{d.original_priority}</b> · score {d.priority_score}</span>
          </div>
        </Section>

        <Section title="Actions">
          <div className="flex flex-wrap gap-2">
            {d.delivery_status !== 'COORDINATOR_ACKNOWLEDGED' && <Button variant="danger" disabled={busy} onClick={() => act(() => api.acknowledge(id))}>Acknowledge</Button>}
            {!closed && <Button variant="success" disabled={busy} onClick={() => setStatus('RESOLVED')}>Mark resolved</Button>}
            {!closed && <Button variant="ghost" disabled={busy} onClick={() => setStatus('CANCELLED')}>Cancel (false alarm)</Button>}
            {closed && <Button variant="ghost" disabled={busy} onClick={() => setStatus('ACKNOWLEDGED')}>Re-open</Button>}
          </div>
          {!closed && (
            <div className="mt-3 flex items-center gap-2">
              <select value={volunteerId} onChange={e => setVolunteerId(e.target.value ? Number(e.target.value) : '')}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Assign volunteer / team…</option>
                {free.map(v => <option key={v.id} value={v.id}>{v.name} — {v.team_name ?? 'Volunteer'} ({v.status.toLowerCase()}{v.is_demo ? ', demo' : ''})</option>)}
              </select>
              <Button disabled={busy || volunteerId === ''} onClick={() => act(async () => { await api.assign(id, Number(volunteerId)); setVolunteerId('') })}>Assign</Button>
            </div>
          )}
          {active.map(a => (
            <div key={a.id} className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-sm font-semibold">{a.volunteer_name} <span className="font-normal text-slate-500">· {ASSIGNMENT_LABEL[a.status]}</span></div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(NEXT_ASSIGNMENT[a.status] ?? []).map(s => (
                  <Button key={s} small variant={s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'ghost' : 'primary'} disabled={busy}
                    onClick={() => act(() => api.updateAssignment(a.id, s))}>{ASSIGNMENT_LABEL[s]}</Button>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Relay path">
          <ol className="relative ml-2 border-l-2 border-dashed border-brand-500/40">
            {d.relay_history.map((h, i) => (
              <li key={i} className="mb-3 ml-4">
                <span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ring-2 ring-white ${h.transport === 'INTERNET' ? 'bg-emerald-500' : h.transport === 'SIMULATED' ? 'bg-amber-500' : h.transport === 'LOCAL' ? 'bg-coral-500' : 'bg-brand-500'}`} />
                <div className="text-sm"><b>{h.device_name ?? h.device_id.slice(0, 14)}</b> <span className="text-slate-500">· {TRANSPORT_LABEL[h.transport]}</span></div>
                <div className="text-xs text-slate-400">hop {h.hop_index} · {fmtTime(h.received_at)}</div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Message history">
          <ul className="space-y-2 text-xs">
            {d.status_events.map(e => (
              <li key={e.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-slate-400">{fmtTime(e.created_at)}</span>
                <span><b className="text-slate-700">{e.event.replaceAll('_', ' ').toLowerCase()}</b>
                  {e.from_value && e.to_value ? ` ${e.from_value} → ${e.to_value}` : e.to_value ? ` ${e.to_value}` : ''}
                  {e.actor_username && <span className="text-slate-500"> by {e.actor_username}</span>}
                  {e.note && <span className="text-slate-500"> — {e.note}</span>}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  )
}
