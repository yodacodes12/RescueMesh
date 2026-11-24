export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type EmergencyType = 'MEDICAL' | 'TRAPPED' | 'FIRE' | 'FLOOD' | 'OTHER'
export type DeliveryStatus = 'SERVER_RECEIVED' | 'COORDINATOR_ACKNOWLEDGED'
export type RescueStatus = 'RECEIVED' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED'
export type AssignmentStatus = 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED' | 'CANCELLED'
export type Transport = 'LOCAL' | 'NEARBY' | 'SIMULATED' | 'INTERNET'

export interface AssignmentBrief {
  id: number
  volunteer_id: number
  volunteer_name: string
  status: AssignmentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SOS {
  message_id: string
  sender_id: string
  sender_name: string | null
  emergency_type: EmergencyType
  priority: Priority
  original_priority: Priority
  latitude: number | null
  longitude: number | null
  location_accuracy_m: number | null
  description: string
  people_affected: number | null
  created_at: string
  expiry_at: string
  received_at: string
  updated_at: string
  hop_count: number
  received_via: 'DIRECT' | 'GATEWAY'
  gateway_id: string | null
  is_simulated: boolean
  duplicate_receipts: number
  delivery_status: DeliveryStatus
  rescue_status: RescueStatus
  active_assignment: AssignmentBrief | null
  priority_score: number
}

export interface SOSDetail extends SOS {
  relay_history: { hop_index: number; device_id: string; device_name: string | null; transport: Transport; received_at: string }[]
  status_events: { id: number; event: string; from_value: string | null; to_value: string | null; note: string | null; actor_username: string | null; created_at: string }[]
  acknowledgements: { id: number; ack_type: string; note: string | null; acknowledged_by_username: string | null; created_at: string }[]
  assignments: AssignmentBrief[]
}

export interface Volunteer {
  id: number
  name: string
  phone: string | null
  team_name: string | null
  skills: string | null
  status: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY'
  latitude: number | null
  longitude: number | null
  is_demo: boolean
  active_assignments: number
}

export interface Stats {
  total: number
  critical_open: number
  pending: number
  acknowledged: number
  assigned: number
  resolved: number
  cancelled: number
  via_gateway: number
  via_direct: number
  simulated: number
  by_priority: Record<Priority, number>
  volunteers_available: number
  volunteers_total: number
  generated_at: string
}

export interface User {
  id: number
  username: string
  full_name: string
  role: 'ADMIN' | 'COORDINATOR'
}
