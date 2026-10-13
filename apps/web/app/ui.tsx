'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json().catch(() => ({ message: 'The service is unavailable. Please try again.' }));
  if (!response.ok) throw new Error(result.message ?? 'Unable to complete this request.');
  return result;
}
type Mode = 'login' | 'register' | 'forgot' | 'verify' | 'reset';
const titles: Record<Mode, string> = { login: 'Welcome back.', register: 'Start with clarity.', forgot: 'Recover your account.', verify: 'Verify your email.', reset: 'Choose a new password.' };
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => {
    const emailToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (emailToken) setToken(emailToken);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    for (const [key, value] of form) payload[key] = String(value);
    if (mode === 'verify' || mode === 'reset') payload.token = token;
    const path = { login: 'login', register: 'register', forgot: 'forgot-password', verify: 'verify', reset: 'reset-password' }[mode];
    try {
      const result = await api(`auth/${path}`, payload);
      if (mode === 'login') router.replace('/dashboard');
      else setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  async function resend(form: HTMLFormElement) {
    setBusy(true); setError('');
    try { const result = await api('auth/resend-verification', { email: String(new FormData(form).get('email')) }); setMessage(result.message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to connect.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-layout">
    <section className="story"><Link className="brand" href="/">◈ Personal Finance</Link><div><p className="eyebrow">A CLEARER FINANCIAL FUTURE</p><h1>Make room for<br />what matters.</h1><p>Understand your money. Build steady habits. Give your goals a plan.</p><div className="story-line" /><p className="small">A personal space for your finances.<br />Built with Ghana in mind.</p></div><span className="small">Your decisions. Your progress.</span></section>
    <section className="form-area"><div className="form-card"><p className="eyebrow">YOUR PERSONAL FINANCIAL SPACE</p><h2>{titles[mode]}</h2><p className="muted">{mode === 'login' ? 'Sign in to your private financial space.' : mode === 'register' ? 'Create your account. We’ll send an email to verify it.' : mode === 'verify' ? 'Confirm your email using the link we sent you.' : 'Use a secure password with at least 12 characters.'}</p>
      <form onSubmit={submit}>
        {mode === 'register' && <label>Your name<input name="name" autoComplete="name" required maxLength={100} /></label>}
        {['login', 'register', 'forgot'].includes(mode) && <label>Email address<input type="email" name="email" autoComplete="email" required maxLength={254} /></label>}
        {['login', 'register', 'reset'].includes(mode) && <label>Password<input type="password" name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} maxLength={128} required /></label>}
        {(mode === 'verify' || mode === 'reset') && !token && <p role="alert">Open the link from your email to continue.</p>}
        <button disabled={busy || ((mode === 'verify' || mode === 'reset') && !token)}>{busy ? 'Please wait…' : { login: 'Sign in', register: 'Create account', forgot: 'Send reset link', verify: 'Verify email', reset: 'Update password' }[mode]} <span aria-hidden>→</span></button>
        {mode === 'login' && <button className="text-button" type="button" disabled={busy} onClick={e => { const form = e.currentTarget.form; if (form?.querySelector<HTMLInputElement>('[name=email]')?.reportValidity()) void resend(form); }}>Resend verification email</button>}
      </form>
      {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
      <div className="links">{mode === 'login' ? <><Link href="/register">Create an account</Link><Link href="/forgot">Forgot password?</Link></> : <Link href="/">Back to sign in</Link>}</div>
      <p className="privacy">Your Personal Space stays private when you join a household.</p>
    </div></section>
  </main>;
}
export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<{ user: { name: string }; space: { name: string; baseCurrency: string } } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const user = await api('auth/me'); const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const dashboard = await api(`spaces/${spaces[0].id}/dashboard`);
      if (active) setData({ user, space: dashboard.space });
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load your space.'); }
  })(); return () => { active = false; }; }, []);
  async function logout() { try { await api('auth/logout', {}); router.replace('/'); } catch { setError('Unable to sign out. Please try again.'); } }
  return <main className="dashboard"><header><Link className="brand" href="/dashboard">◈ Personal Finance</Link><button className="text-button" onClick={logout}>Sign out</button></header><section>
    <p className="eyebrow">PERSONAL SPACE · {data?.space.baseCurrency ?? 'GHS'}</p><h1>{data ? `Welcome, ${data.user.name}.` : 'Your financial space'}</h1><p className="muted">A clearer picture starts with your first record.</p>
    {error ? <div className="notice" role="alert">{error} <Link href="/">Return to sign in</Link></div> : !data ? <p role="status">Loading your private space…</p> : <><div className="space-card"><span className="tag">PRIVATE</span><h2>{data.space.name}</h2><p>Your account is ready. Income, expenses, flexible paydays and budgets are the next step.</p><p className="muted">Financial summaries will appear once you begin recording your money.</p></div><div className="principles"><div><h3>Keep your own record</h3><p>Track money you receive and spend through manual entries.</p></div><div><h3>Plan around your payday</h3><p>Use actual salary receipts to understand cash flow.</p></div><div><h3>Decide with confidence</h3><p>Clear calculations will support your financial decisions.</p></div></div></>}
  </section></main>;
}
