'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import styles from './categories.module.css';
import incomeStyles from './income.module.css';
import workspaceStyles from './workspace.module.css';
import expenseStyles from './expenses.module.css';
import recurringStyles from './recurring.module.css';
import budgetStyles from './budgets.module.css';
import savingsStyles from './savings.module.css';
import liabilityStyles from './liabilities.module.css';
import goalStyles from './goals.module.css';
import netWorthStyles from './net-worth.module.css';
import paydayStyles from './payday.module.css';
import investmentStyles from './investments.module.css';
import scenarioStyles from './scenario-planning.module.css';
import insightStyles from './financial-insights.module.css';
export async function api(path: string, body?: unknown) {
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
const workspaceLinks = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/income', label: 'Income' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/savings', label: 'Savings' },
  { href: '/investments', label: 'Investments' },
  { href: '/portfolio-intelligence', label: 'Portfolio intelligence' },
  { href: '/scenarios', label: 'Scenario planning' },
  { href: '/financial-review', label: 'Financial review' },
  { href: '/goals', label: 'Goals' },
  { href: '/net-worth', label: 'Net worth' },
  { href: '/payday', label: 'Payday routine' },
  { href: '/liabilities', label: 'Liabilities' },
  { href: '/recurring', label: 'Recurring' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/categories', label: 'Categories' },
];
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setError('');
    try { await api('auth/logout', {}); router.replace('/'); }
    catch { setError('Unable to sign out. Please try again.'); }
  }
  return <div className={workspaceStyles.layout}>
    <aside className={`${workspaceStyles.sidebar} ${menuOpen ? workspaceStyles.sidebarOpen : ''}`}>
      <Link className={workspaceStyles.brand} href="/dashboard" onClick={() => setMenuOpen(false)}><span aria-hidden="true">◈</span> Personal Finance</Link>
      <p className={workspaceStyles.navLabel}>YOUR MONEY</p>
      <nav aria-label="Main navigation" className={workspaceStyles.nav}>
        {workspaceLinks.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
      </nav>
      <div className={workspaceStyles.sidebarFooter}>
        {error && <p className="error" role="alert">{error}</p>}
        <button className={workspaceStyles.signOut} onClick={() => void logout()}>Sign out <span aria-hidden="true">↗</span></button>
      </div>
    </aside>
    <div className={workspaceStyles.mobileBar}>
      <Link className={workspaceStyles.brand} href="/dashboard"><span aria-hidden="true">◈</span> Personal Finance</Link>
      <button aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} className={workspaceStyles.menuToggle} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? 'Close' : 'Menu'}</button>
    </div>
    <div className={workspaceStyles.content}>{children}</div>
  </div>;
}
export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<{ user: { name: string }; space: { id: string; name: string; baseCurrency: string } } | null>(null);
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
    {error ? <div className="notice" role="alert">{error} <Link href="/">Return to sign in</Link></div> : !data ? <p role="status">Loading your private space…</p> : <><div className="space-card"><span className="tag">PRIVATE</span><h2>{data.space.name}</h2><p>Your financial space is ready for income and expense records.</p><p className="muted">Financial summaries will appear as you record your money.</p><Link className={styles.categoryLink} href="/income">Record income and manage paydays →</Link><br /><Link className={styles.categoryLink} href="/categories">Manage income and expense categories →</Link></div><div className="principles"><div><h3>Keep your own record</h3><p>Track money you receive and spend through manual entries.</p></div><div><h3>Plan around your payday</h3><p>Use actual salary receipts to understand cash flow.</p></div><div><h3>Decide with confidence</h3><p>Clear calculations will support your financial decisions.</p></div></div></>}
  </section></main>;
}

type CashFlowOverview = {
  space: { id: string; name: string; baseCurrency: string };
  month: string;
  status: 'READY' | 'NOT_ENOUGH_DATA';
  income: { total: string; count: number; excludedCurrencyCount: number };
  expenses: { total: string; count: number; byCategory: { categoryId: string; category: string; total: string }[] };
  netCashFlow: string;
  budget: { limit: string; spent: string; remaining: string; allocations: { categoryId: string; category: string; limit: string; spent: string; remaining: string }[] };
};
export function CashFlowDashboard() {
  const [spaceId, setSpaceId] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('GHS');
  const [userName, setUserName] = useState('');
  const [month, setMonth] = useState(localMonth());
  const [overview, setOverview] = useState<CashFlowOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const [user, spaces] = await Promise.all([api('auth/me'), api('spaces')]);
      if (!spaces[0]) throw new Error('No financial space is available.');
      if (active) { setUserName(user.name); setSpaceId(spaces[0].id); setSpaceName(spaces[0].name); setBaseCurrency(spaces[0].baseCurrency); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load your space.'); }
  })(); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; (async () => {
    if (!spaceId || !/^\d{4}-\d{2}$/.test(month)) return;
    setOverview(null); setError('');
    try {
      const data = await api(`spaces/${spaceId}/dashboard?month=${encodeURIComponent(month)}`);
      if (active) setOverview(data);
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load your cash flow.'); }
  })(); return () => { active = false; }; }, [spaceId, month]);
  const money = (value: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: baseCurrency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
  return <main className="dashboard"><section className={workspaceStyles.dashboard}>
    <div className={workspaceStyles.dashboardHeading}><div><p className="eyebrow">PERSONAL SPACE · {baseCurrency}</p><h1>{userName ? `Welcome, ${userName}.` : 'Your cash flow'}</h1><p className="muted">{spaceName} · Confirmed income and recorded spending for the month.</p></div><label>Month<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label></div>
    {error && <p className="error" role="alert">{error}</p>}
    {!overview ? <p role="status">Loading your monthly cash flow…</p> : <>
      <div className={workspaceStyles.metrics}>
        <article className={workspaceStyles.metricCard}><span>Income received</span><strong>{money(overview.income.total)}</strong><small>{overview.income.count} confirmed record{overview.income.count === 1 ? '' : 's'}</small>{overview.income.excludedCurrencyCount > 0 && <small>{overview.income.excludedCurrencyCount} other-currency record{overview.income.excludedCurrencyCount === 1 ? '' : 's'} excluded because no conversion rate is configured.</small>}</article>
        <article className={workspaceStyles.metricCard}><span>Expenses recorded</span><strong>{money(overview.expenses.total)}</strong><small>{overview.expenses.count} transaction{overview.expenses.count === 1 ? '' : 's'}</small></article>
        <article className={workspaceStyles.metricCard}><span>Net cash flow</span><strong>{money(overview.netCashFlow)}</strong><small>Income received minus expenses</small></article>
        <article className={workspaceStyles.metricCard}><span>Budget remaining</span><strong>{overview.budget.allocations.length ? money(overview.budget.remaining) : '—'}</strong><small>{overview.budget.allocations.length ? `${money(overview.budget.spent)} spent of ${money(overview.budget.limit)} planned` : 'No category limits set'}</small></article>
      </div>
      <div className={workspaceStyles.dashboardPanels}>
        <section className={workspaceStyles.panel}><div className={workspaceStyles.panelHeading}><div><p className="eyebrow">SPENDING BREAKDOWN</p><h2>Where it went</h2></div><Link href="/expenses">View expenses</Link></div>
          {overview.expenses.byCategory.length === 0 ? <p className="muted">No expenses recorded for this month.</p> : <ul className={workspaceStyles.breakdown}>{overview.expenses.byCategory.map(row => <li key={row.categoryId}><span>{row.category}</span><strong>{money(row.total)}</strong></li>)}</ul>}
        </section>
        <section className={workspaceStyles.panel}><div className={workspaceStyles.panelHeading}><div><p className="eyebrow">MONTHLY PLAN</p><h2>Budget progress</h2></div><Link href="/budgets">Manage budgets</Link></div>
          {overview.budget.allocations.length === 0 ? <p className="muted">Set category limits to compare planned and actual spending.</p> : <ul className={workspaceStyles.breakdown}>{overview.budget.allocations.map(row => <li key={row.categoryId}><span>{row.category}<small>{money(row.spent)} of {money(row.limit)}</small></span><strong>{money(row.remaining)} left</strong></li>)}</ul>}
        </section>
      </div>
      {overview.status === 'NOT_ENOUGH_DATA' && <p className="muted">Add confirmed income or expense records to build a fuller picture of this month.</p>}
    </>}
  </section></main>;
}

type Category = { id: string; name: string; type: 'INCOME' | 'EXPENSE'; isSystem: boolean };
export function Categories() {
  const [spaceId, setSpaceId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<Category['type']>('EXPENSE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/categories`);
      if (active) { setSpaceId(spaces[0].id); setCategories(result); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load categories.'); }
  })(); return () => { active = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const category = await api(`spaces/${spaceId}/categories`, { name, type });
      setCategories(current => [...current, category].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)));
      setName(''); setMessage('Category added.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add this category.'); }
    finally { setBusy(false); }
  }
  const group = (categoryType: Category['type'], title: string, description: string) => <section className={styles.panel}>
    <h2>{title}</h2><p className="muted">{description}</p>
    <ul className={styles.list}>{categories.filter(category => category.type === categoryType).map(category => <li key={category.id}><span>{category.name}</span><span className="tag">{category.isSystem ? 'STANDARD' : 'CUSTOM'}</span></li>)}</ul>
  </section>;
  return <main className="dashboard"><header><Link className="brand" href="/dashboard">Personal Finance</Link><Link className="text-button" href="/dashboard">Back to dashboard</Link></header>
    <section className={styles.page}><p className="eyebrow">PERSONAL SPACE</p><h1>Categories</h1><p className="muted">Organize money coming in and going out. Standard categories are ready to use; add custom ones when you need them.</p>
      <form className={styles.form} onSubmit={submit}><label>Category name<input value={name} onChange={event => setName(event.target.value)} required maxLength={60} /></label><label>Type<select value={type} onChange={event => setType(event.target.value as Category['type'])}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></label><button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Add category'}</button></form>
      {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
      <div className={styles.groups}>{group('EXPENSE', 'Expenses', 'Costs you record against your monthly cash flow.')}{group('INCOME', 'Income', 'Salary and other money received.')}</div>
    </section>
  </main>;
}

type IncomeSourceType = 'SALARY' | 'SELF_EMPLOYMENT' | 'BUSINESS' | 'INVESTMENT' | 'GIFT' | 'OTHER';
type PaydayStatus = 'UPCOMING' | 'AWAITING_CONFIRMATION' | 'OVERDUE' | 'RECEIVED';
type IncomeRecord = { id: string; amount: string; receivedDate: string; periodYear: number | null; periodMonth: number | null };
type IncomeSource = {
  id: string;
  name: string;
  type: IncomeSourceType;
  expectedAmount: string | null;
  currencyCode: string;
  possiblePaydays: { dayOfMonth: number; adjustmentRule: string }[];
  currentPeriod: { year: number; month: number; possibleDates: string[]; status: PaydayStatus; record: IncomeRecord | null } | null;
  recentRecords: IncomeRecord[];
};
const incomeSourceLabels: Record<IncomeSourceType, string> = {
  SALARY: 'Salary', SELF_EMPLOYMENT: 'Self-employment', BUSINESS: 'Business', INVESTMENT: 'Investment', GIFT: 'Gifts and support', OTHER: 'Other income',
};
const paydayStatusLabels: Record<PaydayStatus, string> = {
  UPCOMING: 'Before the first possible payday',
  AWAITING_CONFIRMATION: 'Possible payday reached — still awaiting confirmation',
  OVERDUE: 'Past the final possible payday',
  RECEIVED: 'Received this month',
};
function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function localMonth() { return localDate().slice(0, 7); }

