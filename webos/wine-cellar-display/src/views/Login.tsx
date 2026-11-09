import { useState } from 'react'
import { api, setToken } from '../api'
import { useDraft } from '../hooks'
import type { User } from '../types'
import { Field } from '../components/ui'

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useDraft('login', { username: '', email: '' })
  const [password, setPassword] = useState('') // never persisted
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(null); setBusy(true)
    try {
      const r = mode === 'login'
        ? await api<{ access_token: string; user: User }>('POST', '/api/auth/login', { username: form.username, password })
        : await api<{ access_token: string; user: User }>('POST', '/api/auth/register', { ...form, password })
      setToken(r.access_token)
      onLogin(r.user)
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <div className="logo-mark">◐</div>
        <h1>Wine Cellar</h1>
        <p className="muted">AI-driven cellar management</p>
      </div>
      <div className="card login-card">
        <div className="seg">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Create account</button>
        </div>
        <Field label={mode === 'login' ? 'Username or email' : 'Username'}>
          <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="username" />
        </Field>
        {mode === 'register' && (
          <Field label="Email">
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </Field>
        )}
        <Field label="Password">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && submit()} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </Field>
        {mode === 'register' && <p className="muted small">At least 8 characters. A demo cellar with sample bottles is created for you.</p>}
        {err && <p className="error">{err}</p>}
        <button className="btn primary big" disabled={busy} onClick={submit}>{busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </div>
    </div>
  )
}
