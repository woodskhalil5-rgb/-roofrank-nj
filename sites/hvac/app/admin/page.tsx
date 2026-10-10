'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SITE } from '../../lib/site';

type Roofer = {
  id: string; created_at: string; company: string; contact: string; email: string;
  phone: string; service_zips: string[]; radius_miles: number; services: string;
  status: string; notes: string;
};
type Lead = {
  id: string; created_at: string; name: string; phone: string; email: string; zip: string;
  property_type: string; service: string; timing: string; details: string; status: string;
  phone_consent?: boolean;
  feedback?: string | null;
  followup_sent_at?: string | null;
};

type Perf = {
  roofer_id: string; company: string; status: string;
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
  const [tab, setTab] = useState<'leads' | 'roofers' | 'performance'>('leads');
  const [roofers, setRoofers] = useState<Roofer[]>([]);
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
      setRoofers(j.roofers ?? []);
      setLeads(j.leads ?? []);
      setMatches(j.matches ?? []);
      setPerf(j.performance ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

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
        <a className="back" href="/">← {SITE.brand}</a>
        <div className="simplecard">
          <div className="eyebrow dark">ADMIN</div>
          <h1>Sign in.</h1>
          <p>Enter your admin email and we&rsquo;ll send a one-time sign-in link.</p>
          <form onSubmit={sendLink}>
            <label>
              Email address
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourdomain.com" />
            </label>
            <button className="button gold submit">Send sign-in link →</button>
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

  const pending = roofers.filter((r) => r.status === 'pending');
  const unsent = matches.filter((m) => !m.notified_at).length;

  return (
    <main className="adminpage">
      <div className="wrap adminbar">
        <a className="brand" href="/"><span className="brandmark">{SITE.mark}</span><span>{SITE.wordmark} <b>NJ</b><small>ADMIN</small></span></a>
        <button className="textlink adminsignout" onClick={signOut}>Sign out</button>
      </div>

      <div className="wrap">
        <div className="adminstats">
          <div><strong>{leads.length}</strong><span>Leads</span></div>
          <div><strong>{roofers.filter((r) => r.status === 'approved').length}</strong><span>Approved roofers</span></div>
          <div><strong>{pending.length}</strong><span>Pending review</span></div>
          <div><strong>{unsent}</strong><span>Unsent notices</span></div>
        </div>

        <div className="admintabs">
          <button className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>Leads</button>
          <button className={tab === 'roofers' ? 'on' : ''} onClick={() => setTab('roofers')}>Roofers</button>
          <button className={tab === 'performance' ? 'on' : ''} onClick={() => setTab('performance')}>Performance</button>
          {unsent > 0 && (
            <button className="retrybtn" onClick={() => act({ action: 'retry_notifications' })}>
              Retry {unsent} unsent {unsent === 1 ? 'notice' : 'notices'}
            </button>
          )}
        </div>

        {loading && <p className="adminnote">Loading…</p>}

        {tab === 'leads' && (
          leads.length === 0 ? <p className="adminnote">No leads yet.</p> : (
            <div className="admingrid">
              {leads.map((l) => {
                const mine = matches.filter((m) => m.lead_id === l.id);
                return (
                  <article key={l.id} className="admincard">
                    <header>
                      <b>{l.name}</b>
                      <span className={`pill pill-${l.status}`}>{l.status}</span>
                    </header>
                    <p className="adminmeta">{when(l.created_at)} · ZIP {l.zip} · {l.property_type}</p>
                    <p><b>{l.service}</b> — {l.timing}</p>
                    {l.details && <p className="admindetails">{l.details}</p>}
                    <p className="adminmeta">{l.phone} · {l.email}</p>
                    <p className={l.phone_consent ? 'consentok' : 'consentno'}>
                      {l.phone_consent
                        ? '✓ Consented to calls and texts'
                        : '✕ Email only — no call/text consent'}
                    </p>
                    {l.feedback && (
                      <p className={l.feedback === 'no_contact' ? 'fbbad' : 'fbok'}>
                        {l.feedback === 'hired' ? '✓ Homeowner hired a matched roofer'
                          : l.feedback === 'deciding' ? '· Homeowner still deciding'
                          : '⚠ Homeowner says NOBODY contacted them'}
                      </p>
                    )}
                    {!l.feedback && l.followup_sent_at && (
                      <p className="fbwait">Follow-up sent — awaiting reply</p>
                    )}
                    <div className="adminmatches">
                      {mine.length === 0
                        ? <span className="nomatch">No roofer covers this ZIP yet</span>
                        : mine.map((m) => (
                            <span key={m.id} className={m.notified_at ? 'matchok' : 'matchpending'}>
                              {m.roofers?.company ?? 'Roofer'}
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
          perf.length === 0 ? <p className="adminnote">No roofers yet.</p> : (
            <div className="admingrid">
              {perf.map((p) => (
                <article key={p.roofer_id} className="admincard">
                  <header>
                    <b>{p.company}</b>
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

        {tab === 'roofers' && (
          roofers.length === 0 ? <p className="adminnote">No applications yet.</p> : (
            <div className="admingrid">
              {roofers.map((r) => (
                <article key={r.id} className="admincard">
                  <header>
                    <b>{r.company}</b>
                    <span className={`pill pill-${r.status}`}>{r.status}</span>
                  </header>
                  <p className="adminmeta">{when(r.created_at)} · {r.contact}</p>
                  <p>{r.services} · within {r.radius_miles} mi</p>
                  <p className="adminmeta">ZIPs: {r.service_zips.join(', ')}</p>
                  <p className="adminmeta">{r.phone} · {r.email}</p>
                  {r.notes && <p className="admindetails">{r.notes}</p>}
                  <div className="adminactions">
                    {['approved', 'pending', 'rejected'].filter((s) => s !== r.status).map((s) => (
                      <button key={s} onClick={() => act({ action: 'set_roofer_status', id: r.id, status: s })}>
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
