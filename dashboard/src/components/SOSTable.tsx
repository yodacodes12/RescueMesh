import type { SOS } from '../types'
import { ASSIGNMENT_LABEL, DeliveryBadge, PriorityBadge, RescueBadge, SimBadge, TYPE_ICON, TYPE_LABEL, ViaBadge, fmtCoord, fmtTime, shortId, timeAgo } from './ui'

export function SOSTable({ rows, selected, onSelect }: { rows: SOS[]; selected: string | null; onSelect: (id: string) => void }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">
        No emergency requests match the current filters. New SOS messages appear here automatically.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Message ID</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Delivery</th>
            <th className="px-4 py-3">Rescue / assignment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(s => (
            <tr key={s.message_id} onClick={() => onSelect(s.message_id)}
              className={`cursor-pointer transition hover:bg-brand-50/60 ${selected === s.message_id ? 'bg-brand-50' : ''} ${s.rescue_status === 'RECEIVED' ? 'font-medium' : ''}`}>
              <td className="px-4 py-3">
                <div className="font-mono text-xs text-navy-800">{shortId(s.message_id)}</div>
                <div className="mt-1 flex gap-1"><ViaBadge via={s.received_via} hops={s.hop_count} />{s.is_simulated && <SimBadge />}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{TYPE_ICON[s.emergency_type]} {TYPE_LABEL[s.emergency_type]}
                {s.people_affected ? <span className="ml-1 text-xs text-slate-500">· {s.people_affected} ppl</span> : null}</td>
              <td className="px-4 py-3"><PriorityBadge p={s.priority} />
                {s.priority !== s.original_priority && <div className="mt-1 text-[11px] text-slate-400">was {s.original_priority}</div>}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{fmtCoord(s.latitude, s.longitude)}</td>
              <td className="px-4 py-3 whitespace-nowrap"><div>{fmtTime(s.created_at)}</div><div className="text-xs text-slate-400">{timeAgo(s.created_at)}</div></td>
              <td className="px-4 py-3"><DeliveryBadge s={s.delivery_status} /></td>
              <td className="px-4 py-3">
                <RescueBadge s={s.rescue_status} />
                {s.active_assignment && <div className="mt-1 text-xs text-slate-500">{s.active_assignment.volunteer_name} · {ASSIGNMENT_LABEL[s.active_assignment.status]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