export function Income() {
  const [spaceId, setSpaceId] = useState('');
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [sourceType, setSourceType] = useState<IncomeSourceType>('SALARY');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const spaces = await api('spaces');
        if (!spaces[0]) throw new Error('No financial space is available.');
        const result = await api(`spaces/${spaces[0].id}/income-sources`);
        if (active) { setSpaceId(spaces[0].id); setSources(result); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load income.'); }
    })();
    return () => { active = false; };
  }, []);
  async function reload() {
    if (!spaceId) return;
    const result = await api(`spaces/${spaceId}/income-sources`);
    setSources(result);
  }
  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const paydayDays = sourceType === 'SALARY'
      ? String(form.get('paydayDays') ?? '').split(',').map(value => value.trim()).filter(Boolean).map(Number)
      : [];
    try {
      await api(`spaces/${spaceId}/income-sources`, {
        name: String(form.get('name')),
        type: sourceType,
        expectedAmount: String(form.get('expectedAmount') ?? '').trim() || undefined,
        currencyCode: String(form.get('currencyCode') ?? 'GHS').trim().toUpperCase(),
        paydayDays,
        adjustmentRule: String(form.get('adjustmentRule') ?? 'NO_ADJUSTMENT'),
      });
      await reload(); formElement.reset(); setSourceType('SALARY'); setMessage('Income source added.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add this income source.'); }
    finally { setBusy(false); }
  }
  async function recordIncome(event: FormEvent<HTMLFormElement>, source: IncomeSource) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string | number> = {
      amount: String(form.get('amount') ?? '').trim(),
      receivedDate: String(form.get('receivedDate') ?? ''),
    };
    if (source.type === 'SALARY') {
      const period = String(form.get('period') ?? '');
      const [year, month] = period.split('-').map(Number);
      payload.periodYear = year;
      payload.periodMonth = month;
    }
    try {
      await api(`spaces/${spaceId}/income-sources/${source.id}/records`, payload);
      await reload(); formElement.reset(); setMessage(source.type === 'SALARY' ? 'Salary receipt confirmed.' : 'Income recorded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record this income.'); }
    finally { setBusy(false); }
  }
  return <main className="dashboard"><header><Link className="brand" href="/dashboard">Personal Finance</Link><Link className="text-button" href="/dashboard">Back to dashboard</Link></header>
    <section className={incomeStyles.page}><p className="eyebrow">PERSONAL SPACE</p><h1>Income</h1><p className="muted">Track income sources and confirm salary only when it reaches you. Flexible payday dates stay open until the final possible date passes.</p><p><Link className={styles.categoryLink} href="/payday">Set up your payday routine →</Link></p>
      {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
      <section className={incomeStyles.panel}><h2>Add an income source</h2><form className={incomeStyles.form} onSubmit={createSource}>
        <label>Source name<input name="name" required maxLength={100} placeholder="e.g. Main employer" /></label>
        <label>Income type<select name="type" value={sourceType} onChange={event => setSourceType(event.target.value as IncomeSourceType)}>{Object.entries(incomeSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Expected amount<input name="expectedAmount" type="number" min="0.0001" step="0.0001" placeholder={sourceType === 'SALARY' ? 'Required for salary' : 'Optional'} required={sourceType === 'SALARY'} /></label>
        <label>Currency<input name="currencyCode" defaultValue="GHS" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" /></label>
        {sourceType === 'SALARY' && <>
          <label>Possible payday dates<input name="paydayDays" required placeholder="25, 26, 27, 28" inputMode="numeric" pattern="[0-9, ]+" /><small>Enter one or more day numbers in the month.</small></label>
          <label>Weekend adjustment<select name="adjustmentRule" defaultValue="NO_ADJUSTMENT"><option value="NO_ADJUSTMENT">Keep the configured date</option><option value="PREVIOUS_WORKING_DAY">Move weekend dates earlier</option><option value="NEXT_WORKING_DAY">Move weekend dates later</option></select></label>
        </>}
        <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Add income source'} <span aria-hidden>→</span></button>
      </form></section>
      <div className={incomeStyles.sources}>
        {sources.map(source => <article className={incomeStyles.panel} key={source.id}>
          <div className={incomeStyles.sourceHeading}><div><span className="eyebrow">{incomeSourceLabels[source.type]}</span><h2>{source.name}</h2></div>{source.expectedAmount && <span className="tag">Expected {source.currencyCode} {source.expectedAmount}</span>}</div>
          {source.currentPeriod && <div className={incomeStyles.payday}><strong>{paydayStatusLabels[source.currentPeriod.status]}</strong><p>Possible dates this month: {source.currentPeriod.possibleDates.join(', ') || 'not configured'}</p></div>}
          <form className={incomeStyles.recordForm} onSubmit={event => void recordIncome(event, source)}>
            <label>{source.type === 'SALARY' ? 'Actual salary received' : 'Income received'}<input name="amount" type="number" min="0.0001" step="0.0001" required placeholder="Amount received" /></label>
            <label>Received date<input name="receivedDate" type="date" defaultValue={localDate()} required /></label>
            {source.type === 'SALARY' && <label>Salary period<input name="period" type="month" defaultValue={localMonth()} required /></label>}
            <button disabled={busy}>{source.type === 'SALARY' ? 'Confirm salary' : 'Record income'}</button>
          </form>
          {source.recentRecords.length > 0 && <div className={incomeStyles.history}><h3>Recent receipts</h3><ul>{source.recentRecords.map(record => <li key={record.id}><span>{record.receivedDate}</span><strong>{source.currencyCode} {record.amount}</strong></li>)}</ul></div>}
        </article>)}
        {sources.length === 0 && <p className="muted">No income sources yet. Add salary, self-employment, business, or another source above.</p>}
      </div>
    </section>
  </main>;
}

type ExpenseCategory = { id: string; name: string; type: 'INCOME' | 'EXPENSE'; isSystem: boolean };
type ExpenseRecord = { id: string; category: { id: string; name: string }; amount: string; currencyCode: string; spentAt: string; description: string | null };
type ExpenseList = { month: string; currencyCode: string; total: string; records: ExpenseRecord[] };
export function Expenses() {
  const [spaceId, setSpaceId] = useState('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [month, setMonth] = useState(localMonth());
  const [data, setData] = useState<ExpenseList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const availableCategories = await api(`spaces/${spaces[0].id}/categories`);
      if (active) { setSpaceId(spaces[0].id); setCategories(availableCategories.filter((category: ExpenseCategory) => category.type === 'EXPENSE')); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load expenses.'); }
  })(); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; (async () => {
    if (!spaceId || !/^\d{4}-\d{2}$/.test(month)) return;
    setError('');
    try {
      const result = await api(`spaces/${spaceId}/expenses?month=${encodeURIComponent(month)}`);
      if (active) setData(result);
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load expenses.'); }
  })(); return () => { active = false; }; }, [spaceId, month]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const spentAt = String(form.get('spentAt') ?? '');
    try {
      await api(`spaces/${spaceId}/expenses`, {
        categoryId: String(form.get('categoryId') ?? ''),
        amount: String(form.get('amount') ?? '').trim(),
        spentAt,
        description: String(form.get('description') ?? '').trim() || undefined,
      });
      formElement.reset();
      setMessage('Expense recorded.');
      const recordedMonth = spentAt.slice(0, 7);
      if (recordedMonth !== month) setMonth(recordedMonth);
      else {
        try {
          const result = await api(`spaces/${spaceId}/expenses?month=${encodeURIComponent(month)}`);
          setData(result);
        } catch { setError('Expense saved, but the monthly list could not refresh.'); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record this expense.'); }
    finally { setBusy(false); }
  }
  const currency = data?.currencyCode ?? 'GHS';
  const money = (value: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
  return <main className="dashboard"><section className={`${expenseStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE</p><h1>Expenses</h1><p className="muted">Record what you spend, choose a category, and review your monthly total.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={expenseStyles.panel}><h2>Record an expense</h2>
      {categories.length === 0 ? <p className="muted">Add an expense category first, then you can record spending. <Link href="/categories">Manage categories</Link></p> : <form className={expenseStyles.form} onSubmit={submit}>
        <label>Amount ({currency})<input name="amount" type="number" min="0.0001" step="0.0001" required placeholder="0.00" /></label>
        <label>Category<select name="categoryId" required defaultValue=""><option value="" disabled>Choose a category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Date<input name="spentAt" type="date" defaultValue={localDate()} max={localDate()} required /></label>
        <label>Description <span className={expenseStyles.optional}>(optional)</span><input name="description" maxLength={240} placeholder="What was this for?" /></label>
        <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Save expense'} <span aria-hidden="true">→</span></button>
      </form>}
    </section>
    <section className={expenseStyles.panel}>
      <div className={expenseStyles.listHeading}><div><p className="eyebrow">MONTHLY SPENDING</p><h2>{data ? money(data.total) : '—'}</h2></div><label>Month<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label></div>
      {!data ? <p role="status">Loading expenses…</p> : data.records.length === 0 ? <p className="muted">No expenses recorded for this month.</p> : <ul className={expenseStyles.records}>{data.records.map(record => <li key={record.id}><div><strong>{record.category.name}</strong><span>{record.spentAt}{record.description ? ` · ${record.description}` : ''}</span></div><strong>{money(record.amount)}</strong></li>)}</ul>}
    </section>
  </section></main>;
}

type RecurringFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';
type RecurringItem = {
  id: string; name: string; flow: 'INCOME' | 'EXPENSE'; amount: string; currencyCode: string;
  frequency: RecurringFrequency; startDate: string; nextDueDate: string; endDate: string | null;
  isActive: boolean; isDue: boolean; category: { id: string; name: string } | null; source: { id: string; name: string } | null;
};
const recurrenceLabels: Record<RecurringFrequency, string> = { WEEKLY: 'Every week', BIWEEKLY: 'Every two weeks', MONTHLY: 'Every month', YEARLY: 'Every year' };
export function RecurringRecords() {
  const [spaceId, setSpaceId] = useState('');
  const [flow, setFlow] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [categories, setCategories] = useState<Category[]>([]);
  const [sources, setSources] = useState<{ id: string; name: string; type: IncomeSourceType; currencyCode: string }[]>([]);
  const [records, setRecords] = useState<RecurringItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const [categoryList, incomeSources] = await Promise.all([api(`spaces/${spaces[0].id}/categories`), api(`spaces/${spaces[0].id}/income-sources`)]);
      if (active) { setSpaceId(spaces[0].id); setCategories(categoryList); setSources(incomeSources.filter((source: { type: IncomeSourceType; currencyCode: string }) => source.type !== 'SALARY' && source.currencyCode.trim() === spaces[0].baseCurrency.trim())); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load recurring records.'); }
  })(); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; (async () => {
    if (!spaceId) return;
    try { const result = await api(`spaces/${spaceId}/recurring-records`); if (active) setRecords(result); }
    catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load recurring records.'); }
  })(); return () => { active = false; }; }, [spaceId]);
  async function reload() { if (spaceId) setRecords(await api(`spaces/${spaceId}/recurring-records`)); }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      name: String(form.get('name') ?? '').trim(), flow,
      amount: String(form.get('amount') ?? '').trim(), frequency: String(form.get('frequency') ?? 'MONTHLY'),
      startDate: String(form.get('startDate') ?? ''),
    };
    const endDate = String(form.get('endDate') ?? '');
    if (endDate) payload.endDate = endDate;
    if (flow === 'EXPENSE') payload.categoryId = String(form.get('categoryId') ?? '');
    else payload.sourceId = String(form.get('sourceId') ?? '');
    try { await api(`spaces/${spaceId}/recurring-records`, payload); await reload(); formElement.reset(); setMessage('Recurring record added.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this recurring record.'); }
    finally { setBusy(false); }
  }
  async function recordOccurrence(event: FormEvent<HTMLFormElement>, record: RecurringItem) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const actualDate = String(new FormData(event.currentTarget).get('actualDate') ?? '');
    try { await api(`spaces/${spaceId}/recurring-records/${record.id}/record`, { actualDate }); await reload(); setMessage(`${record.flow === 'EXPENSE' ? 'Expense' : 'Income'} recorded from this recurring item.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to record this occurrence.'); }
    finally { setBusy(false); }
  }
  async function toggle(record: RecurringItem) {
    setBusy(true); setError(''); setMessage('');
    try { await api(`spaces/${spaceId}/recurring-records/${record.id}/status`, { isActive: !record.isActive }); await reload(); setMessage(record.isActive ? 'Recurring record paused.' : 'Recurring record resumed.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update this recurring record.'); }
    finally { setBusy(false); }
  }
  const currency = 'GHS';
  const money = (record: RecurringItem) => new Intl.NumberFormat(undefined, { style: 'currency', currency: record.currencyCode || currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(record.amount));
  return <main className="dashboard"><section className={`${recurringStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE</p><h1>Recurring records</h1><p className="muted">Set a schedule for regular income or expenses. Nothing enters your actual cash flow until you confirm it happened.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={recurringStyles.panel}><h2>Add a recurring record</h2><form className={recurringStyles.form} onSubmit={create}>
      <label>Name<input name="name" required maxLength={100} placeholder={flow === 'EXPENSE' ? 'e.g. Monthly rent' : 'e.g. Rental income'} /></label>
      <label>Flow<select value={flow} onChange={event => setFlow(event.target.value as 'EXPENSE' | 'INCOME')}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></label>
      <label>Amount<input name="amount" type="number" min="0.0001" step="0.0001" required placeholder="0.00" /></label>
      {flow === 'EXPENSE' ? <label>Category<select name="categoryId" required defaultValue=""><option value="" disabled>Choose a category</option>{categories.filter(category => category.type === 'EXPENSE').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : <label>Income source<select name="sourceId" required defaultValue=""><option value="" disabled>Choose a source</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name} ({source.currencyCode})</option>)}</select><small>Salary uses the flexible payday tracker. <Link href="/income">Add a non-salary source</Link> if none is listed.</small></label>}
      <label>Repeat<select name="frequency" defaultValue="MONTHLY">{Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>First due date<input name="startDate" type="date" defaultValue={localDate()} required /></label>
      <label>End date <span className={recurringStyles.optional}>(optional)</span><input name="endDate" type="date" /></label>
      <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Add schedule'} <span aria-hidden="true">→</span></button>
    </form></section>
    <div className={recurringStyles.records}>{records.map(record => <article className={recurringStyles.panel} key={record.id}>
      <div className={recurringStyles.recordHeading}><div><span className="eyebrow">{record.flow === 'EXPENSE' ? 'EXPENSE' : 'INCOME'} · {recurrenceLabels[record.frequency]}</span><h2>{record.name}</h2><p className="muted">{record.category?.name ?? record.source?.name} · Next due {record.nextDueDate}</p></div><div className={recurringStyles.recordAmount}><strong>{money(record)}</strong><span className="tag">{!record.isActive ? 'PAUSED' : record.isDue ? 'DUE' : 'UPCOMING'}</span></div></div>
      {record.isActive && record.isDue && <form className={recurringStyles.confirmForm} onSubmit={event => void recordOccurrence(event, record)}><label>Actual date<input name="actualDate" type="date" defaultValue={localDate()} max={localDate()} min={record.startDate} required /></label><button disabled={busy}>{record.flow === 'EXPENSE' ? 'Confirm expense paid' : 'Confirm income received'}</button></form>}
      <button className={recurringStyles.pauseButton} disabled={busy} onClick={() => void toggle(record)}>{record.isActive ? 'Pause schedule' : 'Resume schedule'}</button>
    </article>)}{records.length === 0 && <p className="muted">No recurring records yet. Set a schedule above for a regular bill or a non-salary income source.</p>}</div>
  </section></main>;
}

type BudgetAllocation = { id: string; categoryId: string; category: { id: string; name: string }; limit: string; spent: string; remaining: string };
type BudgetList = { month: string; currencyCode: string; totalLimit: string; totalSpent: string; allocations: BudgetAllocation[] };
export function Budgets() {
  const [spaceId, setSpaceId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [month, setMonth] = useState(localMonth());
  const [data, setData] = useState<BudgetList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const categoryList = await api(`spaces/${spaces[0].id}/categories`);
      if (active) { setSpaceId(spaces[0].id); setCategories(categoryList); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load budgets.'); }
  })(); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; (async () => {
    if (!spaceId || !/^\d{4}-\d{2}$/.test(month)) return;
    setError('');
    try { const result = await api(`spaces/${spaceId}/budgets?month=${encodeURIComponent(month)}`); if (active) setData(result); }
    catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load budgets.'); }
  })(); return () => { active = false; }; }, [spaceId, month]);
  async function reload() { if (spaceId) setData(await api(`spaces/${spaceId}/budgets?month=${encodeURIComponent(month)}`)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`spaces/${spaceId}/budgets/allocations`, { month, categoryId: String(form.get('categoryId') ?? ''), limitAmount: String(form.get('limitAmount') ?? '').trim() });
      await reload(); formElement.reset(); setMessage('Budget limit saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this budget.'); }
    finally { setBusy(false); }
  }
  const currency = data?.currencyCode ?? 'GHS';
  const money = (value: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
  return <main className="dashboard"><section className={`${budgetStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE</p><h1>Monthly budgets</h1><p className="muted">Set a spending limit for each category and compare it with recorded expenses.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={budgetStyles.panel}><div className={budgetStyles.heading}><div><h2>Plan this month</h2><p className="muted">{data ? money(data.totalSpent) : '—'} spent against {data ? money(data.totalLimit) : '—'} planned</p></div><label>Month<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label></div>
      <form className={budgetStyles.form} onSubmit={submit}><label>Expense category<select name="categoryId" required defaultValue=""><option value="" disabled>Choose a category</option>{categories.filter(category => category.type === 'EXPENSE').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Monthly limit ({currency})<input name="limitAmount" type="number" min="0.0001" step="0.0001" required placeholder="0.00" /></label><button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Set budget limit'}</button></form>
    </section>
    <section className={budgetStyles.panel}><h2>Category budgets</h2>
      {!data ? <p role="status">Loading budgets…</p> : data.allocations.length === 0 ? <p className="muted">No limits set for this month. Start with a category you want to keep an eye on.</p> : <ul className={budgetStyles.list}>{data.allocations.map(allocation => {
        const percent = Number(allocation.limit) > 0 ? Math.max(0, Math.min(100, Number(allocation.spent) / Number(allocation.limit) * 100)) : 0;
        return <li key={allocation.id}><div className={budgetStyles.allocationHeading}><strong>{allocation.category.name}</strong><span>{money(allocation.spent)} of {money(allocation.limit)}</span></div><progress value={percent} max="100" aria-label={`${allocation.category.name} budget used`} /><small>{Number(allocation.remaining) < 0 ? `${money(String(-Number(allocation.remaining)))} over budget` : `${money(allocation.remaining)} remaining`}</small></li>;
      })}</ul>}
    </section>
  </section></main>;
}

type SavingsTransaction = {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: string;
  transactionDate: string;
  description: string | null;
};
type SavingsAccount = {
  id: string;
  name: string;
  provider: string | null;
  currencyCode: string;
  openingBalance: string;
  openedAt: string;
  balance: string;
  transactions: SavingsTransaction[];
};
type SavingsOverview = { baseCurrency: string; totalsByCurrency: Record<string, string>; accounts: SavingsAccount[] };
export function Savings() {
  const [spaceId, setSpaceId] = useState('');
  const [data, setData] = useState<SavingsOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/savings-accounts`);
      if (active) { setSpaceId(spaces[0].id); setData(result); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load savings accounts.'); }
  })(); return () => { active = false; }; }, []);
  async function reload() {
    if (spaceId) setData(await api(`spaces/${spaceId}/savings-accounts`));
  }
  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      name: String(form.get('name') ?? '').trim(),
      currencyCode: String(form.get('currencyCode') ?? data?.baseCurrency ?? 'GHS').trim().toUpperCase(),
      openingBalance: String(form.get('openingBalance') ?? '0').trim() || '0',
      openedAt: String(form.get('openedAt') ?? localDate()),
    };
    const provider = String(form.get('provider') ?? '').trim();
    if (provider) payload.provider = provider;
    try { await api(`spaces/${spaceId}/savings-accounts`, payload); await reload(); formElement.reset(); setMessage('Savings account added.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this account.'); }
    finally { setBusy(false); }
  }
  async function recordTransaction(event: FormEvent<HTMLFormElement>, account: SavingsAccount) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const type = String(form.get('type') ?? 'DEPOSIT') as SavingsTransaction['type'];
    const payload: Record<string, string> = {
      type,
      amount: String(form.get('amount') ?? '').trim(),
      transactionDate: String(form.get('transactionDate') ?? ''),
    };
    const description = String(form.get('description') ?? '').trim();
    if (description) payload.description = description;
    try {
      await api(`spaces/${spaceId}/savings-accounts/${account.id}/transactions`, payload);
      await reload(); formElement.reset(); setMessage(type === 'DEPOSIT' ? 'Deposit recorded.' : 'Withdrawal recorded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this transaction.'); }
    finally { setBusy(false); }
  }
  function money(value: string, currency: string) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value)); }
    catch { return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value))}`; }
  }
  return <main className="dashboard"><section className={`${savingsStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE</p><h1>Savings</h1><p className="muted">Track savings balances with dated deposits and withdrawals. Entries stay in your chosen account currency; this tracker does not move or hold money.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={savingsStyles.panel}><h2>Add a savings account</h2><form className={savingsStyles.accountForm} onSubmit={createAccount}>
      <label>Account name<input name="name" required maxLength={100} placeholder="e.g. Emergency savings" /></label>
      <label>Bank or provider <span className={savingsStyles.optional}>(optional)</span><input name="provider" maxLength={100} placeholder="e.g. Your bank or mobile money wallet" /></label>
      <label>Currency<input name="currencyCode" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={data?.baseCurrency ?? 'GHS'} /></label>
      <label>Current opening balance<input name="openingBalance" type="number" min="0" step="0.0001" defaultValue="0" required /></label>
      <label>Balance as of<input name="openedAt" type="date" defaultValue={localDate()} max={localDate()} required /></label>
      <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Add account'} <span aria-hidden="true">→</span></button>
    </form></section>
    <section className={savingsStyles.panel}>
      <div className={savingsStyles.summaryHeading}><div><p className="eyebrow">SAVINGS BALANCES</p><h2>Your accounts</h2></div></div>
      {!data ? <p role="status">Loading savings…</p> : data.accounts.length === 0 ? <p className="muted">No savings accounts yet. Add an account above to start tracking a balance.</p> : <>
        <div className={savingsStyles.totals}>{Object.entries(data.totalsByCurrency).map(([currency, total]) => <div key={currency}><span>Total tracked in {currency}</span><strong>{money(total, currency)}</strong></div>)}</div>
        <div className={savingsStyles.accounts}>{data.accounts.map(account => <article className={savingsStyles.account} key={account.id}>
          <div className={savingsStyles.accountHeading}><div><span className="eyebrow">SAVINGS ACCOUNT · {account.currencyCode}</span><h3>{account.name}</h3><p className="muted">{account.provider ? `${account.provider} · ` : ''}Balance as of {account.openedAt}</p></div><strong>{money(account.balance, account.currencyCode)}</strong></div>
          <form className={savingsStyles.transactionForm} onSubmit={event => void recordTransaction(event, account)}>
            <label>Transaction<select name="type" defaultValue="DEPOSIT"><option value="DEPOSIT">Deposit</option><option value="WITHDRAWAL">Withdrawal</option></select></label>
            <label>Amount ({account.currencyCode})<input name="amount" type="number" min="0.0001" step="0.0001" placeholder="0.00" required /></label>
            <label>Date<input name="transactionDate" type="date" defaultValue={localDate()} max={localDate()} min={account.openedAt} required /></label>
            <label>Description <span className={savingsStyles.optional}>(optional)</span><input name="description" maxLength={240} placeholder="Add a note" /></label>
            <button disabled={busy}>{busy ? 'Saving…' : 'Record transaction'}</button>
          </form>
          <div className={savingsStyles.activityHeading}><h4>Recent activity</h4><span>Opening balance {money(account.openingBalance, account.currencyCode)}</span></div>
          {account.transactions.length === 0 ? <p className="muted">No deposits or withdrawals recorded yet.</p> : <ul className={savingsStyles.transactions}>{account.transactions.map(transaction => <li key={transaction.id}>
            <div><strong>{transaction.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}</strong><span>{transaction.transactionDate}{transaction.description ? ` · ${transaction.description}` : ''}</span></div>
            <strong className={transaction.type === 'DEPOSIT' ? savingsStyles.deposit : savingsStyles.withdrawal}>{transaction.type === 'DEPOSIT' ? '+' : '−'}{money(transaction.amount, account.currencyCode)}</strong>
          </li>)}</ul>}
        </article>)}</div>
      </>}
    </section>
  </section></main>;
}

type LiabilityPayment = {
  id: string;
  amount: string;
  principalAmount: string;
  interestAndFeesAmount: string;
  paidAt: string;
  description: string | null;
};
type LiabilityItem = {
  id: string;
  type: 'CREDIT_CARD' | 'PERSONAL_LOAN' | 'MORTGAGE' | 'STUDENT_LOAN' | 'AUTO_LOAN' | 'BUY_NOW_PAY_LATER' | 'OTHER';
  name: string;
  provider: string | null;
  currencyCode: string;
  originalAmount: string;
  openingBalance: string;
  principalPaid: string;
  outstandingBalance: string;
  annualInterestRate: string;
  monthlyPayment: string | null;
  startDate: string;
  expectedPayoffDate: string | null;
  status: 'ACTIVE' | 'PAID_OFF';
  payments: LiabilityPayment[];
};
type LiabilityOverview = { baseCurrency: string; totalsByCurrency: Record<string, string>; liabilities: LiabilityItem[] };
const liabilityTypeLabels: Record<LiabilityItem['type'], string> = {
  CREDIT_CARD: 'Credit card', PERSONAL_LOAN: 'Personal loan', MORTGAGE: 'Mortgage', STUDENT_LOAN: 'Student loan',
  AUTO_LOAN: 'Auto loan', BUY_NOW_PAY_LATER: 'Buy now, pay later', OTHER: 'Other debt',
};
export function Liabilities() {
  const [spaceId, setSpaceId] = useState('');
  const [data, setData] = useState<LiabilityOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/liabilities`);
      if (active) { setSpaceId(spaces[0].id); setData(result); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load liabilities.'); }
  })(); return () => { active = false; }; }, []);
  async function reload() {
    if (spaceId) setData(await api(`spaces/${spaceId}/liabilities`));
  }
  async function createLiability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      type: String(form.get('type') ?? 'PERSONAL_LOAN'),
      name: String(form.get('name') ?? '').trim(),
      currencyCode: String(form.get('currencyCode') ?? data?.baseCurrency ?? 'GHS').trim().toUpperCase(),
      originalAmount: String(form.get('originalAmount') ?? '').trim(),
      openingBalance: String(form.get('openingBalance') ?? '').trim(),
      annualInterestRate: String(form.get('annualInterestRate') ?? '0').trim() || '0',
      startDate: String(form.get('startDate') ?? ''),
    };
    const provider = String(form.get('provider') ?? '').trim();
    const monthlyPayment = String(form.get('monthlyPayment') ?? '').trim();
    const expectedPayoffDate = String(form.get('expectedPayoffDate') ?? '').trim();
    if (provider) payload.provider = provider;
    if (monthlyPayment) payload.monthlyPayment = monthlyPayment;
    if (expectedPayoffDate) payload.expectedPayoffDate = expectedPayoffDate;
    try { await api(`spaces/${spaceId}/liabilities`, payload); await reload(); formElement.reset(); setMessage('Liability added.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this liability.'); }
    finally { setBusy(false); }
  }
  async function recordPayment(event: FormEvent<HTMLFormElement>, liability: LiabilityItem) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      amount: String(form.get('amount') ?? '').trim(),
      paidAt: String(form.get('paidAt') ?? ''),
    };
    const principalAmount = String(form.get('principalAmount') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    if (principalAmount) payload.principalAmount = principalAmount;
    if (description) payload.description = description;
    try { await api(`spaces/${spaceId}/liabilities/${liability.id}/payments`, payload); await reload(); formElement.reset(); setMessage('Repayment recorded.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this repayment.'); }
    finally { setBusy(false); }
  }
  function money(value: string, currency: string) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value)); }
    catch { return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value))}`; }
  }
  return <main className="dashboard"><section className={`${liabilityStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE</p><h1>Liabilities</h1><p className="muted">Track debts and repayments. Enter the principal portion of each payment to update the outstanding balance; interest and fees are recorded separately and are not accrued automatically.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={liabilityStyles.panel}><h2>Add a liability</h2><form className={liabilityStyles.liabilityForm} onSubmit={createLiability}>
      <label>Debt type<select name="type" defaultValue="PERSONAL_LOAN">{Object.entries(liabilityTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Name<input name="name" required maxLength={100} placeholder="e.g. Education loan" /></label>
      <label>Lender <span className={liabilityStyles.optional}>(optional)</span><input name="provider" maxLength={100} placeholder="Bank or lender" /></label>
      <label>Currency<input name="currencyCode" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={data?.baseCurrency ?? 'GHS'} /></label>
      <label>Original amount<input name="originalAmount" type="number" min="0.0001" step="0.0001" required /></label>
      <label>Balance when tracking starts<input name="openingBalance" type="number" min="0" step="0.0001" required /></label>
      <label>Annual interest rate (%)<input name="annualInterestRate" type="number" min="0" max="100" step="0.0001" defaultValue="0" required /></label>
      <label>Expected monthly payment <span className={liabilityStyles.optional}>(optional)</span><input name="monthlyPayment" type="number" min="0.0001" step="0.0001" /></label>
      <label>Debt start date<input name="startDate" type="date" max={localDate()} required /></label>
      <label>Expected payoff date <span className={liabilityStyles.optional}>(optional)</span><input name="expectedPayoffDate" type="date" /></label>
      <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Add liability'} <span aria-hidden="true">→</span></button>
    </form></section>
    <section className={liabilityStyles.panel}>
      <div className={liabilityStyles.summaryHeading}><div><p className="eyebrow">OUTSTANDING BALANCES</p><h2>Your liabilities</h2></div></div>
      {!data ? <p role="status">Loading liabilities…</p> : data.liabilities.length === 0 ? <p className="muted">No liabilities yet. Add a debt above to begin tracking its repayment progress.</p> : <>
        <div className={liabilityStyles.totals}>{Object.entries(data.totalsByCurrency).map(([currency, total]) => <div key={currency}><span>Total outstanding in {currency}</span><strong>{money(total, currency)}</strong></div>)}</div>
        <div className={liabilityStyles.liabilities}>{data.liabilities.map(liability => <article className={liabilityStyles.liability} key={liability.id}>
          <div className={liabilityStyles.liabilityHeading}><div><span className="eyebrow">{liabilityTypeLabels[liability.type]} · {liability.currencyCode}</span><h3>{liability.name}</h3><p className="muted">{liability.provider ? `${liability.provider} · ` : ''}Started {liability.startDate}{liability.expectedPayoffDate ? ` · Expected payoff ${liability.expectedPayoffDate}` : ''}</p></div><div className={liabilityStyles.balance}><strong>{money(liability.outstandingBalance, liability.currencyCode)}</strong><span className="tag">{liability.status === 'PAID_OFF' ? 'PAID OFF' : 'ACTIVE'}</span></div></div>
          <div className={liabilityStyles.details}><span>Original {money(liability.originalAmount, liability.currencyCode)}</span><span>Rate {liability.annualInterestRate}% yearly</span>{liability.monthlyPayment && <span>Planned monthly payment {money(liability.monthlyPayment, liability.currencyCode)}</span>}</div>
          {liability.status === 'ACTIVE' && <form className={liabilityStyles.paymentForm} onSubmit={event => void recordPayment(event, liability)}>
            <label>Total paid ({liability.currencyCode})<input name="amount" type="number" min="0.0001" step="0.0001" required /></label>
            <label>Principal portion <span className={liabilityStyles.optional}>(optional)</span><input name="principalAmount" type="number" min="0" step="0.0001" placeholder="Defaults to total paid" /></label>
            <label>Payment date<input name="paidAt" type="date" defaultValue={localDate()} max={localDate()} min={liability.startDate} required /></label>
            <label>Description <span className={liabilityStyles.optional}>(optional)</span><input name="description" maxLength={240} placeholder="Add a note" /></label>
            <p className={liabilityStyles.hint}>The remainder of the total is recorded as interest and fees. Payments are tracking entries only; no money is moved.</p>
            <button disabled={busy}>{busy ? 'Saving…' : 'Record repayment'}</button>
          </form>}
          <div className={liabilityStyles.activityHeading}><h4>Repayment history</h4><span>Principal paid {money(liability.principalPaid, liability.currencyCode)}</span></div>
          {liability.payments.length === 0 ? <p className="muted">No repayments recorded yet.</p> : <ul className={liabilityStyles.payments}>{liability.payments.map(payment => <li key={payment.id}>
            <div><strong>Payment · {payment.paidAt}</strong><span>Principal {money(payment.principalAmount, liability.currencyCode)} · Interest and fees {money(payment.interestAndFeesAmount, liability.currencyCode)}{payment.description ? ` · ${payment.description}` : ''}</span></div><strong>{money(payment.amount, liability.currencyCode)}</strong>
          </li>)}</ul>}
        </article>)}</div>
      </>}
    </section>
  </section></main>;
}

type GoalContribution = {
  id: string;
  type: 'CONTRIBUTION' | 'WITHDRAWAL';
  amount: string;
  contributionDate: string;
  description: string | null;
};
type FinancialGoal = {
  id: string;
  name: string;
  description: string | null;
  currencyCode: string;
  targetAmount: string;
  currentAmount: string;
  remainingAmount: string;
  progressPercent: number;
  targetDate: string | null;
  isCompleted: boolean;
  contributions: GoalContribution[];
};
export function Goals() {
  const [spaceId, setSpaceId] = useState('');
  const [goals, setGoals] = useState<FinancialGoal[] | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('GHS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/goals`);
      if (active) { setSpaceId(spaces[0].id); setBaseCurrency(spaces[0].baseCurrency); setGoals(result.goals); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load financial goals.'); }
  })(); return () => { active = false; }; }, []);
  async function reload() {
    if (!spaceId) return;
    const result = await api(`spaces/${spaceId}/goals`);
    setGoals(result.goals);
  }
  function money(value: string, currency: string) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value)); }
    catch { return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value))}`; }
  }
  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      name: String(form.get('name') ?? '').trim(),
      targetAmount: String(form.get('targetAmount') ?? '').trim(),
      currencyCode: String(form.get('currencyCode') ?? baseCurrency).trim().toUpperCase(),
    };
    const description = String(form.get('description') ?? '').trim();
    const targetDate = String(form.get('targetDate') ?? '').trim();
    if (description) payload.description = description;
    if (targetDate) payload.targetDate = targetDate;
    try { await api(`spaces/${spaceId}/goals`, payload); await reload(); formElement.reset(); setMessage('Financial goal created.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this goal.'); }
    finally { setBusy(false); }
  }
  async function recordContribution(event: FormEvent<HTMLFormElement>, goal: FinancialGoal) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      type: String(form.get('type') ?? 'CONTRIBUTION'),
      amount: String(form.get('amount') ?? '').trim(),
      contributionDate: String(form.get('contributionDate') ?? ''),
    };
    const description = String(form.get('description') ?? '').trim();
    if (description) payload.description = description;
    try {
      await api(`spaces/${spaceId}/goals/${goal.id}/contributions`, payload);
      await reload(); formElement.reset(); setMessage(payload.type === 'CONTRIBUTION' ? 'Goal contribution recorded.' : 'Goal withdrawal recorded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update this goal.'); }
    finally { setBusy(false); }
  }
  return <main className="dashboard"><section className={`${goalStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE</p><h1>Financial goals</h1><p className="muted">Set targets and track your progress with dated contributions. These are tracking entries only; they do not move money between accounts.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={goalStyles.panel}><h2>Create a goal</h2><form className={goalStyles.goalForm} onSubmit={createGoal}>
      <label>Goal name<input name="name" required maxLength={100} placeholder="e.g. Emergency fund" /></label>
      <label>Target amount<input name="targetAmount" type="number" min="0.0001" step="0.0001" required /></label>
      <label>Currency<input name="currencyCode" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={baseCurrency} /></label>
      <label>Target date <span className={goalStyles.optional}>(optional)</span><input name="targetDate" type="date" /></label>
      <label className={goalStyles.fullWidth}>Description <span className={goalStyles.optional}>(optional)</span><input name="description" maxLength={500} placeholder="What are you saving for?" /></label>
      <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Create goal'} <span aria-hidden="true">→</span></button>
    </form></section>
    <section className={goalStyles.panel}>
      <div className={goalStyles.summaryHeading}><div><p className="eyebrow">YOUR TARGETS</p><h2>Progress</h2></div></div>
      {goals === null ? <p role="status">Loading goals…</p> : goals.length === 0 ? <p className="muted">No goals yet. Create a target above to start tracking progress.</p> : <div className={goalStyles.goals}>{goals.map(goal => <article className={goalStyles.goal} key={goal.id}>
        <div className={goalStyles.goalHeading}><div><span className="eyebrow">{goal.currencyCode}{goal.targetDate ? ` · TARGET ${goal.targetDate}` : ''}</span><h3>{goal.name}</h3>{goal.description && <p className="muted">{goal.description}</p>}</div><span className="tag">{goal.isCompleted ? 'COMPLETED' : 'IN PROGRESS'}</span></div>
        <div className={goalStyles.progressSummary}><strong>{money(goal.currentAmount, goal.currencyCode)}</strong><span>of {money(goal.targetAmount, goal.currencyCode)}</span><span>{money(goal.remainingAmount, goal.currencyCode)} remaining</span></div>
        <progress value={goal.progressPercent} max="100" aria-label={`${goal.name} progress`} />
        {!goal.isCompleted && <form className={goalStyles.contributionForm} onSubmit={event => void recordContribution(event, goal)}>
          <label>Entry<select name="type" defaultValue="CONTRIBUTION"><option value="CONTRIBUTION">Contribution</option><option value="WITHDRAWAL">Withdrawal</option></select></label>
          <label>Amount ({goal.currencyCode})<input name="amount" type="number" min="0.0001" step="0.0001" required /></label>
          <label>Date<input name="contributionDate" type="date" defaultValue={localDate()} max={localDate()} required /></label>
          <label>Description <span className={goalStyles.optional}>(optional)</span><input name="description" maxLength={240} placeholder="Add a note" /></label>
          <button disabled={busy}>{busy ? 'Saving…' : 'Record entry'}</button>
        </form>}
        <div className={goalStyles.activityHeading}><h4>Recent activity</h4></div>
        {goal.contributions.length === 0 ? <p className="muted">No contributions recorded yet.</p> : <ul className={goalStyles.contributions}>{goal.contributions.map(item => <li key={item.id}>
          <div><strong>{item.type === 'CONTRIBUTION' ? 'Contribution' : 'Withdrawal'} · {item.contributionDate}</strong>{item.description && <span>{item.description}</span>}</div>
          <strong className={item.type === 'CONTRIBUTION' ? goalStyles.addition : goalStyles.removal}>{item.type === 'CONTRIBUTION' ? '+' : '−'}{money(item.amount, goal.currencyCode)}</strong>
        </li>)}</ul>}
      </article>)}</div>}
    </section>
  </section></main>;
}

