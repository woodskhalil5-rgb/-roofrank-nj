'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SITE } from '../../lib/site';
import { TRADES, TRADE_SLUGS, tradeOr, type TradeSlug } from '../../lib/trades';

type Provider = {
  id: string; created_at: string; company: string; contact: string; email: string;
  phone: string; service_zips: string[]; radius_miles: number; services: string;
  status: string; notes: string; trade: string;
};
type Lead = {
  id: string; created_at: string; name: string; phone: string; email: string; zip: string;
  property_type: string; service: string; timing: string; details: string; status: string;
  trade: string;
  phone_consent?: boolean;
  feedback?: string | null;
  followup_sent_at?: string | null;
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
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'leads' | 'providers' | 'performance'>('leads');
  const [tradeFilter, setTradeFilter] = useState<TradeSlug | 'all'>('all');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [perf, setPerf] = useState<Perf[]>([]);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  const shownLeads = useMemo(
    () => leads.filter((l) => tradeFilter === 'all' || l.trade === tradeFilter),
    [leads, tradeFilter]
  );
  const shownProviders = useMemo(
    () => providers.filter((p) => tradeFilter === 'all' || p.trade === tradeFilter),
    [providers, tradeFilter]
  );
  const shownPerf = useMemo(
    () => perf.filter((p) => tradeFilter === 'all' || p.trade === tradeFilter),
    [perf, tradeFilter]
  );

  async function sendLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const c = sb();
    if (!c) return;
    setNote('Sending…');
    const { error } = await c.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/admin` : undefined },
    });
    setNote(error ? error.message : 'Check your inbox for a sign-in link.');
  }

  async function act(payload: Record<string, unknown>) {
    if (!token) return;
    await fetch('/api/admin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
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
          <p>Enter your admin email and we&rsquo;ll send a one-time sign-in link.</p>
          <form onSubmit={sendLink}>
            <label>
              Email address
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourdomain.com" />
            </label>
            <button className="button gold submit">Send sign-in link &rarr;</button>
          </form>
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
  const shownLeadIds = new Set(shownLeads.map((l) => l.id));
  const unsent = matches.filter((m) => !m.notified_at && shownLeadIds.has(m.lead_id)).length;

  return (
    <main className="adminpage">
      <div className="wrap adminbar">
        <a className="brand" href="/">
          <span className="brandmark">{SITE.mark}</span>
          <span>{SITE.wordmark} <b>{SITE.wordmarkBold}</b><small>ADMIN</small></span>
        </a>
        <button className="textlink adminsignout" onClick={signOut}>Sign out</button>
      </div>

      <div className="wrap">
        <div className="admintabs tradefilter">
          <button className={tradeFilter === 'all' ? 'on' : ''} onClick={() => setTradeFilter('all')}>All trades</button>
          {TRADE_SLUGS.map((s) => (
            <button key={s} className={tradeFilter === s ? 'on' : ''} onClick={() => setTradeFilter(s)}>
              {TRADES[s].label}
            </button>
          ))}
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
                  <p>{p.services} &middot; within {p.radius_miles} mi</p>
                  <p className="adminmeta">ZIPs: {p.service_zips.join(', ')}</p>
                  <p className="adminmeta">{p.phone} &middot; {p.email}</p>
                  {p.notes && <p className="admindetails">{p.notes}</p>}
                  <div className="adminactions">
                    {['approved', 'pending', 'rejected'].filter((s) => s !== p.status).map((s) => (
                      <button key={s} onClick={() => act({ action: 'set_provider_status', id: p.id, status: s })}>
                        {s === 'approved' ? 'Approve' : s === 'rejected' ? 'Reject' : 'Set pending'}
                      </button>
                    ))}
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
