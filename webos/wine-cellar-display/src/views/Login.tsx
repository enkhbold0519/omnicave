import { useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, setToken } from '../api'
import { useDraft } from '../hooks'
import type { User } from '../types'
import { Field } from '../components/ui'
import { ConsentList, requiredAccepted, useLegal } from '../components/Consents'
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
type SignUpResult = AuthResult | { verification_required: true; email: string }

/** Youth Protection Act: from 1 January of the year you turn 19 (only the birth year counts, as on the server). */
const MIN_AGE = 19
const oldEnough = (d: string) => /^\d{4}-\d\d-\d\d$/.test(d) && new Date().getFullYear() - Number(d.slice(0, 4)) >= MIN_AGE

type Mode = { m: 'login'; note?: string } | { m: 'signup' } | { m: 'verify'; who: string; note: string } | { m: 'forgot' }

/** Log in and Sign up, like the Android app: brand on top, a few fields, one button, a link to the other screen.
 *  Plus the email-code screens: verify the address after sign-up, and reset a forgotten password. */
export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>({ m: 'login' })
  const [created, setCreated] = useState<string | null>(null)
  const done = (r: AuthResult) => { setToken(r.access_token); onLogin(r.user) }
  switch (mode.m) {
    case 'signup':
      return <SignUp onBack={() => setMode({ m: 'login' })} onCreated={u => { setCreated(u); setMode({ m: 'login' }) }}
                     onVerify={email => setMode({ m: 'verify', who: email, note: `We sent a 6-digit code to ${email}.` })} />
    case 'verify':
      return <VerifyEmail who={mode.who} note={mode.note} onDone={done} onBack={() => setMode({ m: 'login' })} />
    case 'forgot':
      return <ForgotPassword onBack={note => setMode({ m: 'login', note })} />
    default:
      return <LogIn created={created} note={mode.note} onLogin={done} onSignup={() => { setCreated(null); setMode({ m: 'signup' }) }}
                    onVerify={(who, note) => setMode({ m: 'verify', who, note })} onForgot={() => setMode({ m: 'forgot' })} />
  }
}

function Brand({ title }: { title: string }) {
  return (
    <div className="auth-brand">
      <div className="auth-logo"><Logo size={88} /></div>
      <span className="t-overline">OmniCave</span>
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

function LogIn({ created, note, onLogin, onSignup, onVerify, onForgot }: {
  created: string | null; note?: string; onLogin: (r: AuthResult) => void; onSignup: () => void
  onVerify: (who: string, note: string) => void; onForgot: () => void
}) {
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
      onLogin(await api<AuthResult>('POST', '/api/auth/login', { username: name.trim(), password }))
    } catch (e) {
      const m = (e as Error).message
      // 403 = right password, but the email address is not verified yet
      if (e instanceof ApiError && e.status === 403) { onVerify(name.trim(), m); return }
      setErr(/invalid|401/i.test(m) ? 'Invalid username or password' : m)
    } finally { setBusy(false) }
  }

  return (
    <Page>
      <Brand title="Welcome back" />
      {created && <p className="auth-note ok" role="status">Account created. Log in to continue.</p>}
      {note && <p className="auth-note ok" role="status">{note}</p>}
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
      <button className="link-btn auth-link" onClick={onForgot}>Forgot password?</button>
      <button className="link-btn auth-link" onClick={onSignup}>Create an account</button>
    </Page>
  )
}

