import { useEffect, useState, type ReactNode } from 'react'
import { api, setToken } from '../api'
import { useDraft } from '../hooks'
import type { User } from '../types'
import { Field } from '../components/ui'
import Logo from '../components/Logo'

/* same rules and wording as the Android app (paper: Sign-Up / Log-In specification) */
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(e.trim())
const isValidUsername = (u: string) => /^[A-Za-z0-9_.-]{3,32}$/.test(u.trim())
const passwordChecks = (p: string) => [
  { label: 'At least 8 characters', ok: p.length >= 8 },
  { label: 'A lowercase letter', ok: /[a-z]/.test(p) },
  { label: 'An uppercase letter', ok: /[A-Z]/.test(p) },
  { label: 'A number', ok: /\d/.test(p) },
  { label: 'A special character', ok: /[^A-Za-z0-9]/.test(p) },
]

type AuthResult = { access_token: string; user: User }

/** Log in and Sign up, like the Android app: brand on top, a few fields, one button, a link to the other screen. */
export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [created, setCreated] = useState<string | null>(null)
  return mode === 'login'
    ? <LogIn created={created} onLogin={onLogin} onSignup={() => { setCreated(null); setMode('signup') }} />
    : <SignUp onBack={() => setMode('login')} onCreated={u => { setCreated(u); setMode('login') }} />
}

function Brand({ title }: { title: string }) {
  return (
    <div className="auth-brand">
      <div className="auth-logo"><Logo size={88} /></div>
      <span className="t-overline">CellarOS</span>
      <h1>{title}</h1>
    </div>
  )
}

function Page({ children }: { children: ReactNode }) {
  return <div className="auth"><div className="auth-col">{children}</div></div>
}

function Hint({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`hint ${ok ? 'ok' : ''}`}><i aria-hidden="true">{ok ? '✓' : ''}</i>{label}</span>
}

function LogIn({ created, onLogin, onSignup }: { created: string | null; onLogin: (u: User) => void; onSignup: () => void }) {
  const [form, setForm] = useDraft('login', { username: created ?? '' })
  const [password, setPassword] = useState('') // never stored
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (created) setForm({ username: created }) }, [created]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = form.username
  const ready = name.trim().length > 0 && password.length > 0 && !busy

  const submit = async () => {
    if (!ready) return
    setErr(null); setBusy(true)
    try {
      const r = await api<AuthResult>('POST', '/api/auth/login', { username: name.trim(), password })
      setToken(r.access_token); onLogin(r.user)
    } catch (e) {
      const m = (e as Error).message
      setErr(/invalid|401/i.test(m) ? 'Invalid username or password' : m)
    } finally { setBusy(false) }
  }

  return (
    <Page>
      <Brand title="Welcome back" />
      {created && <p className="auth-note ok" role="status">Account created. Log in to continue.</p>}
      <div className="auth-fields">
        <Field label="Username or email">
          <input value={name} autoComplete="username" placeholder="Username or email"
                 onChange={e => setForm({ username: e.target.value })} />
        </Field>
        <Field label="Password">
          <input type="password" value={password} autoComplete="current-password" placeholder="Password" autoFocus={!!created}
                 onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        </Field>
      </div>
      {err && <p className="auth-note err" role="alert">{err}</p>}
      <button className="btn primary big auth-btn" disabled={!ready} onClick={submit}>{busy ? 'Logging in…' : 'Log in'}</button>
      <button className="link-btn auth-link" onClick={onSignup}>Create an account</button>
    </Page>
  )
}

function SignUp({ onBack, onCreated }: { onBack: () => void; onCreated: (username: string) => void }) {
  const [f, setF] = useDraft('signup', { username: '', email: '' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const checks = passwordChecks(password)
  const matches = password.length > 0 && password === confirm
  const valid = isValidUsername(f.username) && isValidEmail(f.email) && checks.every(c => c.ok) && matches

  const submit = async () => {
    if (!valid || busy) return
    setErr(null); setBusy(true)
    try {
      // paper: sign-up completes registration and returns to Log-In (no automatic sign-in)
      await api<AuthResult>('POST', '/api/auth/register', { username: f.username.trim(), email: f.email.trim(), password })
      setF({ username: '', email: '' })
      onCreated(f.username.trim())
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Page>
      <Brand title="Create account" />
      <div className="auth-fields">
        <Field label="Username">
          <input value={f.username} maxLength={32} autoComplete="username" placeholder="Username" onChange={e => setF({ ...f, username: e.target.value })} />
        </Field>
        {f.username && !isValidUsername(f.username) && <Hint ok={false} label="3–32 letters, numbers, . _ or -" />}
        <Field label="Email">
          <input type="email" value={f.email} autoComplete="email" placeholder="Email" onChange={e => setF({ ...f, email: e.target.value })} />
        </Field>
        {f.email && !isValidEmail(f.email) && <Hint ok={false} label="Enter an email like name@example.com" />}
        <Field label="Password">
          <input type="password" value={password} autoComplete="new-password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
        </Field>
        <div className="checklist">{checks.map(c => <Hint key={c.label} ok={c.ok} label={c.label} />)}</div>
        <Field label="Confirm password">
          <input type="password" value={confirm} autoComplete="new-password" placeholder="Re-enter password"
                 onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        </Field>
        {confirm && <Hint ok={matches} label={matches ? 'Passwords match' : "Passwords don't match"} />}
      </div>
      {err && <p className="auth-note err" role="alert">{err}</p>}
      <button className="btn primary big auth-btn" disabled={!valid || busy} onClick={submit}>{busy ? 'Creating account…' : 'Sign up'}</button>
      <button className="link-btn auth-link" onClick={onBack}>I already have an account</button>
    </Page>
  )
}