type NetWorthCurrency = { currencyCode: string; assets: string; liabilities: string; netWorth: string };
type NetWorthSnapshot = { id: string; snapshotDate: string; currencies: NetWorthCurrency[] };
type NetWorthOverview = {
  snapshotDate: string;
  baseCurrency: string;
  current: NetWorthCurrency[];
  snapshots: NetWorthSnapshot[];
};
export function NetWorth() {
  const [spaceId, setSpaceId] = useState('');
  const [data, setData] = useState<NetWorthOverview | null>(null);
  const [snapshotDate, setSnapshotDate] = useState(localDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/net-worth`);
      if (active) { setSpaceId(spaces[0].id); setData(result); setSnapshotDate(result.snapshotDate); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load net worth.'); }
  })(); return () => { active = false; }; }, []);
  async function reload() {
    if (spaceId) setData(await api(`spaces/${spaceId}/net-worth`));
  }
  function money(value: string, currency: string) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value)); }
    catch { return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value))}`; }
  }
  async function createSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api(`spaces/${spaceId}/net-worth/snapshots`, { snapshotDate });
      await reload(); setMessage(`Snapshot saved for ${snapshotDate}.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this snapshot.'); }
    finally { setBusy(false); }
  }
  return <main className="dashboard"><section className={`${netWorthStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE · {data?.baseCurrency ?? 'GHS'}</p><h1>Net worth</h1>
    <p className="muted">Your tracked savings and valued investments minus outstanding debt principal. Values stay separated by currency; no exchange-rate conversion is applied. Cash, property, and unvalued investments are not included.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={netWorthStyles.panel}>
      <div className={netWorthStyles.sectionHeading}><div><p className="eyebrow">CURRENT POSITION</p><h2>As of {data?.snapshotDate ?? '—'}</h2></div></div>
      {!data ? <p role="status">Loading net worth…</p> : data.current.length === 0 ? <p className="muted">No tracked assets or liabilities yet. Add a savings account or liability to begin.</p> : <div className={netWorthStyles.currencies}>{data.current.map(item => <article className={netWorthStyles.currency} key={item.currencyCode}>
        <h3>{item.currencyCode}</h3><dl><div><dt>Tracked assets</dt><dd>{money(item.assets, item.currencyCode)}</dd></div><div><dt>Liabilities</dt><dd>{money(item.liabilities, item.currencyCode)}</dd></div><div className={netWorthStyles.net}><dt>Net worth</dt><dd>{money(item.netWorth, item.currencyCode)}</dd></div></dl>
      </article>)}</div>}
    </section>
    <section className={netWorthStyles.panel}>
      <div className={netWorthStyles.sectionHeading}><div><p className="eyebrow">HISTORY</p><h2>Save a snapshot</h2></div></div>
      <p className="muted">Snapshots use savings, liability, and investment records available on the selected date and are preserved as recorded. Only one snapshot can be saved per day.</p>
      <form className={netWorthStyles.snapshotForm} onSubmit={event => void createSnapshot(event)}>
        <label>Snapshot date<input type="date" value={snapshotDate} onChange={event => setSnapshotDate(event.target.value)} max={data?.snapshotDate ?? localDate()} required /></label>
        <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Save snapshot'}</button>
      </form>
    </section>
    <section className={netWorthStyles.panel}>
      <div className={netWorthStyles.sectionHeading}><div><p className="eyebrow">SAVED RECORDS</p><h2>Snapshot history</h2></div></div>
      {!data ? <p role="status">Loading history…</p> : data.snapshots.length === 0 ? <p className="muted">No snapshots saved yet.</p> : <div className={netWorthStyles.history}>{data.snapshots.map(snapshot => <article className={netWorthStyles.snapshot} key={snapshot.id}>
        <h3>{snapshot.snapshotDate}</h3><div className={netWorthStyles.currencies}>{snapshot.currencies.map(item => <dl key={item.currencyCode}><dt>{item.currencyCode} net worth</dt><dd>{money(item.netWorth, item.currencyCode)}</dd><dt>Assets</dt><dd>{money(item.assets, item.currencyCode)}</dd><dt>Liabilities</dt><dd>{money(item.liabilities, item.currencyCode)}</dd></dl>)}</div>
      </article>)}</div>}
    </section>
  </section></main>;
}

type PaydayActionType = 'SAVINGS_DEPOSIT' | 'GOAL_CONTRIBUTION' | 'LIABILITY_PAYMENT';
type PaydayActionStatus = 'DUE' | 'PARTIALLY_COMPLETED' | 'COMPLETED' | 'SKIPPED';
type PaydayTarget = { id: string; name: string; currencyCode: string };
type PaydayRoutineAction = {
  id: string;
  source: PaydayTarget;
  type: PaydayActionType;
  name: string;
  plannedAmount: string;
  isActive: boolean;
  target: PaydayTarget;
};
type PaydayRoutineEntry = {
  id: string;
  type: PaydayActionType;
  name: string;
  source: PaydayTarget;
  target: PaydayTarget;
  plannedAmount: string;
  completedAmount: string;
  remainingAmount: string;
  status: PaydayActionStatus;
  salary: { amount: string; receivedDate: string; periodYear: number | null; periodMonth: number | null };
};
const paydayActionLabels: Record<PaydayActionType, string> = {
  SAVINGS_DEPOSIT: 'Savings deposit',
  GOAL_CONTRIBUTION: 'Goal contribution',
  LIABILITY_PAYMENT: 'Debt repayment',
};
const paydayActionStatusLabels: Record<PaydayActionStatus, string> = {
  DUE: 'DUE',
  PARTIALLY_COMPLETED: 'PARTIALLY COMPLETED',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
};
export function PaydayRoutines() {
  const [spaceId, setSpaceId] = useState('');
  const [sources, setSources] = useState<PaydayTarget[]>([]);
  const [routineSourceId, setRoutineSourceId] = useState('');
  const [savings, setSavings] = useState<PaydayTarget[]>([]);
  const [goals, setGoals] = useState<PaydayTarget[]>([]);
  const [liabilities, setLiabilities] = useState<PaydayTarget[]>([]);
  const [actions, setActions] = useState<PaydayRoutineAction[]>([]);
  const [entries, setEntries] = useState<PaydayRoutineEntry[]>([]);
  const [actionType, setActionType] = useState<PaydayActionType>('SAVINGS_DEPOSIT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const id = spaces[0].id;
      const [incomeSources, savingsOverview, goalOverview, liabilityOverview, routineData] = await Promise.all([
        api(`spaces/${id}/income-sources`),
        api(`spaces/${id}/savings-accounts`),
        api(`spaces/${id}/goals`),
        api(`spaces/${id}/liabilities`),
        api(`spaces/${id}/payday-routines`),
      ]);
      if (active) {
        setSpaceId(id);
        const salarySources = incomeSources.filter((source: { type: IncomeSourceType }) => source.type === 'SALARY');
        setSources(salarySources);
        setRoutineSourceId(salarySources[0]?.id ?? '');
        setSavings(savingsOverview.accounts);
        setGoals(goalOverview.goals);
        setLiabilities(liabilityOverview.liabilities.filter((liability: { status: string }) => liability.status === 'ACTIVE'));
        setActions(routineData.actions);
        setEntries(routineData.entries);
      }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load payday routines.'); }
  })(); return () => { active = false; }; }, []);
  async function reload() {
    if (!spaceId) return;
    const result = await api(`spaces/${spaceId}/payday-routines`);
    setActions(result.actions); setEntries(result.entries);
  }
  function money(value: string, currency: string) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value)); }
    catch { return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value))}`; }
  }
  const selectedTargets = actionType === 'SAVINGS_DEPOSIT' ? savings : actionType === 'GOAL_CONTRIBUTION' ? goals : liabilities;
  const routineCurrency = sources.find(source => source.id === routineSourceId)?.currencyCode.trim();
  const compatibleTargets = selectedTargets.filter(target => target.currencyCode.trim() === routineCurrency);
  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`spaces/${spaceId}/payday-routines`, {
        sourceId: String(form.get('sourceId') ?? ''),
        type: actionType,
        name: String(form.get('name') ?? '').trim(),
        plannedAmount: String(form.get('plannedAmount') ?? '').trim(),
        targetId: String(form.get('targetId') ?? ''),
      });
      await reload(); formElement.reset(); setMessage('Payday routine action added.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this routine action.'); }
    finally { setBusy(false); }
  }
  async function completeAction(event: FormEvent<HTMLFormElement>, entry: PaydayRoutineEntry) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      amount: String(form.get('amount') ?? '').trim(),
      completedDate: String(form.get('completedDate') ?? ''),
    };
    const principalAmount = String(form.get('principalAmount') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    if (principalAmount) payload.principalAmount = principalAmount;
    if (description) payload.description = description;
    try {
      const result = await api(`spaces/${spaceId}/payday-routines/${entry.id}/complete`, payload);
      await reload(); setMessage(result.status === 'COMPLETED' ? 'Payday action completed and recorded.' : 'Partial payday action recorded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record this payday action.'); }
    finally { setBusy(false); }
  }
  async function skipAction(entry: PaydayRoutineEntry) {
    setBusy(true); setError(''); setMessage('');
    try { await api(`spaces/${spaceId}/payday-routines/${entry.id}/skip`, {}); await reload(); setMessage('Payday action skipped.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to skip this action.'); }
    finally { setBusy(false); }
  }
  return <main className="dashboard"><section className={`${paydayStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE</p><h1>Payday routine</h1>
    <p className="muted">Plan what you intend to do after salary arrives. This app never moves money; confirm only actions you have already completed externally. Routine entries are created when you confirm a salary.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={paydayStyles.panel}><h2>Plan a payday action</h2>
      {sources.length === 0 ? <p className="muted">Add a salary source with payday dates on the <Link href="/income">Income page</Link> to configure a routine.</p> : <form className={paydayStyles.form} onSubmit={createAction}>
        <label>Salary source<select name="sourceId" required value={routineSourceId} onChange={event => setRoutineSourceId(event.target.value)}><option value="" disabled>Choose salary source</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name} · {source.currencyCode}</option>)}</select></label>
        <label>Action type<select value={actionType} onChange={event => setActionType(event.target.value as PaydayActionType)}>{Object.entries(paydayActionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Action name<input name="name" required maxLength={100} placeholder="e.g. Monthly emergency fund" /></label>
        <label>Planned amount<input name="plannedAmount" type="number" min="0.0001" step="0.0001" required /></label>
        <label>Destination<select name="targetId" required defaultValue=""><option value="" disabled>Choose destination</option>{compatibleTargets.map(target => <option key={target.id} value={target.id}>{target.name} · {target.currencyCode}</option>)}</select></label>
        <p className={paydayStyles.hint}>Choose a destination in the same currency as the salary source. You can configure fixed planned amounts; actions are not automatically deducted from salary.</p>
        <button disabled={busy || !spaceId || compatibleTargets.length === 0}>{busy ? 'Saving…' : 'Add routine action'}</button>
      </form>}
    </section>
    <section className={paydayStyles.panel}><div className={paydayStyles.sectionHeading}><div><p className="eyebrow">REUSABLE PLAN</p><h2>Your planned actions</h2></div></div>
      {actions.length === 0 ? <p className="muted">No payday actions configured. Add savings, goal, or debt actions above.</p> : <ul className={paydayStyles.actionList}>{actions.map(action => <li key={action.id}><div><strong>{action.name} {!action.isActive && <span>(paused)</span>}</strong><span>{action.source.name} → {paydayActionLabels[action.type]}: {action.target.name}</span></div><div className={paydayStyles.actionControls}><strong>{money(action.plannedAmount, action.source.currencyCode)}</strong><button type="button" className={paydayStyles.skip} disabled={busy} onClick={async () => {
        setBusy(true); setError(''); setMessage('');
        try { await api(`spaces/${spaceId}/payday-routines/${action.id}/status`, { isActive: !action.isActive }); await reload(); setMessage(action.isActive ? 'Payday action paused.' : 'Payday action activated.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'Unable to update this routine.'); }
        finally { setBusy(false); }
      }}>{action.isActive ? 'Pause' : 'Activate'}</button></div></li>)}</ul>}
    </section>
    <section className={paydayStyles.panel}><div className={paydayStyles.sectionHeading}><div><p className="eyebrow">AFTER SALARY CONFIRMATION</p><h2>Routine activity</h2></div></div>
      {entries.length === 0 ? <p className="muted">No payday actions are due yet. When salary is confirmed, actions configured for that source will appear here.</p> : <div className={paydayStyles.entries}>{entries.map(entry => <article className={paydayStyles.entry} key={entry.id}>
        <div className={paydayStyles.entryHeading}><div><span className="eyebrow">{entry.source.name} · RECEIVED {entry.salary.receivedDate}</span><h3>{entry.name}</h3><p className="muted">{paydayActionLabels[entry.type]} · {entry.target.name}</p></div><span className="tag">{paydayActionStatusLabels[entry.status]}</span></div>
        <p className={paydayStyles.amounts}>{money(entry.completedAmount, entry.source.currencyCode)} completed of {money(entry.plannedAmount, entry.source.currencyCode)} · {money(entry.remainingAmount, entry.source.currencyCode)} remaining</p>
        {entry.status === 'DUE' || entry.status === 'PARTIALLY_COMPLETED' ? <>
          <p className={paydayStyles.hint}>First perform this action with your bank or provider, then record it here. Saving records the corresponding transaction in your financial tracker.</p>
          <form className={paydayStyles.form} onSubmit={event => void completeAction(event, entry)}>
            <label>Amount completed<input name="amount" type="number" min="0.0001" max={entry.remainingAmount} step="0.0001" defaultValue={entry.remainingAmount} required /></label>
            <label>Completion date<input name="completedDate" type="date" min={entry.salary.receivedDate} max={localDate()} defaultValue={localDate()} required /></label>
            {entry.type === 'LIABILITY_PAYMENT' && <label>Principal portion <span className={paydayStyles.optional}>(optional)</span><input name="principalAmount" type="number" min="0" step="0.0001" placeholder="Defaults to total payment" /></label>}
            <label>Description <span className={paydayStyles.optional}>(optional)</span><input name="description" maxLength={240} placeholder="Add a note" /></label>
            <div className={paydayStyles.buttons}><button disabled={busy}>{busy ? 'Saving…' : 'Record completed action'}</button><button className={paydayStyles.skip} type="button" disabled={busy} onClick={() => void skipAction(entry)}>Skip</button></div>
          </form>
        </> : null}
      </article>)}</div>}
    </section>
  </section></main>;
}

type InvestmentTransaction = {
  id: string;
  type: string;
  amount: string;
  quantity: string | null;
  transactionDate: string;
  description: string | null;
};
type InvestmentValuation = {
  id: string;
  valuationDate: string;
  marketValue: string;
  unitPrice: string | null;
  currencyCode: string;
  method: string;
};
type InvestmentHolding = {
  id: string;
  type: string;
  name: string;
  currencyCode: string;
  costBasis: string;
  startDate: string;
  maturityDate: string | null;
  annualInterestRate: string | null;
  interestMethod: 'SIMPLE' | 'COMPOUND' | null;
  compoundingFrequency: number | null;
  expectedMaturityValue: string | null;
  actualMaturityValue: string | null;
  status: 'ACTIVE' | 'CLOSED';
  maturityStatus: 'ACTIVE' | 'MATURED' | 'CLOSED';
  quantity: string;
  currentValue: string | null;
  valuationMethod: string | null;
  valuationDate: string | null;
  transactions: InvestmentTransaction[];
  valuations: InvestmentValuation[];
};
type InvestmentAccountOverview = {
  id: string;
  name: string;
  provider: string | null;
  currencyCode: string;
  investments: InvestmentHolding[];
};
type InvestmentOverview = { baseCurrency: string; totalsByCurrency: Record<string, string>; accounts: InvestmentAccountOverview[] };
const investmentTypes = [
  ['STOCK', 'Stock'], ['BOND', 'Bond'], ['TREASURY_BILL', 'Treasury bill'], ['MUTUAL_FUND', 'Mutual fund'], ['ETF', 'ETF'],
  ['FIXED_INCOME', 'Fixed income'], ['REAL_ESTATE', 'Real estate'], ['BUSINESS_INVESTMENT', 'Business investment'],
  ['CRYPTOCURRENCY', 'Cryptocurrency'], ['FIXED_DEPOSIT', 'Fixed deposit'], ['OTHER', 'Other'],
];
const transactionTypes = [
  ['BUY', 'Buy'], ['CONTRIBUTION', 'Contribution'], ['SELL', 'Sell'], ['WITHDRAWAL', 'Withdrawal'],
  ['DIVIDEND', 'Dividend'], ['INTEREST', 'Interest'], ['FEE', 'Fee'], ['TAX', 'Tax'],
];
const compoundingFrequencies = [[1, 'Annually'], [2, 'Semiannually'], [4, 'Quarterly'], [12, 'Monthly'], [365, 'Daily']];
export function Investments() {
  const [spaceId, setSpaceId] = useState('');
  const [data, setData] = useState<InvestmentOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/investments`);
      if (active) { setSpaceId(spaces[0].id); setData(result); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load investments.'); }
  })(); return () => { active = false; }; }, []);
  async function reload() {
    if (spaceId) setData(await api(`spaces/${spaceId}/investments`));
  }
  function money(value: string, currency: string) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value)); }
    catch { return `${currency} ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value))}`; }
  }
  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      name: String(form.get('name') ?? '').trim(),
      currencyCode: String(form.get('currencyCode') ?? data?.baseCurrency ?? 'GHS').trim().toUpperCase(),
    };
    const provider = String(form.get('provider') ?? '').trim();
    if (provider) payload.provider = provider;
    try { await api(`spaces/${spaceId}/investment-accounts`, payload); await reload(); formElement.reset(); setMessage('Investment account added.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this account.'); }
    finally { setBusy(false); }
  }
  async function createInvestment(event: FormEvent<HTMLFormElement>, account: InvestmentAccountOverview) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const type = String(form.get('type') ?? 'STOCK');
    const payload: Record<string, string | number> = {
      type,
      name: String(form.get('name') ?? '').trim(),
      currencyCode: String(form.get('currencyCode') ?? account.currencyCode).trim().toUpperCase(),
      costBasis: String(form.get('costBasis') ?? '0').trim() || '0',
      startDate: String(form.get('startDate') ?? ''),
    };
    const quantity = String(form.get('quantity') ?? '').trim();
    const maturityDate = String(form.get('maturityDate') ?? '').trim();
    if (quantity) payload.quantity = quantity;
    if (maturityDate) payload.maturityDate = maturityDate;
    if (type === 'FIXED_DEPOSIT') {
      payload.annualInterestRate = String(form.get('annualInterestRate') ?? '').trim();
      payload.interestMethod = String(form.get('interestMethod') ?? 'SIMPLE');
      payload.compoundingFrequency = Number(form.get('compoundingFrequency') ?? '1');
    }
    try { await api(`spaces/${spaceId}/investment-accounts/${account.id}/investments`, payload); await reload(); formElement.reset(); setMessage(`${type === 'FIXED_DEPOSIT' ? 'Fixed deposit' : 'Investment'} added.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this investment.'); }
    finally { setBusy(false); }
  }
  async function recordTransaction(event: FormEvent<HTMLFormElement>, holding: InvestmentHolding) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, string> = {
      type: String(form.get('type') ?? 'BUY'),
      amount: String(form.get('amount') ?? '').trim(),
      transactionDate: String(form.get('transactionDate') ?? ''),
    };
    const quantity = String(form.get('quantity') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    if (quantity) payload.quantity = quantity;
    if (description) payload.description = description;
    try { await api(`spaces/${spaceId}/investments/${holding.id}/transactions`, payload); await reload(); formElement.reset(); setMessage('Investment transaction recorded.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to record this transaction.'); }
    finally { setBusy(false); }
  }
  async function recordValuation(event: FormEvent<HTMLFormElement>, holding: InvestmentHolding) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const method = String(form.get('method') ?? 'MANUAL');
    const payload: Record<string, string> = {
      method,
      valuationDate: String(form.get('valuationDate') ?? ''),
    };
    if (method === 'MANUAL') payload.marketValue = String(form.get('marketValue') ?? '').trim();
    else payload.unitPrice = String(form.get('unitPrice') ?? '').trim();
    try { await api(`spaces/${spaceId}/investments/${holding.id}/valuations`, payload); await reload(); formElement.reset(); setMessage('Valuation saved to history.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this valuation.'); }
    finally { setBusy(false); }
  }
  async function recordMaturity(event: FormEvent<HTMLFormElement>, holding: InvestmentHolding) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      actualMaturityValue: String(form.get('actualMaturityValue') ?? '').trim(),
      maturityDate: String(form.get('maturityDate') ?? ''),
    };
    try { await api(`spaces/${spaceId}/investments/${holding.id}/maturity`, payload); await reload(); setMessage('Maturity payout recorded and the fixed deposit closed.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to record maturity.'); }
    finally { setBusy(false); }
  }
  return <main className="dashboard"><section className={`${investmentStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PERSONAL SPACE · {data?.baseCurrency ?? 'GHS'}</p><h1>Investments</h1>
    <p className="muted">Track investment transactions and dated valuations. Unit-price values use units held × your entered price. Fixed-deposit values use the contracted simple or compound interest terms. This tracker does not hold or move money.</p>
    {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section className={investmentStyles.panel}><h2>Add an investment account</h2><form className={investmentStyles.form} onSubmit={event => void createAccount(event)}>
      <label>Account name<input name="name" required maxLength={100} placeholder="e.g. Brokerage account" /></label>
      <label>Broker or institution <span className={investmentStyles.optional}>(optional)</span><input name="provider" maxLength={100} placeholder="e.g. Investment provider" /></label>
      <label>Account currency<input name="currencyCode" minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={data?.baseCurrency ?? 'GHS'} required /></label>
      <button disabled={busy || !spaceId}>{busy ? 'Saving…' : 'Add account'}</button>
    </form></section>
    <section className={investmentStyles.panel}><h2>Portfolio value</h2>
      {!data ? <p role="status">Loading investments…</p> : Object.keys(data.totalsByCurrency).length === 0 ? <p className="muted">No valued investments yet. Add an investment account to begin.</p> : <div className={investmentStyles.totals}>{Object.entries(data.totalsByCurrency).map(([currency, total]) => <article key={currency}><span>Total tracked in {currency}</span><strong>{money(total, currency)}</strong></article>)}</div>}
    </section>
    <section className={investmentStyles.panel}><h2>Accounts and holdings</h2>
      {!data ? <p role="status">Loading accounts…</p> : data.accounts.length === 0 ? <p className="muted">No investment accounts yet. Add one above to record holdings and fixed deposits.</p> : <div className={investmentStyles.accounts}>{data.accounts.map(account => <article className={investmentStyles.account} key={account.id}>
        <div className={investmentStyles.accountHeading}><div><span className={investmentStyles.eyebrow}>INVESTMENT ACCOUNT · {account.currencyCode}</span><h3>{account.name}</h3><p className="muted">{account.provider ?? 'No provider specified'}</p></div></div>
        <form className={investmentStyles.form} onSubmit={event => void createInvestment(event, account)}>
          <label>Investment type<select name="type" defaultValue="STOCK">{investmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Investment name<input name="name" required maxLength={100} placeholder="e.g. Fund or fixed deposit name" /></label>
          <label>Currency<input name="currencyCode" minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={account.currencyCode} required /></label>
          <label>Initial cost / principal<input name="costBasis" type="number" min="0" step="0.0001" defaultValue="0" required /></label>
          <label>Opening units <span className={investmentStyles.optional}>(optional)</span><input name="quantity" type="number" min="0.00000001" step="0.00000001" /></label>
          <label>Start date<input name="startDate" type="date" defaultValue={localDate()} max={localDate()} required /></label>
          <label>Maturity date <span className={investmentStyles.optional}>(required for fixed deposits)</span><input name="maturityDate" type="date" /></label>
          <label>Annual interest rate (%)<input name="annualInterestRate" type="number" min="0" max="100" step="0.0001" placeholder="Fixed deposits only" /></label>
          <label>Interest method<select name="interestMethod" defaultValue="SIMPLE"><option value="SIMPLE">Simple</option><option value="COMPOUND">Compound</option></select></label>
          <label>Compounding frequency<select name="compoundingFrequency" defaultValue="1">{compoundingFrequencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <p className={investmentStyles.hint}>For ordinary investments, cost basis and opening units are optional; record later buys, contributions, or valuations below. Fixed-deposit value is estimated through the maturity date using A = P(1 + rt) for simple interest or A = P(1 + r/n)^(nt) for compound interest. Day count is actual/365; fees, taxes, and provider-specific rounding are not projected.</p>
          <button disabled={busy}>{busy ? 'Saving…' : 'Add investment'}</button>
        </form>
        {account.investments.length === 0 ? <p className="muted">No holdings in this account yet.</p> : <div className={investmentStyles.holdings}>{account.investments.map(holding => {
          const isFixedDeposit = holding.type === 'FIXED_DEPOSIT';
          return <article className={investmentStyles.holding} key={holding.id}>
            <div className={investmentStyles.holdingHeading}><div><span className={investmentStyles.eyebrow}>{investmentTypes.find(([value]) => value === holding.type)?.[1] ?? holding.type} · {holding.currencyCode} · {holding.maturityStatus}</span><h4>{holding.name}</h4><p className="muted">Started {holding.startDate}{holding.maturityDate ? ` · Matures ${holding.maturityDate}` : ''}{holding.valuationDate ? ` · Valued ${holding.valuationDate}` : ''}</p>
              {isFixedDeposit && <p className="muted">{holding.interestMethod?.toLowerCase()} interest at {holding.annualInterestRate}% · {compoundingFrequencies.find(([value]) => value === holding.compoundingFrequency)?.[1] ?? 'contractual frequency'} · Expected at maturity {holding.expectedMaturityValue ? money(holding.expectedMaturityValue, holding.currencyCode) : '—'}</p>}
            </div><strong className={investmentStyles.value}>{holding.currentValue === null ? 'Not valued' : money(holding.currentValue, holding.currencyCode)}</strong></div>
            {isFixedDeposit && holding.status === 'ACTIVE' && holding.maturityDate && holding.maturityDate <= localDate() && <form className={investmentStyles.subform} onSubmit={event => void recordMaturity(event, holding)}>
              <h5>Record actual maturity payout</h5>
              <label>Actual payout ({holding.currencyCode})<input name="actualMaturityValue" type="number" min="0.0001" step="0.0001" required /></label>
              <label>Payout date<input name="maturityDate" type="date" min={holding.maturityDate} max={localDate()} defaultValue={holding.maturityDate} required /></label>
              <button disabled={busy}>{busy ? 'Saving…' : 'Record payout and close'}</button>
            </form>}
            {holding.status === 'ACTIVE' && <div className={investmentStyles.forms}>
              <form className={investmentStyles.subform} onSubmit={event => void recordTransaction(event, holding)}>
                <h5>Record transaction</h5>
                <label>Type<select name="type" defaultValue={isFixedDeposit ? 'INTEREST' : 'BUY'}>{transactionTypes.filter(([value]) => !isFixedDeposit || ['INTEREST', 'FEE', 'TAX'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Amount ({holding.currencyCode})<input name="amount" type="number" min="0.0001" step="0.0001" required /></label>
                {!isFixedDeposit && <label>Units <span className={investmentStyles.optional}>(required for buys/sells)</span><input name="quantity" type="number" min="0.00000001" step="0.00000001" /></label>}
                <label>Date<input name="transactionDate" type="date" min={holding.startDate} max={localDate()} defaultValue={localDate()} required /></label>
                <label>Description <span className={investmentStyles.optional}>(optional)</span><input name="description" maxLength={240} /></label>
                <button disabled={busy}>{busy ? 'Saving…' : 'Record transaction'}</button>
              </form>
              {!isFixedDeposit && <form className={investmentStyles.subform} onSubmit={event => void recordValuation(event, holding)}>
                <h5>Save a valuation</h5>
                <label>Method<select name="method" defaultValue="MANUAL"><option value="MANUAL">Manual market value</option><option value="QUANTITY_X_PRICE">Units × unit price</option></select></label>
                <label>Valuation date<input name="valuationDate" type="date" min={holding.startDate} max={localDate()} defaultValue={localDate()} required /></label>
                <label>Manual market value ({holding.currencyCode})<input name="marketValue" type="number" min="0" step="0.0001" /></label>
                <label>Unit price ({holding.currencyCode})<input name="unitPrice" type="number" min="0.00000001" step="0.00000001" /></label>
                <p className={investmentStyles.hint}>Only the selected method’s value is sent. Quantity × price uses the units held on the valuation date.</p>
                <button disabled={busy}>{busy ? 'Saving…' : 'Save valuation'}</button>
              </form>}
            </div>}
            {holding.transactions.length > 0 && <div className={investmentStyles.history}><strong>Transaction history</strong><ul className={investmentStyles.transactions}>{holding.transactions.map(transaction => <li key={transaction.id}><div><strong>{transaction.type}{transaction.quantity ? ` · ${transaction.quantity} units` : ''}</strong><span>{transaction.transactionDate}{transaction.description ? ` · ${transaction.description}` : ''}</span></div><strong className={['BUY', 'CONTRIBUTION', 'DIVIDEND', 'INTEREST'].includes(transaction.type) ? investmentStyles.positive : investmentStyles.negative}>{money(transaction.amount, holding.currencyCode)}</strong></li>)}</ul></div>}
            {holding.valuations.length > 0 && <div className={investmentStyles.history}><strong>Valuation history</strong><ul className={investmentStyles.valuations}>{holding.valuations.map(valuation => <li key={valuation.id}><div><strong>{valuation.method === 'CONTRACTUAL' ? 'Contract start value' : valuation.method === 'QUANTITY_X_PRICE' ? `Unit price ${valuation.unitPrice}` : 'Manual value'}</strong><span>{valuation.valuationDate} · {valuation.method.replaceAll('_', ' ').toLowerCase()}</span></div><strong>{money(valuation.marketValue, valuation.currencyCode)}</strong></li>)}</ul></div>}
          </article>;
        })}</div>}
      </article>)}</div>}
    </section>
  </section></main>;
}

type AnalyticsExplanation = {
  formula: string;
  dataUsed: string[];
  measurementPeriod: string;
  limitations: string[];
  dataFreshness: string;
};
type PortfolioAnalyticsCurrency = {
  currencyCode: string;
  status: 'READY' | 'NOT_ENOUGH_DATA';
  asOfDate: string;
  holdingCount: number;
  valuedHoldingCount: number;
  totalValue: number;
  absoluteReturn: number | null;
  returnPercent: number | null;
  annualizedReturn: number | null;
  xirr: { status: string; value: number | null };
  twr: { status: string; value: number | null; periods: { from: string; to: string; returnPercent: number }[] };
  allocation: { type: string; value: number; percentage: number | null }[];
  concentration: { investmentId: string; name: string; type: string; value: number; percentage: number | null }[];
  diversification: { status: string; hhi: number | null; effectiveHoldingCount: number | null };
  volatility: { status: string; annualizedPercent: number | null; periodCount: number };
  contributions: { invested: number; proceeds: number; investmentIncome: number; feesAndTaxes: number; netGain: number };
  metricStatus: Record<string, 'READY' | 'NOT_ENOUGH_DATA'>;
  maturityExposure: { bucket: string; value: number; percentage: number | null }[];
  historicalComparison: { status: string; from: string | null; to: string | null; change: number | null; percentage: number | null };
  explanations: Record<string, AnalyticsExplanation>;
};
type PortfolioAnalyticsOverview = { asOfDate: string; status: 'READY' | 'NOT_ENOUGH_DATA'; currencies: PortfolioAnalyticsCurrency[] };
const metricLabels: Record<string, string> = {
  absoluteReturn: 'Absolute return',
  returnPercent: 'Return on contributions',
  xirr: 'Annualized return (XIRR)',
  twr: 'Time-weighted return',
  allocation: 'Asset allocation',
  concentration: 'Concentration',
  diversification: 'Diversification',
  volatility: 'Annualized volatility',
  contributionAnalysis: 'Contribution analysis',
  maturityExposure: 'Fixed-deposit maturity exposure',
  historicalComparison: 'Historical comparison',
};
export function PortfolioIntelligence() {
  const [data, setData] = useState<PortfolioAnalyticsOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces');
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/portfolio-analytics`);
      if (active) setData(result);
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load portfolio analytics.'); }
  })(); return () => { active = false; }; }, []);
  function money(value: number, currency: string) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value); }
    catch { return `${currency} ${value.toFixed(2)}`; }
  }

  const explanation = (key: string, metric: AnalyticsExplanation) => <details className={investmentStyles.explanation} key={key}>
    <summary>How is this calculated?</summary>
    <dl><dt>Formula</dt><dd>{metric.formula}</dd><dt>Data used</dt><dd>{metric.dataUsed.join(', ')}</dd><dt>Period</dt><dd>{metric.measurementPeriod}</dd><dt>Limitations</dt><dd>{metric.limitations.join(' ')}</dd><dt>Data freshness</dt><dd>{metric.dataFreshness}</dd></dl>
  </details>;
  return <main className="dashboard"><section className={`${investmentStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PORTFOLIO · DETERMINISTIC ANALYTICS</p><h1>Portfolio intelligence</h1>
    <p className="muted">Returns, exposure, and portfolio structure calculated from your dated investment records and valuations. Results remain separated by currency; no market feed or FX conversion is used.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!data ? <p role="status">Calculating portfolio analytics…</p> : data.status === 'NOT_ENOUGH_DATA' ? <section className={investmentStyles.panel}><h2>Not enough data yet</h2><p className="muted">Add an investment and record transactions or a dated valuation to begin. Metrics that cannot be calculated are explicitly marked NOT_ENOUGH_DATA.</p></section> : <>
      {data.currencies.map(portfolio => <section className={investmentStyles.panel} key={portfolio.currencyCode}>
        <div className={investmentStyles.analyticsHeading}><div><p className="eyebrow">{portfolio.currencyCode} PORTFOLIO · AS OF {portfolio.asOfDate}</p><h2>Portfolio summary</h2><p className="muted">{portfolio.valuedHoldingCount} of {portfolio.holdingCount} holdings currently valued.</p></div><strong>{money(portfolio.totalValue, portfolio.currencyCode)}</strong></div>
        <div className={investmentStyles.analyticsGrid}>
          <article><span>Absolute return</span><strong>{portfolio.metricStatus.absoluteReturn === 'READY' && portfolio.absoluteReturn !== null ? money(portfolio.absoluteReturn, portfolio.currencyCode) : 'NOT_ENOUGH_DATA'}</strong>{explanation('absoluteReturn', portfolio.explanations.absoluteReturn)}</article>
          <article><span>Return on contributions</span><strong>{portfolio.returnPercent === null ? 'NOT_ENOUGH_DATA' : `${portfolio.returnPercent}%`}</strong>{explanation('returnPercent', portfolio.explanations.returnPercent)}</article>
          <article><span>Annualized return (XIRR)</span><strong>{portfolio.xirr.value === null ? 'NOT_ENOUGH_DATA' : `${portfolio.xirr.value}%`}</strong>{explanation('xirr', portfolio.explanations.xirr)}</article>
          <article><span>Time-weighted return</span><strong>{portfolio.twr.value === null ? 'NOT_ENOUGH_DATA' : `${portfolio.twr.value}%`}</strong>{explanation('twr', portfolio.explanations.twr)}</article>
          <article><span>Annualized volatility</span><strong>{portfolio.volatility.annualizedPercent === null ? 'NOT_ENOUGH_DATA' : `${portfolio.volatility.annualizedPercent}%`}</strong>{explanation('volatility', portfolio.explanations.volatility)}</article>
          <article><span>Effective holding count</span><strong>{portfolio.metricStatus.diversification === 'READY' ? portfolio.diversification.effectiveHoldingCount : 'NOT_ENOUGH_DATA'}</strong>{explanation('diversification', portfolio.explanations.diversification)}</article>
        </div>
        <div className={investmentStyles.analyticsSections}>
          <section><h3>Asset allocation</h3>{portfolio.metricStatus.allocation === 'READY' ? <ul className={investmentStyles.analyticsList}>{portfolio.allocation.map(item => <li key={item.type}><span>{item.type.replaceAll('_', ' ')}</span><strong>{item.percentage}% · {money(item.value, portfolio.currencyCode)}</strong></li>)}</ul> : <p className="muted">NOT_ENOUGH_DATA</p>}{explanation('allocation', portfolio.explanations.allocation)}</section>
          <section><h3>Largest holdings</h3>{portfolio.metricStatus.concentration === 'READY' ? <ul className={investmentStyles.analyticsList}>{portfolio.concentration.map(item => <li key={item.investmentId}><span>{item.name}</span><strong>{item.percentage}% · {money(item.value, portfolio.currencyCode)}</strong></li>)}</ul> : <p className="muted">NOT_ENOUGH_DATA</p>}{explanation('concentration', portfolio.explanations.concentration)}</section>
          <section><h3>Contribution and income</h3>{portfolio.metricStatus.contributionAnalysis === 'READY' ? <ul className={investmentStyles.analyticsList}>
            <li><span>Purchases and contributions</span><strong>{money(portfolio.contributions.invested, portfolio.currencyCode)}</strong></li>
            <li><span>Sale and withdrawal proceeds</span><strong>{money(portfolio.contributions.proceeds, portfolio.currencyCode)}</strong></li>
            <li><span>Dividends and interest</span><strong>{money(portfolio.contributions.investmentIncome, portfolio.currencyCode)}</strong></li>
            <li><span>Fees and taxes</span><strong>{money(portfolio.contributions.feesAndTaxes, portfolio.currencyCode)}</strong></li>
          </ul> : <p className="muted">NOT_ENOUGH_DATA</p>}{explanation('contributionAnalysis', portfolio.explanations.contributionAnalysis)}</section>
          <section><h3>Fixed-deposit maturity exposure</h3>{portfolio.metricStatus.maturityExposure === 'READY' ? <ul className={investmentStyles.analyticsList}>{portfolio.maturityExposure.map(item => <li key={item.bucket}><span>{item.bucket}</span><strong>{item.percentage}% · {money(item.value, portfolio.currencyCode)}</strong></li>)}</ul> : <p className="muted">NOT_ENOUGH_DATA</p>}{explanation('maturityExposure', portfolio.explanations.maturityExposure)}</section>
          <section><h3>Historical comparison</h3>{portfolio.historicalComparison.status === 'READY' ? <p>{portfolio.historicalComparison.from} to {portfolio.historicalComparison.to}: {money(portfolio.historicalComparison.change!, portfolio.currencyCode)} ({portfolio.historicalComparison.percentage}%).</p> : <p className="muted">NOT_ENOUGH_DATA</p>}{explanation('historicalComparison', portfolio.explanations.historicalComparison)}</section>
        </div>
      </section>)}
    </>}
  </section></main>;
}

type ScenarioProjectionPoint = {
  year: number;
  nominalValue: number;
  inflationAdjustedValue: number;
  recurringContributions: number;
};
type SavedScenario = {
  id: string;
  name: string;
  currencyCode: string;
  startingCapital: string;
  recurringContribution: string;
  contributionFrequency: string;
  expectedAnnualReturn: string;
  durationYears: number;
  projection: ScenarioProjectionPoint[];
  financialPlan: { id: string; goalId: string; projectedTarget: string; actualContributions: string } | null;
};
type ScenarioSpace = { id: string; baseCurrency: string };
const scenarioFrequencyLabels: Record<string, string> = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'every two weeks',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};
export function ScenarioPlanning() {
  const [space, setSpace] = useState<ScenarioSpace | null>(null);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function loadScenarios() {
    const spaces = await api('spaces') as ScenarioSpace[];
    if (!spaces[0]) throw new Error('No financial space is available.');
    setSpace(spaces[0]);
    setScenarios(await api(`spaces/${spaces[0].id}/scenarios`) as SavedScenario[]);
  }
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces') as ScenarioSpace[];
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/scenarios`) as SavedScenario[];
      if (active) { setSpace(spaces[0]); setScenarios(result); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load scenarios.'); }
  })(); return () => { active = false; }; }, []);
  function money(value: number | string, currency: string) {
    const number = typeof value === 'number' ? value : Number(value);
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(number); }
    catch { return `${currency} ${number.toFixed(2)}`; }
  }
  async function createScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!space) return;
    const formElement = event.currentTarget;
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(formElement);
    const payload = {
      name: String(form.get('name')),
      startingCapital: String(form.get('startingCapital')),
      recurringContribution: String(form.get('recurringContribution')),
      contributionFrequency: String(form.get('contributionFrequency')),
      expectedAnnualReturn: String(form.get('expectedAnnualReturn')),
      durationYears: Number(form.get('durationYears')),
      inflationRate: String(form.get('inflationRate')),
      annualContributionGrowth: String(form.get('annualContributionGrowth')),
    };
    try {
      await api(`spaces/${space.id}/scenarios`, payload);
      formElement.reset();
      await loadScenarios();
      setMessage('Scenario saved. Projections are estimates based on your assumptions, not guaranteed outcomes.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this scenario.'); }
    finally { setBusy(false); }
  }
  async function convertScenario(scenario: SavedScenario) {
    if (!space) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`spaces/${space.id}/scenarios/${scenario.id}/convert`, {});
      await loadScenarios();
      setMessage(`${scenario.name} is now a goal-linked financial plan. Record actual goal contributions separately to track progress.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to convert this scenario.'); }
    finally { setBusy(false); }
  }
  return <main className="dashboard"><section className={`${scenarioStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">PLANNING · WHAT-IF PROJECTIONS</p><h1>Scenario planning</h1>
    <p className="muted">Explore alternatives using a starting amount, regular contributions, assumed return, duration, inflation and contribution growth. Projections are estimates, not promises; nothing is invested or transferred automatically.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <section className={scenarioStyles.panel}>
      <h2>Create a scenario</h2>
      <form className={scenarioStyles.form} onSubmit={event => void createScenario(event)}>
        <label>Scenario name<input name="name" required maxLength={100} placeholder="Steady monthly saving" /></label>
        <label>Starting capital<input name="startingCapital" type="number" min="0" step="0.0001" defaultValue="0" required /></label>
        <label>Recurring contribution<input name="recurringContribution" type="number" min="0.0001" step="0.0001" defaultValue="100" required /></label>
        <label>Contribution frequency<select name="contributionFrequency" defaultValue="MONTHLY"><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every two weeks</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label>
        <label>Assumed annual return (%)<input name="expectedAnnualReturn" type="number" min="-100" max="100" step="0.0001" defaultValue="5" required /></label>
        <label>Duration (years)<input name="durationYears" type="number" min="1" max="50" step="1" defaultValue="10" required /></label>
        <label>Inflation (%)<input name="inflationRate" type="number" min="0" max="100" step="0.0001" defaultValue="2" required /></label>
        <label>Annual contribution growth (%)<input name="annualContributionGrowth" type="number" min="-100" max="100" step="0.0001" defaultValue="0" required /></label>
        <p className={scenarioStyles.hint}>Amounts use {space?.baseCurrency ?? 'your space currency'}. Payments are modeled at the end of each contribution interval. Return and inflation are annual percentage assumptions.</p>
        <button type="submit" disabled={busy || !space}>{busy ? 'Working…' : 'Calculate and save scenario'}</button>
      </form>
    </section>
    {scenarios.length > 0 && <section className={scenarioStyles.panel}>
      <h2>Compare scenarios</h2>
      <div className={scenarioStyles.tableWrap}><table className={scenarioStyles.comparison}>
        <thead><tr><th>Scenario</th><th>Duration</th><th>Nominal projection</th><th>Inflation-adjusted</th><th>Regular contribution</th><th>Assumed return</th></tr></thead>
        <tbody>{scenarios.map(scenario => {
          const final = scenario.projection.at(-1);
          return <tr key={scenario.id}><th scope="row">{scenario.name}</th><td>{scenario.durationYears} years</td><td>{final ? money(final.nominalValue, scenario.currencyCode) : '—'}</td><td>{final ? money(final.inflationAdjustedValue, scenario.currencyCode) : '—'}</td><td>{money(scenario.recurringContribution, scenario.currencyCode)} {scenarioFrequencyLabels[scenario.contributionFrequency]}</td><td>{scenario.expectedAnnualReturn}%</td></tr>;
        })}</tbody>
      </table></div>
    </section>}
    <div className={scenarioStyles.scenarios}>
      {scenarios.map(scenario => <article className={scenarioStyles.scenario} key={scenario.id}>
        <div className={scenarioStyles.heading}><div><p className="eyebrow">{scenario.currencyCode} · {scenario.durationYears} YEARS</p><h2>{scenario.name}</h2><p className="muted">{money(scenario.startingCapital, scenario.currencyCode)} starting capital · {money(scenario.recurringContribution, scenario.currencyCode)} {scenarioFrequencyLabels[scenario.contributionFrequency]} · {scenario.expectedAnnualReturn}% assumed annual return</p></div>
          {scenario.financialPlan ? <strong>Plan created</strong> : <button type="button" disabled={busy} onClick={() => void convertScenario(scenario)}>Use this as my plan</button>}
        </div>
        {scenario.financialPlan && <p className={scenarioStyles.planStatus}>Goal-linked plan · projected target {money(scenario.financialPlan.projectedTarget, scenario.currencyCode)} · recorded goal contributions {money(scenario.financialPlan.actualContributions, scenario.currencyCode)}</p>}
        <div className={scenarioStyles.tableWrap}><table className={scenarioStyles.projection}>
          <thead><tr><th>Year</th><th>Nominal value</th><th>Today’s value after inflation</th><th>Recurring contributions</th></tr></thead>
          <tbody>{scenario.projection.map(point => <tr key={point.year}><th scope="row">{point.year}</th><td>{money(point.nominalValue, scenario.currencyCode)}</td><td>{money(point.inflationAdjustedValue, scenario.currencyCode)}</td><td>{money(point.recurringContributions, scenario.currencyCode)}</td></tr>)}</tbody>
        </table></div>
        <p className={scenarioStyles.hint}>Expected returns are not guaranteed. Starting capital and assumed growth are not recorded as actual contributions. Currency is not converted.</p>
      </article>)}
    </div>
  </section></main>;
}

type FinancialProfileView = {
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  savingsRatePercent: number | null;
  monthlyCashFlow: number | null;
  savingsBalance: number | null;
  emergencyFundMonths: number | null;
  netWorthByCurrency: Array<{ currencyCode: string; netWorth: number }>;
  dataFreshness: 'UP_TO_DATE' | 'UPDATE_RECOMMENDED';
  limitations: string[];
};
type FinancialStrategyView = {
  id: string;
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  explanation: string;
  observedValue: string;
  threshold: string;
  decision: 'PROPOSED' | 'SELECTED' | 'MODIFIED' | 'REJECTED';
  feedback: 'HELPFUL' | 'NOT_HELPFUL' | 'NOT_APPLICABLE' | null;
  userNote: string | null;
  respondedAt: string | null;
};
type FinancialReviewView = {
  id: string;
  trigger: 'MONTHLY' | 'ON_DEMAND';
  monthlyPeriod: string | null;
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  profile: FinancialProfileView;
  strategies: FinancialStrategyView[];
};
type ReviewSpace = { id: string };
export function FinancialReview() {
  const [space, setSpace] = useState<ReviewSpace | null>(null);
  const [reviews, setReviews] = useState<FinancialReviewView[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function loadReviews() {
    const spaces = await api('spaces') as Array<ReviewSpace & { baseCurrency: string }>;
    if (!spaces[0]) throw new Error('No financial space is available.');
    setSpace(spaces[0]);
    const result = await api(`spaces/${spaces[0].id}/financial-reviews`) as FinancialReviewView[];
    setReviews(result);
    if (!selectedReviewId && result[0]) setSelectedReviewId(result[0].id);
  }
  useEffect(() => { let active = true; (async () => {
    try {
      const spaces = await api('spaces') as Array<ReviewSpace & { baseCurrency: string }>;
      if (!spaces[0]) throw new Error('No financial space is available.');
      const result = await api(`spaces/${spaces[0].id}/financial-reviews`) as FinancialReviewView[];
      if (active) { setSpace(spaces[0]); setReviews(result); setSelectedReviewId(result[0]?.id ?? ''); }
    } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load financial reviews.'); }
  })(); return () => { active = false; }; }, []);
  const selectedReview = reviews.find(review => review.id === selectedReviewId) ?? reviews[0];
  function money(value: number | null, currency: string) {
    if (value === null) return 'Not enough recorded data';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
    catch { return `${currency} ${value.toFixed(2)}`; }
  }
  async function generateReview(trigger: 'MONTHLY' | 'ON_DEMAND') {
    if (!space) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(`spaces/${space.id}/financial-reviews`, { trigger }) as FinancialReviewView;
      setReviews(current => [result, ...current.filter(review => review.id !== result.id)]);
      setSelectedReviewId(result.id);
      setMessage(trigger === 'MONTHLY' ? 'Monthly review is ready. Repeating this action will return the same review for this month.' : 'On-demand review is ready.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to generate this financial review.'); }
    finally { setBusy(false); }
  }
  async function respond(
    review: FinancialReviewView,
    strategy: FinancialStrategyView,
    response: { decision?: 'SELECTED' | 'MODIFIED' | 'REJECTED'; feedback?: 'HELPFUL' | 'NOT_HELPFUL' | 'NOT_APPLICABLE'; userNote?: string },
  ) {
    if (!space) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(`spaces/${space.id}/financial-reviews/${review.id}/strategies/${strategy.id}/response`, response) as Partial<FinancialStrategyView>;
      setReviews(current => current.map(item => item.id === review.id
        ? { ...item, strategies: item.strategies.map(candidate => candidate.id === strategy.id ? { ...candidate, ...result } : candidate) }
        : item));
      setMessage('Your response was recorded. It does not change financial records or calculations.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record your response.'); }
    finally { setBusy(false); }
  }
  return <main className="dashboard"><section className={`${insightStyles.page} ${workspaceStyles.page}`}>
    <p className="eyebrow">FINANCIAL INTELLIGENCE · PRIVATE REVIEW</p><h1>Financial review</h1>
    <p className="muted">Reviews are generated locally from summarized, validated records using transparent rules. No financial records are sent to an AI provider. This is informational, not personalized investment, tax, or legal advice.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    <div className={insightStyles.actions}>
      <button type="button" disabled={busy || !space} onClick={() => void generateReview('ON_DEMAND')}>Generate on-demand review</button>
      <button type="button" disabled={busy || !space} onClick={() => void generateReview('MONTHLY')}>Generate this month’s review</button>
    </div>
    {reviews.length > 0 && <label className={insightStyles.reviewSelector}>Past reviews
      <select value={selectedReview?.id ?? ''} onChange={event => setSelectedReviewId(event.target.value)}>
        {reviews.map(review => <option key={review.id} value={review.id}>{review.trigger === 'MONTHLY' ? `Monthly · ${review.monthlyPeriod}` : `On demand · ${new Date(review.createdAt).toLocaleDateString()}`}</option>)}
      </select>
    </label>}
    {!selectedReview ? <section className={insightStyles.panel}><h2>No review generated yet</h2><p className="muted">Generate an on-demand review to see what can be summarized from your recent records.</p></section> : <>
      <section className={insightStyles.panel}>
        <div className={insightStyles.heading}><div><p className="eyebrow">{selectedReview.currencyCode} · {selectedReview.periodStart} TO {selectedReview.periodEnd}</p><h2>Profile summary</h2></div><strong>{selectedReview.profile.dataFreshness.replaceAll('_', ' ')}</strong></div>
        <div className={insightStyles.metrics}>
          <article><span>Average monthly income</span><strong>{money(selectedReview.profile.monthlyIncome, selectedReview.currencyCode)}</strong></article>
          <article><span>Average monthly expenses</span><strong>{money(selectedReview.profile.monthlyExpenses, selectedReview.currencyCode)}</strong></article>
          <article><span>Monthly savings rate</span><strong>{selectedReview.profile.savingsRatePercent === null ? 'Not enough recorded data' : `${selectedReview.profile.savingsRatePercent}%`}</strong></article>
          <article><span>Average monthly cash flow</span><strong>{money(selectedReview.profile.monthlyCashFlow, selectedReview.currencyCode)}</strong></article>
          <article><span>Tracked savings balance</span><strong>{money(selectedReview.profile.savingsBalance, selectedReview.currencyCode)}</strong></article>
          <article><span>Emergency-fund coverage estimate</span><strong>{selectedReview.profile.emergencyFundMonths === null ? 'Not enough recorded data' : `${selectedReview.profile.emergencyFundMonths} months`}</strong></article>
        </div>
        <h3>Tracked net worth by currency</h3>
        {selectedReview.profile.netWorthByCurrency.length
          ? <ul className={insightStyles.netWorth}>{selectedReview.profile.netWorthByCurrency.map(item => <li key={item.currencyCode}>{item.currencyCode}<strong>{money(item.netWorth, item.currencyCode)}</strong></li>)}</ul>
          : <p className="muted">No tracked net-worth records.</p>}
        <details className={insightStyles.limitations}><summary>Data scope and limitations</summary><ul>{selectedReview.profile.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul></details>
      </section>
      <section className={insightStyles.panel}>
        <h2>Possible strategies</h2>
        <p className="muted">Strategies are generated by deterministic rules from this snapshot, not by an AI model. Review the source fact before acting.</p>
        {!selectedReview.strategies.length ? <p>No configured rules were triggered, or there is not enough data to evaluate them.</p> : <div className={insightStyles.strategies}>
          {selectedReview.strategies.map(strategy => <article className={insightStyles.strategy} key={strategy.id}>
            <div className={insightStyles.heading}><div><p className="eyebrow">{strategy.severity} · {strategy.code.replaceAll('_', ' ')}</p><h3>{strategy.title}</h3></div><strong>{strategy.decision.replaceAll('_', ' ')}</strong></div>
            <p>{strategy.explanation}</p>
            <p className={insightStyles.fact}>Observed value: {strategy.observedValue} · Rule threshold: {strategy.threshold}</p>
            {strategy.userNote && <p className={insightStyles.note}>Your modified strategy: {strategy.userNote}</p>}
            <div className={insightStyles.responseForm}>
              <label>Modification note (required when modifying)<textarea value={notes[strategy.id] ?? ''} maxLength={500} onChange={event => setNotes(current => ({ ...current, [strategy.id]: event.target.value }))} /></label>
              <div>
                <button type="button" disabled={busy} onClick={() => void respond(selectedReview, strategy, { decision: 'SELECTED' })}>Select</button>
                <button type="button" disabled={busy || !notes[strategy.id]?.trim()} onClick={() => void respond(selectedReview, strategy, { decision: 'MODIFIED', userNote: notes[strategy.id]?.trim() })}>Modify</button>
                <button type="button" disabled={busy} onClick={() => void respond(selectedReview, strategy, { decision: 'REJECTED' })}>Reject</button>
              </div>
              <div>
                <button type="button" disabled={busy} onClick={() => void respond(selectedReview, strategy, { feedback: 'HELPFUL' })}>Helpful</button>
                <button type="button" disabled={busy} onClick={() => void respond(selectedReview, strategy, { feedback: 'NOT_HELPFUL' })}>Not helpful</button>
                <button type="button" disabled={busy} onClick={() => void respond(selectedReview, strategy, { feedback: 'NOT_APPLICABLE' })}>Not applicable</button>
              </div>
            </div>
          </article>)}
        </div>}
      </section>
    </>}
  </section></main>;
}
