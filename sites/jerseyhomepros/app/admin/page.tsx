'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SITE } from '../../lib/site';
import { TRADES, TRADE_SLUGS, tradeOr, type TradeSlug } from '../../lib/trades';
import { attrLabel, type Attr } from '../../lib/attribution';

type Provider = {
  attribution?: Attr | null;
  billing_plan?: 'none' | 'ppl' | 'partner'; billing_started_at?: string | null;
  card_on_file_at?: string | null; card_brand?: string | null; card_last4?: string | null;
  id: string; created_at: string; company: string; contact: string; email: string;
  phone: string; service_zips: string[]; radius_miles: number; services: string;
  status: string; notes: string; trade: string;
  approved_at?: string | null;
  // Proof the contact rules were actually sent. Null on an approved provider
  // means nobody knows whether they received them.
  welcomed_at?: string | null;
  welcome_error?: string | null;
  slug?: string | null;
  listed?: boolean;
  auth_user_id?: string | null;
  setup_token_expires?: string | null;
  leads_enabled?: boolean;
  source?: string;
  city?: string;
  license_label?: string;
  license_number?: string;
  license_status?: string;
  license_checked_at?: string | null;
  insurance_url?: string | null;
  insurance_uploaded_at?: string | null;
  verified_at?: string | null;
  verified_method?: string;
};
type Claim = {
  id: string; created_at: string; roofer_id: string; contact: string; email: string; phone: string;
  role: string; status: string; operator_notify_error?: string | null;
  roofers: { company: string; trade: string; city: string; status: string; license_number: string; website: string } | null;
};
type ServiceRequest = {
  id: string; created_at: string; kind: string; items: string[]; details: string; status: string;
  operator_notify_error?: string | null;
  roofers: { company: string; contact: string; email: string; phone: string; trade: string } | null;
};
type Charge = {
  id: string; created_at: string; kind: string; amount_cents: number; description: string; status: string;
  credit_reason: string | null; hosted_invoice_url: string | null; paid_at: string | null; roofer_id: string;
  roofers: { company: string } | null;
};
type BillingData = { on: boolean; test: boolean; prices: { trade: string; price_cents: number }[]; free_leads: number; charges: Charge[] };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

type Lead = {
  attribution?: Attr | null;
  id: string; created_at: string; name: string; phone: string; email: string; zip: string;
  property_type: string; service: string; timing: string; details: string; status: string;
  trade: string;
  phone_consent?: boolean;
  feedback?: string | null;
  followup_sent_at?: string | null;
  // Proof the operator was told. Null here means nobody was: see the alert
  // banner below, which is the only warning that does not itself rely on email.
  operator_notified_at?: string | null;
  operator_notify_error?: string | null;
};
type Perf = {
  roofer_id: string; company: string; status: string; trade: string;
  leads_received: number; feedback_received: number; jobs_won: number;
  no_contact_reports: number; unsent_notifications: number;
};
type Match = {
  id: string; lead_id: string; roofer_id: string; distance_miles: number | null;
  notified_at: string | null; notify_error: string | null;
  roofers: { company: string } | null;
};

