import type { AssignmentStatus, Priority, RescueStatus, SOS, SOSDetail, Stats, User, Volunteer } from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || 'http://localhost:8000'
// sessionStorage: the token disappears when the browser tab closes.
const TOKEN_KEY = 'rescuemesh.token'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }
export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY)

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof URLSearchParams)) headers.set('Content-Type', 'application/json')
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, `Cannot reach the RescueMesh server at ${BASE}`)
  }
  if (res.status === 401 && token) {
    clearToken()
    onUnauthorized()
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch { /* not json */ }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  baseUrl: BASE,
  async login(username: string, password: string) {
    const r = await request<{ access_token: string }>('/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams({ username, password }),
    })
    sessionStorage.setItem(TOKEN_KEY, r.access_token)
  },
  me: () => request<User>('/api/auth/me'),
  stats: () => request<Stats>('/api/dashboard/stats'),
  listSOS: (params: { open_only?: boolean; include_simulated?: boolean; priority?: Priority | '' }) => {
    const q = new URLSearchParams({ sort: 'priority' })
    if (params.open_only) q.set('open_only', 'true')
    if (params.include_simulated === false) q.set('include_simulated', 'false')
    if (params.priority) q.set('priority', params.priority)
    return request<SOS[]>(`/api/sos?${q}`)
  },
  getSOS: (id: string) => request<SOSDetail>(`/api/sos/${id}`),
  acknowledge: (id: string, note?: string) =>
    request<SOSDetail>(`/api/sos/${id}/acknowledge`, { method: 'POST', body: json({ note: note || null }) }),
  setStatus: (id: string, rescue_status: RescueStatus, note?: string) =>
    request<SOSDetail>(`/api/sos/${id}/status`, { method: 'PATCH', body: json({ rescue_status, note: note || null }) }),
  setPriority: (id: string, priority: Priority, note?: string) =>
    request<SOSDetail>(`/api/sos/${id}/priority`, { method: 'PATCH', body: json({ priority, note: note || null }) }),
  volunteers: () => request<Volunteer[]>('/api/volunteers'),
  setVolunteerStatus: (id: number, status: Volunteer['status']) =>
    request<Volunteer>(`/api/volunteers/${id}`, { method: 'PATCH', body: json({ status }) }),
  createVolunteer: (v: { name: string; team_name?: string; phone?: string; skills?: string }) =>
    request<Volunteer>('/api/volunteers', { method: 'POST', body: json(v) }),
  assign: (message_id: string, volunteer_id: number, notes?: string) =>
    request('/api/assignments', { method: 'POST', body: json({ message_id, volunteer_id, notes: notes || null }) }),
  updateAssignment: (id: number, status: AssignmentStatus) =>
    request(`/api/assignments/${id}`, { method: 'PATCH', body: json({ status }) }),
}