function SignUp({ onBack, onCreated, onVerify }: { onBack: () => void; onCreated: (username: string) => void; onVerify: (email: string) => void }) {
  const [f, setF] = useDraft('signup', { username: '', email: '' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [birth, setBirth] = useState('')              // personal data: not kept in the draft
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const { legal, error: legalErr } = useLegal()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const checks = passwordChecks(password)
  const matches = password.length > 0 && password === confirm
  const valid = isValidUsername(f.username) && isValidEmail(f.email) && checks.every(c => c.ok) && matches
    && oldEnough(birth) && !!legal && requiredAccepted(legal, consents)

  const submit = async () => {
    if (!valid || busy) return
    setErr(null); setBusy(true)
    try {
      const r = await api<SignUpResult>('POST', '/api/auth/register',
        { username: f.username.trim(), email: f.email.trim(), password, birth_date: birth, consents })
      setF({ username: '', email: '' })
      // with email verification on, the code screen comes first; otherwise back to Log-In
      // (paper: sign-up completes registration and returns to Log-In, no automatic sign-in)
      if ('verification_required' in r) onVerify(r.email)
      else onCreated(f.username.trim())
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
        <Field label="Date of birth">
          <input type="date" value={birth} max={new Date().toISOString().slice(0, 10)} onChange={e => setBirth(e.target.value)} />
        </Field>
        {birth && !oldEnough(birth) && <Hint ok={false} label={`You must be ${MIN_AGE} or older to use OmniCave`} />}
      </div>
      {legal && <ConsentList legal={legal} value={consents} onChange={setConsents} />}
      {legalErr && <p className="auth-note err" role="alert">Couldn't load the terms: {legalErr}</p>}
      {err && <p className="auth-note err" role="alert">{err}</p>}
      <button className="btn primary big auth-btn" disabled={!valid || busy} onClick={submit}>{busy ? 'Creating account…' : 'Sign up'}</button>
      <button className="link-btn auth-link" onClick={onBack}>I already have an account</button>
    </Page>
  )
}

const isCode = (c: string) => /^\d{6}$/.test(c)

function CodeInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter?: () => void }) {
  return (
    <Field label="6-digit code">
      <input className="code-input" value={value} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus
             onChange={e => onChange(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && onEnter?.()} />
    </Field>
  )
}

/** After sign-up (or a login refused for an unverified address): enter the emailed code, then you are logged in. */
function VerifyEmail({ who, note, onDone, onBack }: { who: string; note: string; onDone: (r: AuthResult) => void; onBack: () => void }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const verify = async () => {
    if (!isCode(code) || busy) return
    setMsg(null); setBusy(true)
    try { onDone(await api<AuthResult>('POST', '/api/auth/verify-email', { email: who, code })) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  const resend = async () => {
    try { await api('POST', '/api/auth/resend-code', { email: who }); setMsg({ ok: true, text: 'If the address needs a code, a new one is on its way.' }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  return (
    <Page>
      <Brand title="Check your email" />
      <p className="auth-note">{note}</p>
      <div className="auth-fields"><CodeInput value={code} onChange={setCode} onEnter={verify} /></div>
      {msg && <p className={`auth-note ${msg.ok ? 'ok' : 'err'}`} role="alert">{msg.text}</p>}
      <button className="btn primary big auth-btn" disabled={!isCode(code) || busy} onClick={verify}>{busy ? 'Checking…' : 'Verify'}</button>
      <button className="link-btn auth-link" onClick={resend}>Send a new code</button>
      <button className="link-btn auth-link" onClick={onBack}>Back to log in</button>
    </Page>
  )
}

/** Forgot password: email -> code + new password -> back to Log-In. Every session of the account is logged out. */
function ForgotPassword({ onBack }: { onBack: (note?: string) => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const checks = passwordChecks(password)
  const matches = password.length > 0 && password === confirm
  const run = async (fn: () => Promise<void>) => {
    setErr(null); setBusy(true)
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const send = () => run(async () => { await api('POST', '/api/auth/forgot-password', { email: email.trim() }); setSent(true) })
  const reset = () => run(async () => {
    await api('POST', '/api/auth/reset-password', { email: email.trim(), code, password })
    onBack('Password changed. Log in with your new password.')
  })
  return (
    <Page>
      <Brand title="Reset password" />
      {!sent ? (
        <>
          <p className="auth-note">Enter your account's email address. We'll send you a 6-digit code.</p>
          <div className="auth-fields">
            <Field label="Email">
              <input type="email" value={email} autoComplete="email" placeholder="Email" autoFocus
                     onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && isValidEmail(email) && send()} />
            </Field>
          </div>
          {err && <p className="auth-note err" role="alert">{err}</p>}
          <button className="btn primary big auth-btn" disabled={!isValidEmail(email) || busy} onClick={send}>{busy ? 'Sending…' : 'Send code'}</button>
        </>
      ) : (
        <>
          <p className="auth-note">If {email.trim()} has an account, a code is on its way.</p>
          <div className="auth-fields">
            <CodeInput value={code} onChange={setCode} />
            <Field label="New password">
              <input type="password" value={password} autoComplete="new-password" placeholder="New password" onChange={e => setPassword(e.target.value)} />
            </Field>
            <div className="checklist">{checks.map(c => <Hint key={c.label} ok={c.ok} label={c.label} />)}</div>
            <Field label="Confirm password">
              <input type="password" value={confirm} autoComplete="new-password" placeholder="Re-enter password" onChange={e => setConfirm(e.target.value)} />
            </Field>
            {confirm && <Hint ok={matches} label={matches ? 'Passwords match' : "Passwords don't match"} />}
          </div>
          {err && <p className="auth-note err" role="alert">{err}</p>}
          <button className="btn primary big auth-btn" disabled={!isCode(code) || !checks.every(c => c.ok) || !matches || busy} onClick={reset}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
          <button className="link-btn auth-link" onClick={() => { setSent(false); setCode('') }}>Use another email</button>
        </>
      )}
      <button className="link-btn auth-link" onClick={() => onBack()}>Back to log in</button>
    </Page>
  )
}