let client: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function Admin() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'leads' | 'providers' | 'performance' | 'requests' | 'claims' | 'unclaimed' | 'billing'>('leads');
  const [tradeFilter, setTradeFilter] = useState<TradeSlug | 'all'>('all');
  // Rejected providers and spam leads stay out of the way until asked for.
  const [showArchived, setShowArchived] = useState(false);
  /** Narrows the lead list to the ones with no confirmed operator alert. */
  const [alertOnly, setAlertOnly] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [perf, setPerf] = useState<Perf[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const c = sb();
    if (!c) { setNote('Sign-in is not configured yet.'); return; }
    c.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = c.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin', { headers: { Authorization: `Bearer ${t}` } });
      if (r.status === 401) { setDenied(true); return; }
      const j = await r.json();
      setDenied(false);
      setProviders(j.providers ?? []);
      setLeads(j.leads ?? []);
      setMatches(j.matches ?? []);
      setPerf(j.performance ?? []);
      setRequests(j.requests ?? []);
      setClaims(j.claims ?? []);
      setBilling(j.billing ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  /** A lead nobody was told about. Spam is excluded: it is already triaged. */
  const unalerted = useCallback(
    (l: Lead) => l.status !== 'spam' && (!l.operator_notified_at || Boolean(l.operator_notify_error)),
    []
  );

  /**
   * Counted across ALL leads, not the filtered view. A banner that hid itself
   * because the trade filter happened to be set to Roofing would be worse
   * than no banner at all.
   */
  const alertTrouble = useMemo(() => {
    const live = leads.filter((l) => l.status !== 'spam');
    const never = live.filter((l) => !l.operator_notified_at).length;
    const errored = live.filter((l) => Boolean(l.operator_notify_error)).length;
    return { never, errored, total: live.filter(unalerted).length };
  }, [leads, unalerted]);

  const shownLeads = useMemo(
    () => leads.filter((l) =>
      (tradeFilter === 'all' || l.trade === tradeFilter) &&
      (showArchived || l.status !== 'spam') &&
      (!alertOnly || unalerted(l))
    ),
    [leads, tradeFilter, showArchived, alertOnly, unalerted]
  );
  const shownProviders = useMemo(
    () => providers.filter((p) =>
      (tradeFilter === 'all' || p.trade === tradeFilter) &&
      p.status !== 'unclaimed' &&
      (showArchived || p.status !== 'rejected')
    ),
    [providers, tradeFilter, showArchived]
  );
  const shownPerf = useMemo(
    () => perf.filter((p) => tradeFilter === 'all' || p.trade === tradeFilter),
    [perf, tradeFilter]
  );

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const c = sb();
    if (!c) return;

    if (mode === 'password') {
      setNote('Signing in…');
      const { error } = await c.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setNote(error ? error.message : '');
      setPassword('');
      return;
    }

    setNote('Sending…');
    const { error } = await c.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/admin` : undefined },
    });
    setNote(
      error
        ? error.message
        : 'Check your inbox. The link works once — open it in this browser, not your mail app’s built-in one.'
    );
  }

  /** Lets an already signed-in admin set a password, so email is never required again. */
  async function setOwnPassword() {
    const c = sb();
    if (!c) return;
    const pw = window.prompt('New password (at least 8 characters):');
    if (pw === null) return;
    if (pw.length < 8) { setNote('That password is too short.'); return; }
    const { error } = await c.auth.updateUser({ password: pw });
    setNote(error ? error.message : 'Password set. You can sign in with it from any device.');
  }

  async function act(payload: Record<string, unknown>) {
    if (!token) return;
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setNote(j.error ?? 'That action failed.');
    else if (payload.action === 'invite_account' || payload.action === 'approve_claim') setNote(`Dashboard link emailed to ${j.to}.`);
    await load(token);
  }

  async function signOut() {
    await sb()?.auth.signOut();
    setToken(null);
    setDenied(false);
  }

  if (!token) {
    return (
      <main className="simplepage">
        <a className="back" href="/">&larr; {SITE.brand}</a>
        <div className="simplecard">
          <div className="eyebrow dark">ADMIN</div>
          <h1>Sign in.</h1>
          <p>
            {mode === 'password'
              ? 'Enter your admin email and password.'
              : 'We’ll email you a one-time sign-in link.'}
          </p>
          <form onSubmit={signIn}>
            <label>
              Email address
              <input id="admin-email" required type="email" autoComplete="username"
                     value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="you@yourdomain.com" />
            </label>
            {mode === 'password' && (
              <label>
                Password
                <input id="admin-password" required type="password" autoComplete="current-password"
                       value={password} onChange={(e) => setPassword(e.target.value)}
                       placeholder="Your password" />
              </label>
            )}
            <button className="button gold submit">
              {mode === 'password' ? 'Sign in →' : 'Send sign-in link →'}
            </button>
          </form>
          <p>
            <button className="textlink" type="button"
                    onClick={() => { setMode(mode === 'password' ? 'link' : 'password'); setNote(''); }}>
              {mode === 'password'
                ? 'No password yet? Email me a link instead'
                : 'Sign in with a password instead'}
            </button>
          </p>
          <p role="status">{note}</p>
        </div>
      </main>
    );
  }

  if (denied) {
    return (
      <main className="simplepage">
        <div className="simplecard">
          <h1>Not authorised.</h1>
          <p>That account isn&rsquo;t on the admin list.</p>
          <button className="button darkbtn submit" onClick={signOut}>Sign out</button>
        </div>
      </main>
    );
  }

  const pending = shownProviders.filter((p) => p.status === 'pending');
  const unclaimed = providers.filter((p) =>
    p.status === 'unclaimed' && (tradeFilter === 'all' || p.trade === tradeFilter));
  const newClaims = claims.filter((c) => c.status === 'new').length;
  const shownLeadIds = new Set(shownLeads.map((l) => l.id));
  const unsent = matches.filter((m) => !m.notified_at && shownLeadIds.has(m.lead_id)).length;

  return (
    <main className="adminpage">
      <div className="wrap adminbar">
        <a className="brand" href="/">
          <span className="brandmark">{SITE.mark}</span>
          <span>{SITE.wordmark} <b>{SITE.wordmarkBold}</b><small>ADMIN</small></span>
        </a>
        <span className="adminsignout">
          <a className="textlink" href="/estimator">Estimator</a>
          {' · '}
          <button className="textlink" onClick={setOwnPassword}>Set password</button>
          {' · '}
          <button className="textlink" onClick={signOut}>Sign out</button>
        </span>
      </div>
      {note && <p className="wrap adminnote" role="status">{note}</p>}

      {/* The alert system cannot be trusted to report its own failure by
          email, so it reports it here instead. A lead with no operator alert
          is a homeowner who was promised a follow-up that nobody knows to
          make — which is worse than a lead that reached no contractor. */}
      {alertTrouble.total > 0 && (
        <div className="wrap">
          <div className="alertbanner" role="alert">
            <strong>
              {alertTrouble.total} {alertTrouble.total === 1 ? 'lead has' : 'leads have'} no confirmed operator alert.
            </strong>
            <span>
              {alertTrouble.never > 0 && `${alertTrouble.never} never produced an alert. `}
              {alertTrouble.errored > 0 && `${alertTrouble.errored} returned a send error. `}
              Treat these as unread requests and follow them up by hand.
            </span>
            <button onClick={() => { setTab('leads'); setAlertOnly(!alertOnly); }}>
              {alertOnly ? 'Show all leads' : 'Show only these'}
            </button>
          </div>
        </div>
      )}

      <div className="wrap">
        <div className="admintabs tradefilter">
          <button className={tradeFilter === 'all' ? 'on' : ''} onClick={() => setTradeFilter('all')}>All trades</button>
          {TRADE_SLUGS.map((s) => (
            <button key={s} className={tradeFilter === s ? 'on' : ''} onClick={() => setTradeFilter(s)}>
              {TRADES[s].label}
            </button>
          ))}
          <button className={showArchived ? 'on' : ''} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hiding nothing' : 'Show archived'}
          </button>
        </div>

        <div className="adminstats">
          <div><strong>{shownLeads.length}</strong><span>Leads</span></div>
          <div><strong>{shownProviders.filter((p) => p.status === 'approved').length}</strong><span>Approved pros</span></div>
          <div><strong>{pending.length}</strong><span>Pending review</span></div>
          <div><strong>{unsent}</strong><span>Unsent notices</span></div>
        </div>

        <div className="admintabs">
          <button className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>Leads</button>
          <button className={tab === 'providers' ? 'on' : ''} onClick={() => setTab('providers')}>Pros</button>
          <button className={tab === 'performance' ? 'on' : ''} onClick={() => setTab('performance')}>Performance</button>
          <button className={tab === 'claims' ? 'on' : ''} onClick={() => setTab('claims')}>
            Claims{newClaims > 0 ? ` (${newClaims})` : ''}
          </button>
          <button className={tab === 'unclaimed' ? 'on' : ''} onClick={() => setTab('unclaimed')}>
            Unclaimed listings ({unclaimed.length})
          </button>
          <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
            Pro requests{requests.filter((r) => r.status === 'new').length > 0 ? ` (${requests.filter((r) => r.status === 'new').length})` : ''}
          </button>
          <button className={tab === 'billing' ? 'on' : ''} onClick={() => setTab('billing')}>Billing</button>
          {unsent > 0 && (
            <button className="retrybtn" onClick={() => act({ action: 'retry_notifications' })}>
              Retry {unsent} unsent {unsent === 1 ? 'notice' : 'notices'}
            </button>
          )}
        </div>

        {loading && <p className="adminnote">Loading&hellip;</p>}

        {tab === 'leads' && (
          shownLeads.length === 0 ? <p className="adminnote">No leads yet.</p> : (
            <div className="admingrid">
              {shownLeads.map((l) => {
                const mine = matches.filter((m) => m.lead_id === l.id);
                return (
                  <article key={l.id} className="admincard">
                    <header>
                      <b>{l.name}</b>
                      <span className="tradechip">{tradeOr(l.trade).label}</span>
                      <span className={`pill pill-${l.status}`}>{l.status}</span>
                    </header>
                    <p className="adminmeta">{when(l.created_at)} &middot; ZIP {l.zip} &middot; {l.property_type}</p>
                    {attrLabel(l.attribution) && <p className="adminmeta">From: {attrLabel(l.attribution)}</p>}
                    <p><b>{l.service}</b> &mdash; {l.timing}</p>
                    {l.details && <p className="admindetails">{l.details}</p>}
                    <p className="adminmeta">{l.phone} &middot; {l.email}</p>
                    <p className={l.phone_consent ? 'consentok' : 'consentno'}>
                      {l.phone_consent
                        ? '✓ Consented to calls and texts'
                        : '✕ Email only — no call/text consent'}
                    </p>
                    {l.feedback && (
                      <p className={l.feedback === 'no_contact' ? 'fbbad' : 'fbok'}>
                        {l.feedback === 'hired' ? '✓ Homeowner hired a matched pro'
                          : l.feedback === 'deciding' ? '· Homeowner still deciding'
                          : '⚠ Homeowner says NOBODY contacted them'}
                      </p>
                    )}
                    {!l.feedback && l.followup_sent_at && (
                      <p className="fbwait">Follow-up sent &mdash; awaiting reply</p>
                    )}
                    <div className="adminmatches">
                      {mine.length === 0
                        ? <span className="nomatch">No {tradeOr(l.trade).label.toLowerCase()} pro covers this ZIP yet</span>
                        : mine.map((m) => (
                            <span key={m.id} className={m.notified_at ? 'matchok' : 'matchpending'}>
                              {m.roofers?.company ?? 'Pro'}
                              {m.distance_miles !== null ? ` · ${m.distance_miles} mi` : ''}
                              {m.notified_at ? ' · emailed' : m.notify_error ? ` · ${m.notify_error}` : ' · not sent'}
                            </span>
                          ))}
                    </div>
                    <div className="adminactions">
                      <button onClick={() => act({ action: 'rematch_lead', id: l.id })}>Re-match</button>
                      {['new', 'working', 'closed', 'spam'].filter((s) => s !== l.status).map((s) => (
                        <button key={s} onClick={() => act({ action: 'set_lead_status', id: l.id, status: s })}>
                          Mark {s}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        )}

        {tab === 'claims' && (
          claims.length === 0 ? <p className="adminnote">No claims yet. They come from the Claim button on unclaimed directory pages.</p> : (
            <div className="admingrid">
              {claims.map((c) => (
                <article key={c.id} className="admincard">
                  <header>
                    <b>{c.roofers?.company ?? 'Listing'}</b>
                    <span className="tradechip">{tradeOr(c.roofers?.trade ?? '').label}</span>
                    <span className={`pill pill-${c.status === 'approved' ? 'approved' : c.status === 'rejected' ? 'rejected' : 'new'}`}>{c.status}</span>
                  </header>
                  <p className="adminmeta">{when(c.created_at)}{c.roofers?.city ? ` · ${c.roofers.city}` : ''}</p>
                  <p><b>{c.contact}</b>{c.role ? ` — ${c.role}` : ''}</p>
                  <p className="adminmeta">{c.phone} &middot; {c.email}</p>
                  {c.status === 'new' && (
                    <p className="fbwait">
                      Check they work there first: call the number on the company&rsquo;s own website or state
                      registration{c.roofers?.license_number ? ` (#${c.roofers.license_number})` : ''}, not the one above.
                    </p>
                  )}
                  {c.operator_notify_error && <p className="consentno">Alert email failed &middot; {c.operator_notify_error}</p>}
                  {c.status === 'new' && (
                    <div className="adminactions">
                      <button onClick={() => act({ action: 'approve_claim', id: c.id })}>Approve &amp; send dashboard link</button>
                      <button onClick={() => act({ action: 'reject_claim', id: c.id })}>Reject</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )
        )}

        {tab === 'billing' && billing && (
          <div className="adminbilling">
            {!billing.on
              ? <p className="adminnote">Stripe isn&rsquo;t connected yet (STRIPE_SECRET_KEY not set). You can set prices now; nothing is charged until it is.</p>
              : <p className="adminnote">Stripe connected{billing.test ? ' in TEST mode: no real money moves' : ' (LIVE)'}.</p>}
            <h3>Price per lead, by trade</h3>
            <p className="adminmeta">Only companies you switch to &ldquo;Pay per lead&rdquo; are charged, and only for leads delivered after you switch them. Blank = no price.</p>
            <div className="admingrid">
              {TRADE_SLUGS.map((t) => {
                const pr = billing.prices.find((x) => x.trade === t);
                return (
                  <form key={t} className="admincard" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('d') ?? '').trim(); act({ action: 'set_lead_price', trade: t, dollars: v === '' ? null : v }); }}>
                    <b>{TRADES[t].label}</b>
                    <label className="adminmeta">$ per lead <input name="d" inputMode="decimal" defaultValue={pr ? (pr.price_cents / 100).toFixed(2) : ''} key={pr?.price_cents ?? 'none'} /></label>
                    <div className="adminactions"><button type="submit">Save</button></div>
                  </form>
                );
              })}
            </div>
            <form className="adminactions" onSubmit={(e) => { e.preventDefault(); act({ action: 'set_free_leads', n: Number(new FormData(e.currentTarget).get('n')) }); }}>
              <label className="adminmeta">Free leads per company <input name="n" inputMode="numeric" defaultValue={billing.free_leads} key={billing.free_leads} style={{ width: 60 }} /></label>
              <button type="submit">Save</button>
              {billing.on && <button type="button" onClick={() => act({ action: 'bill_now' })}>Bill all pending now</button>}
            </form>
            <p className="adminmeta">Statements go out automatically on the 1st. Partner referral fees are billed from the Estimator (&ldquo;Bill fee&rdquo;) once the contractor says the homeowner paid.</p>

            <h3>Charges</h3>
            {billing.charges.length === 0 ? <p className="adminnote">No charges yet.</p> : (
              <table className="accttable">
                <thead><tr><th>Date</th><th>Company</th><th>What</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {billing.charges.map((c) => (
                    <tr key={c.id}>
                      <td>{when(c.created_at)}</td>
                      <td>{c.roofers?.company ?? ''}</td>
                      <td>{c.description}{c.credit_reason ? ` (credited: ${c.credit_reason})` : ''}</td>
                      <td>{usd(c.amount_cents)}</td>
                      <td>{c.hosted_invoice_url ? <a href={c.hosted_invoice_url} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>{c.status}</a> : c.status}</td>
                      <td>{(c.status === 'pending' || c.status === 'free') && c.kind === 'lead' && (
                        <form onSubmit={(e) => { e.preventDefault(); act({ action: 'credit_charge', id: c.id, reason: String(new FormData(e.currentTarget).get('r') ?? '') }); }}>
                          <select name="r" defaultValue="Wrong number"><option>Wrong number</option><option>Outside service area</option><option>Duplicate</option><option>Not a real request</option></select>
                          <button type="submit">Credit</button>
                        </form>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'unclaimed' && (
          unclaimed.length === 0 ? <p className="adminnote">No unclaimed listings yet.</p> : (
            <div className="admingrid">
              {unclaimed.map((p) => (
                <article key={p.id} className="admincard">
                  <header>
                    <b>{p.company}</b>
                    <span className="tradechip">{tradeOr(p.trade).label}</span>
                    <span className={`pill pill-${p.listed ? 'approved' : 'pending'}`}>{p.listed ? 'listed' : 'hidden'}</span>
                  </header>
                  <p className="adminmeta">{p.city || 'No town'} &middot; ZIP {p.service_zips.join(', ')}</p>
                  {p.license_checked_at
                    ? <p className="consentok">{p.license_label || 'Registration'} #{p.license_number} &middot; {p.license_status} &middot; checked {when(p.license_checked_at)}</p>
                    : <p className="fbwait">Registration not checked</p>}
                  {p.slug && <p className="adminmeta"><a href={`/pros/${p.slug}`} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>/pros/{p.slug}</a></p>}
                  <div className="adminactions">
                    <button onClick={() => act({ action: 'set_listed', id: p.id, listed: !p.listed })}>
                      {p.listed ? 'Hide' : 'List'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )
        )}

        {tab === 'requests' && (
          requests.length === 0 ? <p className="adminnote">No requests from pros yet. They arrive from the Ask for more form on each pro&rsquo;s dashboard.</p> : (
            <div className="admingrid">
              {requests.map((r) => (
                <article key={r.id} className="admincard">
                  <header>
                    <b>{r.roofers?.company ?? 'Pro'}</b>
                    <span className="tradechip">{r.kind === 'marketing' ? 'Marketing' : 'More leads'}</span>
                    <span className={`pill pill-${r.status === 'done' ? 'closed' : r.status === 'contacted' ? 'working' : 'new'}`}>{r.status}</span>
                  </header>
                  <p className="adminmeta">{when(r.created_at)} &middot; {r.roofers?.contact}</p>
                  {r.items.length > 0 && <p><b>{r.items.join(', ')}</b></p>}
                  {r.details && <p className="admindetails">{r.details}</p>}
                  <p className="adminmeta">{r.roofers?.phone} &middot; {r.roofers?.email}</p>
                  {r.operator_notify_error && <p className="consentno">Alert email failed &middot; {r.operator_notify_error}</p>}
                  <div className="adminactions">
                    {['new', 'contacted', 'done'].filter((st) => st !== r.status).map((st) => (
                      <button key={st} onClick={() => act({ action: 'set_request_status', id: r.id, status: st })}>
                        Mark {st}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )
        )}

        {tab === 'performance' && (
          shownPerf.length === 0 ? <p className="adminnote">No pros yet.</p> : (
            <div className="admingrid">
              {shownPerf.map((p) => (
                <article key={p.roofer_id} className="admincard">
                  <header>
                    <b>{p.company}</b>
                    <span className="tradechip">{tradeOr(p.trade).label}</span>
                    <span className={`pill pill-${p.status}`}>{p.status}</span>
                  </header>
                  <div className="perfrow"><span>Leads received</span><b>{p.leads_received}</b></div>
                  <div className="perfrow"><span>Jobs won</span><b>{p.jobs_won}</b></div>
                  <div className="perfrow"><span>Feedback received</span><b>{p.feedback_received}</b></div>
                  <div className={p.no_contact_reports > 0 ? 'perfrow perfbad' : 'perfrow'}>
                    <span>&ldquo;Nobody contacted me&rdquo;</span><b>{p.no_contact_reports}</b>
                  </div>
                  {p.unsent_notifications > 0 && (
                    <div className="perfrow perfbad"><span>Unsent notices</span><b>{p.unsent_notifications}</b></div>
                  )}
                  {p.leads_received > 0 && (
                    <p className="adminmeta">
                      Win rate {Math.round((p.jobs_won / p.leads_received) * 100)}% of leads received
                    </p>
                  )}
                  {p.no_contact_reports > 0 && (
                    <p className="admindetails">Homeowners report no contact. Follow up before sending more leads.</p>
                  )}
                </article>
              ))}
            </div>
          )
        )}

        {tab === 'providers' && (
          shownProviders.length === 0 ? <p className="adminnote">No applications yet.</p> : (
            <div className="admingrid">
              {shownProviders.map((p) => (
                <article key={p.id} className="admincard">
                  <header>
                    <b>{p.company}</b>
                    <span className="tradechip">{tradeOr(p.trade).label}</span>
                    <span className={`pill pill-${p.status}`}>{p.status}</span>
                  </header>
                  <p className="adminmeta">{when(p.created_at)} &middot; {p.contact}</p>
                  {attrLabel(p.attribution) && <p className="adminmeta">From: {attrLabel(p.attribution)}</p>}
                  <p>{p.services} &middot; within {p.radius_miles} mi</p>
                  <p className="adminmeta">ZIPs: {p.service_zips.join(', ')}</p>
                  <p className="adminmeta">{p.phone} &middot; {p.email}</p>
                  {p.notes && <p className="admindetails">{p.notes}</p>}

                  {/* Verified badge: shown publicly only after a real check. */}
                  <div className="adminverify">
                    {p.verified_at
                      ? <p className="consentok">✓ Verified {when(p.verified_at)} &middot; {p.verified_method}</p>
                      : <p className="fbwait">Not verified</p>}
                    <p className="adminmeta">
                      HIC #: {p.license_number || 'not given'}
                      {p.license_number && <> &middot; <a href="https://newjersey.mylicense.com/verification/Search.aspx?facility=Y" target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>check registry</a></>}
                      {' · '}Insurance: {p.insurance_url
                        ? <a href={p.insurance_url} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>open certificate{p.insurance_uploaded_at ? ` (${when(p.insurance_uploaded_at)})` : ''}</a>
                        : 'not uploaded'}
                    </p>
                    <div className="adminactions">
                      {!p.verified_at && p.license_number && (
                        <button onClick={() => act({ action: 'set_verified', id: p.id, verified: true, method: `HIC #${p.license_number} checked on the state registry` })}>Verify: HIC checked</button>
                      )}
                      {!p.verified_at && p.insurance_url && (
                        <button onClick={() => act({ action: 'set_verified', id: p.id, verified: true, method: 'Insurance certificate checked' })}>Verify: insurance checked</button>
                      )}
                      {p.verified_at && <button onClick={() => act({ action: 'set_verified', id: p.id, verified: false })}>Remove Verified</button>}
                    </div>
                  </div>

                  {p.status === 'approved' && (
                    <div className="adminverify">
                      <p className="adminmeta">
                        Billing: <b>{p.billing_plan === 'ppl' ? 'Pay per lead' : p.billing_plan === 'partner' ? 'Partner (10%)' : 'None'}</b>
                        {p.billing_plan === 'ppl' && p.billing_started_at ? ` since ${when(p.billing_started_at)}` : ''}
                        {' · '}Card: {p.card_on_file_at ? `${p.card_brand ?? 'card'} ••${p.card_last4 ?? ''}` : 'none'}
                      </p>
                      <div className="adminactions">
                        {p.billing_plan !== 'ppl' && <button onClick={() => act({ action: 'set_billing_plan', id: p.id, plan: 'ppl' })}>Pay per lead</button>}
                        {p.billing_plan !== 'partner' && <button onClick={() => act({ action: 'set_billing_plan', id: p.id, plan: 'partner' })}>Partner (10%)</button>}
                        {p.billing_plan !== 'none' && <button onClick={() => act({ action: 'set_billing_plan', id: p.id, plan: 'none' })}>No billing</button>}
                        {p.billing_plan === 'ppl' && billing?.on && <button onClick={() => act({ action: 'bill_now', id: p.id })}>Bill now</button>}
                      </div>
                    </div>
                  )}

                  {/* Whether this contractor was ever sent the contact rules.
                      They start phoning homeowners once approved, so "we never
                      actually told them the rules" needs to be visible rather
                      than inferred. */}
                  {p.status === 'approved' && (
                    p.welcome_error ? (
                      <p className="consentno">Welcome email FAILED &middot; {p.welcome_error}</p>
                    ) : p.welcomed_at ? (
                      <p className="consentok">Welcome email sent {when(p.welcomed_at)}</p>
                    ) : (
                      <p className="fbwait">
                        Welcome email not recorded — they may never have been sent the contact rules.
                      </p>
                    )
                  )}

                  {p.status === 'approved' && (
                    <p className="adminmeta">
                      {p.listed && p.slug
                        ? <>Directory: <a href={`/pros/${p.slug}`} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>/pros/{p.slug}</a></>
                        : 'Directory: hidden'}
                      {' · '}
                      Dashboard: {p.auth_user_id ? 'set up' : p.setup_token_expires ? 'invite sent, not set up yet' : 'not invited'}
                    </p>
                  )}
                  {p.status === 'approved' && (
                    <p className={p.leads_enabled ? 'consentok' : 'fbwait'}>
                      {p.leads_enabled ? 'Receiving requests' : 'Not receiving requests — turn on once they’ve paid'}
                      {p.source === 'public_records' ? ' · claimed listing' : ''}
                    </p>
                  )}

                  <div className="adminactions">
                    {['approved', 'pending', 'rejected'].filter((s) => s !== p.status).map((s) => (
                      <button key={s} onClick={() => act({ action: 'set_provider_status', id: p.id, status: s })}>
                        {s === 'approved' ? 'Approve' : s === 'rejected' ? 'Reject' : 'Set pending'}
                      </button>
                    ))}
                    {p.status === 'approved' && (
                      <button onClick={() => act({ action: 'set_leads_enabled', id: p.id, enabled: !p.leads_enabled })}>
                        {p.leads_enabled ? 'Stop requests' : 'Start requests (paid)'}
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button onClick={() => act({ action: 'set_listed', id: p.id, listed: !p.listed })}>
                        {p.listed ? 'Hide from directory' : 'List in directory'}
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button onClick={() => act({ action: 'invite_account', id: p.id })}>
                        {p.auth_user_id ? 'Email password reset' : p.setup_token_expires ? 'Resend dashboard invite' : 'Invite to dashboard'}
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button onClick={() => act({ action: 'resend_welcome', id: p.id })}>
                        {p.welcomed_at ? 'Resend welcome' : 'Send welcome email'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
}
