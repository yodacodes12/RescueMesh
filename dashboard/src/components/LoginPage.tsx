import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Button, Logo } from './ui'

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(username, password)
      onLoggedIn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={64} />
          <h1 className="mt-3 text-2xl font-bold text-navy-800">RescueMesh</h1>
          <p className="text-sm text-slate-500">Rescue Coordination Dashboard</p>
        </div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="u">Username</label>
        <input id="u" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="p">Password</label>
        <input id="p" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        {error && <p className="mb-4 rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-600">{error}</p>}
        <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></div>
        <p className="mt-6 text-center text-xs text-slate-400">Coordinator access only. Locations of people in distress are confidential.</p>
      </form>
    </div>
  )
}
