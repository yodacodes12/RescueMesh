import type { ReactNode } from 'react'
import type { AssignmentStatus, DeliveryStatus, EmergencyType, Priority, RescueStatus } from '../types'

export const PRIORITY_COLOR: Record<Priority, string> = {
  CRITICAL: '#e11d48',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
}

const PRIORITY_CLASS: Record<Priority, string> = {
  CRITICAL: 'bg-rose-100 text-rose-700 ring-rose-200',
  HIGH: 'bg-orange-100 text-orange-700 ring-orange-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
  LOW: 'bg-blue-100 text-blue-700 ring-blue-200',
}

const RESCUE_CLASS: Record<RescueStatus, string> = {
  RECEIVED: 'bg-coral-50 text-coral-600 ring-coral-500/30',
  ACKNOWLEDGED: 'bg-brand-50 text-brand-500 ring-brand-500/30',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  IN_PROGRESS: 'bg-violet-50 text-violet-700 ring-violet-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
}

export const TYPE_LABEL: Record<EmergencyType, string> = {
  MEDICAL: 'Medical',
  TRAPPED: 'Trapped',
  FIRE: 'Fire',
  FLOOD: 'Flood',
  OTHER: 'Other',
}

export const TYPE_ICON: Record<EmergencyType, string> = {
  MEDICAL: '✚',
  TRAPPED: '⚠',
  FIRE: '🔥',
  FLOOD: '🌊',
  OTHER: '•',
}

const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  SERVER_RECEIVED: 'Server received',
  COORDINATOR_ACKNOWLEDGED: 'Acknowledged',
}

export const RESCUE_LABEL: Record<RescueStatus, string> = {
  RECEIVED: 'New',
  ACKNOWLEDGED: 'Acknowledged',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
}

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  ASSIGNED: 'Assigned',
  EN_ROUTE: 'En route',
  ON_SITE: 'On site',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

function Pill({ className, children, title }: { className: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>
      {children}
    </span>
  )
}

export const PriorityBadge = ({ p }: { p: Priority }) => <Pill className={PRIORITY_CLASS[p]}>{p}</Pill>
export const RescueBadge = ({ s }: { s: RescueStatus }) => <Pill className={RESCUE_CLASS[s]}>{RESCUE_LABEL[s]}</Pill>
export const DeliveryBadge = ({ s }: { s: DeliveryStatus }) => (
  <Pill className={s === 'COORDINATOR_ACKNOWLEDGED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-sky-50 text-sky-700 ring-sky-200'}
        title="Communication status: has the message reached and been seen by the rescue system?">
    {s === 'COORDINATOR_ACKNOWLEDGED' ? '✓✓' : '✓'} {DELIVERY_LABEL[s]}
  </Pill>
)
export const SimBadge = () => (
  <Pill className="bg-amber-100 text-amber-800 ring-amber-300" title="Arrived through the in-app simulation, not real device-to-device radio">
    SIMULATED
  </Pill>
)
export const DemoBadge = () => <Pill className="bg-amber-50 text-amber-700 ring-amber-200">DEMO</Pill>
export const ViaBadge = ({ via, hops }: { via: 'DIRECT' | 'GATEWAY'; hops: number }) => (
  <Pill className="bg-white text-slate-600 ring-slate-200" title={via === 'GATEWAY' ? 'Relayed over the mesh, uploaded by a gateway phone' : 'Uploaded by the originating phone'}>
    {via === 'GATEWAY' ? `Mesh · ${hops} hop${hops === 1 ? '' : 's'}` : 'Direct'}
  </Pill>
)

export const shortId = (id: string) => id.slice(0, 8).toUpperCase()

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export const fmtCoord = (lat: number | null, lon: number | null) =>
  lat === null || lon === null ? 'No GPS fix' : `${lat.toFixed(5)}, ${lon.toFixed(5)}`

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 4 8 13v17c0 15 10 26 24 30 14-4 24-15 24-30V13L32 4z" fill="#0b2a5b" />
      <path d="M32 9.5 13 16.8V30c0 12 7.8 20.8 19 24.3C43.2 50.8 51 42 51 30V16.8L32 9.5z" fill="#1e6fff" />
      <path d="M28 22h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="#fff" />
      <path d="M21 17.5a16 16 0 0 1 22 0M24.5 21a11 11 0 0 1 15 0" stroke="#ff5a5f" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function Button({
  children, onClick, variant = 'primary', disabled, small, type = 'button',
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'danger' | 'ghost' | 'success'; disabled?: boolean; small?: boolean; type?: 'button' | 'submit'
}) {
  const v = {
    primary: 'bg-brand-500 text-white hover:bg-blue-600',
    danger: 'bg-coral-500 text-white hover:bg-coral-600',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    ghost: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${v} ${small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'} rounded-lg font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50`}>
      {children}
    </button>
  )
}
