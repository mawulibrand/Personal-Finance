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
    <section className={incomeStyles.page}><p className="eyebrow">PERSONAL SPACE</p><h1>Income</h1><p className="muted">Track income sources and confirm salary only when it reaches you. Flexible payday dates stay open until the final possible date passes.</p>
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
