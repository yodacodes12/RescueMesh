import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { SOS, Volunteer } from '../types'
import { PRIORITY_COLOR, TYPE_LABEL, shortId } from './ui'

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.map(p => p.join(',')).join(';')
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14)
    else if (points.length > 1) map.fitBounds(points as LatLngBoundsExpression, { padding: [40, 40], maxZoom: 15 })
    // Refit only when the set of points changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6 })
  }, [target, map])
  return null
}

export function SOSMap({ sos, volunteers, selected, onSelect }: {
  sos: SOS[]; volunteers: Volunteer[]; selected: string | null; onSelect: (id: string) => void
}) {
  const located = sos.filter(s => s.latitude !== null && s.longitude !== null)
  const points = useMemo(() => located.map(s => [s.latitude!, s.longitude!] as [number, number]), [located])
  const sel = located.find(s => s.message_id === selected)
  const target = useMemo<[number, number] | null>(() => (sel ? [sel.latitude!, sel.longitude!] : null), [sel])

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <MapContainer center={[20.5937, 78.9629]} zoom={5} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        <FlyTo target={target} />
        {volunteers.filter(v => v.latitude !== null && v.longitude !== null).map(v => (
          <CircleMarker key={`v${v.id}`} center={[v.latitude!, v.longitude!]} radius={6}
            pathOptions={{ color: '#0b2a5b', weight: 2, fillColor: v.status === 'AVAILABLE' ? '#22c55e' : '#94a3b8', fillOpacity: 1 }}>
            <Tooltip>{v.name} · {v.team_name ?? 'Volunteer'} · {v.status}{v.is_demo ? ' · DEMO' : ''}</Tooltip>
          </CircleMarker>
        ))}
        {located.map(s => {
          const closed = s.rescue_status === 'RESOLVED' || s.rescue_status === 'CANCELLED'
          const isSel = s.message_id === selected
          return (
            <CircleMarker key={s.message_id} center={[s.latitude!, s.longitude!]}
              radius={isSel ? 14 : s.priority === 'CRITICAL' ? 11 : 9}
              eventHandlers={{ click: () => onSelect(s.message_id) }}
              pathOptions={{
                color: isSel ? '#0b2a5b' : '#fff', weight: isSel ? 4 : 2,
                fillColor: PRIORITY_COLOR[s.priority], fillOpacity: closed ? 0.35 : 0.95,
                dashArray: s.is_simulated ? '4 3' : undefined,
              }}>
              <Tooltip>
                <b>{s.priority}</b> · {TYPE_LABEL[s.emergency_type]} · {shortId(s.message_id)}
                {s.is_simulated ? ' · SIMULATED' : ''}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-xl bg-white/95 px-3 py-2 text-xs shadow ring-1 ring-slate-200">
        <div className="mb-1 font-semibold text-slate-600">Priority</div>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(PRIORITY_COLOR) as (keyof typeof PRIORITY_COLOR)[]).map(p => (
            <span key={p} className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: PRIORITY_COLOR[p] }} />{p}</span>
          ))}
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-navy-800 bg-green-500" />Volunteer</span>
        </div>
        {sos.length > located.length && <div className="mt-1 text-slate-500">{sos.length - located.length} request(s) without GPS not shown</div>}
      </div>
    </div>
  )
}
