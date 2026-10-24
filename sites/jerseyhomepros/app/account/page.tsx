"use client";
import { useCallback, useEffect, useState } from "react";
import { SITE } from "../../lib/site";
import { tradeOr } from "../../lib/trades";
import { sb } from "./sb";

type Counts = { views: number; request_clicks: number; website_clicks: number; leads: number };
type Me = {
  company: string; contact: string; email: string; trade: string; status: string;
  slug: string | null; listed: boolean; bio: string; website: string; services: string;
  service_zips: string[]; radius_miles: number; leads_enabled: boolean;
};
type Lead = {
  id: string; created_at: string; matched_at: string; name: string; phone: string; email: string;
  zip: string; property_type: string; service: string; timing: string; details: string;
  phone_consent: boolean; distance_miles: number | null; from_profile: boolean;
};
type Req = { id: string; created_at: string; kind: string; items: string[]; details: string; status: string };
type Data = {
  me: Me; last30: Counts; months: ({ month: string } & Counts)[]; leads: Lead[]; totalLeads: number;
  requests: Req[]; marketingItems: string[]; leadItems: string[]; areaDemand30: number;
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function Account() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [note, setNote] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [unlinked, setUnlinked] = useState(false);

  // Profile form
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [listed, setListed] = useState(false);
  const [profileNote, setProfileNote] = useState("");

  // Service request form
  const [kind, setKind] = useState<"more_leads" | "marketing">("more_leads");
  const [items, setItems] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [reqNote, setReqNote] = useState("");

  useEffect(() => {
    const c = sb();
    if (!c) { setNote("Sign-in is not configured yet."); setReady(true); return; }
    c.auth.getSession().then(({ data }) => { setToken(data.session?.access_token ?? null); setReady(true); });
    const { data: sub } = c.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (t: string) => {
    const r = await fetch("/api/account", { headers: { Authorization: `Bearer ${t}` } });
    if (r.status === 401) { setUnlinked(true); return; }
    const j = (await r.json()) as Data;
    setUnlinked(false);
    setData(j);
    setBio(j.me.bio);
    setWebsite(j.me.website);
    setListed(j.me.listed);
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "link") {
      setNote("Sending…");
      const r = await fetch("/api/account/forgot", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      setNote(j.message ?? "If that email is in the network, a link is on its way.");
      return;
    }
    const c = sb();
    if (!c) return;
    setNote("Signing in…");
    const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
    setPassword("");
    setNote(error ? "That email and password don't match. First time here? Use the setup link option below." : "");
  }

  async function signOut() {
    await sb()?.auth.signOut();
    setToken(null);
    setData(null);
    setUnlinked(false);
  }

  async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    if (!token) return { ok: false, error: "Not signed in." };
    const r = await fetch("/api/account", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: j.error ?? "Something went wrong." };
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileNote("Saving…");
    const out = await post({ action: "update_profile", bio, website, listed });
    setProfileNote(out.ok ? "Saved." : out.error ?? "");
    if (out.ok && token) load(token);
  }

  async function sendRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setReqNote("Sending…");
    const out = await post({ action: "service_request", kind, items, details });
    if (out.ok) {
      setReqNote(`Sent. ${SITE.operator} will contact you at ${data?.me.email}.`);
      setItems([]);
      setDetails("");
      if (token) load(token);
    } else {
      setReqNote(out.error ?? "");
    }
  }

  if (!ready) return <main className="simplepage" />;

  if (!token) {
    return (
      <main className="simplepage">
        <a className="back" href="/">&larr; {SITE.brand}</a>
        <div className="simplecard">
          <div className="eyebrow dark">PRO DASHBOARD</div>
          <h1>Sign in.</h1>
          <p>
            {mode === "password"
              ? "For approved companies in the network. See your leads, your profile stats, and ask us for more."
              : "We'll email a link to the address on your network application. Use it to set up your account or choose a new password."}
          </p>
          <form onSubmit={signIn}>
            <label>
              Email address
              <input required type="email" autoComplete="username" value={email}
                     onChange={(e) => setEmail(e.target.value)} placeholder="you@yourcompany.com" />
            </label>
            {mode === "password" && (
              <label>
                Password
                <input required type="password" autoComplete="current-password" value={password}
                       onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            <button className="button gold submit">
              {mode === "password" ? "Sign in →" : "Email me a link →"}
            </button>
          </form>
          <p>
            <button className="textlink" type="button" style={{ color: "#60615a", background: "none", border: 0, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    onClick={() => { setMode(mode === "password" ? "link" : "password"); setNote(""); }}>
              {mode === "password" ? "First time here, or forgot your password? Email me a link" : "Sign in with a password instead"}
            </button>
          </p>
          <p role="status">{note}</p>
          <p>Not in the network yet? <a href="/join" style={{ textDecoration: "underline" }}>Apply to join</a>.</p>
        </div>
      </main>
    );
  }

  if (unlinked) {
    return (
      <main className="simplepage">
        <div className="simplecard">
          <h1>No company on this account.</h1>
          <p>
            This sign-in isn&rsquo;t connected to a company in the network. Use the setup link from your
            email, or contact {SITE.operatorEmail}.
          </p>
          <button className="button darkbtn submit" onClick={signOut}>Sign out</button>
        </div>
      </main>
    );
  }

  if (!data) return <main className="adminpage"><p className="wrap adminnote">Loading&hellip;</p></main>;

  const t = tradeOr(data.me.trade);
  const options = kind === "marketing" ? data.marketingItems : data.leadItems;

  return (
    <main className="adminpage">
      <div className="wrap adminbar">
        <a className="brand" href="/">
          <span className="brandmark">{SITE.mark}</span>
          <span>{SITE.wordmark} <b>{SITE.wordmarkBold}</b><small>PRO DASHBOARD</small></span>
        </a>
        <span className="adminsignout">
          <button className="textlink" style={{ color: "#60615a", background: "none", border: 0, cursor: "pointer" }} onClick={signOut}>Sign out</button>
        </span>
      </div>

      <div className="wrap">
        <h1 style={{ font: "400 clamp(30px,4vw,44px)/1.1 Georgia,serif", margin: "6px 0 4px" }}>{data.me.company}</h1>
        <p className="adminnote" style={{ marginTop: 0 }}>
          {t.label} &middot; within {data.me.radius_miles} mi of ZIP {data.me.service_zips.join(", ")}
          {data.me.status !== "approved" && <> &middot; <b>Not currently receiving leads ({data.me.status})</b></>}
        </p>

        {data.me.status === "approved" && !data.me.leads_enabled && (
          <div className="claimbox" style={{ margin: "16px 0 6px" }}>
            <div className="eyebrow">YOU&rsquo;RE NOT RECEIVING REQUESTS YET</div>
            <h3>
              {data.areaDemand30 > 0
                ? `${data.areaDemand30} ${data.areaDemand30 === 1 ? "homeowner" : "homeowners"} near you asked for ${t.work} in the last 30 days.`
                : `Start receiving ${t.label.toLowerCase()} requests in your area.`}
            </h3>
            <p>
              Your page is yours, but requests from homeowners in your area are going to other companies.
              Turn requests on and they come to you by email the moment they arrive.
            </p>
            <button className="button gold" type="button"
                    onClick={async () => {
                      setReqNote("Sending…");
                      const out = await post({ action: "service_request", kind: "more_leads", items: ["Start receiving requests"], details: "" });
                      setReqNote(out.ok ? `Sent. ${SITE.operator} will contact you about pricing at ${data.me.email}.` : out.error ?? "");
                      if (out.ok && token) load(token);
                    }}>
              Start receiving requests <span>&rarr;</span>
            </button>
            {reqNote && <p role="status" style={{ marginTop: 12 }}>{reqNote}</p>}
          </div>
        )}

        <div className="eyebrow dark" style={{ margin: "22px 0 10px" }}>LAST 30 DAYS</div>
        <div className="adminstats">
          <div><strong>{data.last30.views}</strong><span>PROFILE VISITS</span></div>
          <div><strong>{data.last30.request_clicks}</strong><span>ESTIMATE CLICKS</span></div>
          <div><strong>{data.last30.website_clicks}</strong><span>WEBSITE CLICKS</span></div>
          <div><strong>{data.last30.leads}</strong><span>LEADS SENT TO YOU</span></div>
        </div>

        <div className="acctgrid">
          <div>
            <section className="acctcard">
              <h2>Month by month</h2>
              <p>
                Visits count one per person per day, from browsers only. Leads are requests we sent
                you{data.me.listed ? "" : " — your profile is hidden, so visits and clicks stay at zero until you list it"}.
              </p>
              <table className="accttable">
                <thead>
                  <tr><th>Month</th><th style={{ textAlign: "right" }}>Visits</th><th style={{ textAlign: "right" }}>Estimate clicks</th><th style={{ textAlign: "right" }}>Website clicks</th><th style={{ textAlign: "right" }}>Leads</th></tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="num">{m.views}</td>
                      <td className="num">{m.request_clicks}</td>
                      <td className="num">{m.website_clicks}</td>
                      <td className="num">{m.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="acctcard">
              <h2>Your leads</h2>
              <p>
                {data.totalLeads === 0
                  ? "No requests have been sent to you yet. Each one also arrives by email the moment it comes in."
                  : `${data.totalLeads} ${data.totalLeads === 1 ? "request" : "requests"} sent to you${data.totalLeads > data.leads.length ? `; the latest ${data.leads.length} are below` : ""}. Each one also arrived by email.`}
              </p>
              {data.leads.map((l) => (
                <div className="acctlead" key={l.id}>
                  <b>{l.service}</b> &middot; ZIP {l.zip}
                  {l.distance_miles !== null ? ` · ${l.distance_miles} mi` : ""}
                  {l.from_profile ? " · from your profile" : ""}
                  <br />
                  <span className="adminmeta">{when(l.matched_at)} &middot; {l.property_type} &middot; {l.timing}</span>
                  <br />
                  {l.name} &middot; {l.email}{l.phone ? ` · ${l.phone}` : ""}
                  {l.details && <><br /><span style={{ color: "#55564f" }}>{l.details}</span></>}
                  <br />
                  <span style={{ fontWeight: 700, color: l.phone_consent ? "#2f5330" : "#6d2626" }}>
                    {l.phone_consent ? "Calls and texts permitted, 8am–8pm." : "EMAIL ONLY — do not call or text."}
                  </span>
                </div>
              ))}
            </section>
          </div>

          <div>
            <section className="acctcard">
              <h2>Your profile</h2>
              <p>
                {data.me.listed && data.me.slug
                  ? <>Live at <a href={`/pros/${data.me.slug}`} target="_blank" rel="noopener" style={{ textDecoration: "underline" }}>{SITE.domain}/pros/{data.me.slug}</a>.</>
                  : "Hidden. Homeowners can't find it in the directory until you show it."}
              </p>
              <form onSubmit={saveProfile}>
                <label>
                  About your company
                  <textarea rows={4} maxLength={600} value={bio} onChange={(e) => setBio(e.target.value)}
                            placeholder="What you do, how long you've done it, what homeowners should know." />
                </label>
                <label>
                  Website <span className="optional">(optional)</span>
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourcompany.com" />
                </label>
                <label className="check">
                  <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
                  <span>Show my profile in the {SITE.brand} directory. It shows your company name, trade, services, the area you cover, this description and your website. It never shows your phone or email.</span>
                </label>
                <button className="button gold submit" type="submit">Save profile &rarr;</button>
                <p role="status" className="adminnote">{profileNote}</p>
              </form>
              <p className="adminmeta">
                To change your company name, services or ZIP codes, ask below and we&rsquo;ll update them.
              </p>
            </section>

            <section className="acctcard">
              <h2>Ask for more</h2>
              <p>Tell {SITE.operator} what you want. It goes straight to us, and we&rsquo;ll get back to you.</p>
              <form onSubmit={sendRequest}>
                <label>
                  I want
                  <select value={kind} onChange={(e) => { setKind(e.target.value as "more_leads" | "marketing"); setItems([]); }}>
                    <option value="more_leads">More leads</option>
                    <option value="marketing">Marketing for my business</option>
                  </select>
                </label>
                {options.map((o) => (
                  <label className="check" key={o}>
                    <input type="checkbox" checked={items.includes(o)}
                           onChange={(e) => setItems(e.target.checked ? [...items, o] : items.filter((i) => i !== o))} />
                    <span>{o}</span>
                  </label>
                ))}
                <label>
                  Anything else <span className="optional">(optional)</span>
                  <textarea rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)}
                            placeholder={kind === "more_leads" ? "Which towns or ZIP codes?" : "What would help most?"} />
                </label>
                <button className="button darkbtn submit" type="submit">Send request &rarr;</button>
                <p role="status" className="adminnote">{reqNote}</p>
              </form>
              {data.requests.length > 0 && (
                <>
                  <div className="eyebrow dark" style={{ margin: "14px 0 6px" }}>YOUR REQUESTS</div>
                  {data.requests.map((r) => (
                    <div className="perfrow" key={r.id}>
                      <span>
                        {when(r.created_at)} &middot; {r.kind === "marketing" ? "Marketing" : "More leads"}
                        {r.items.length > 0 ? ` — ${r.items.join(", ")}` : ""}
                      </span>
                      <span className={`pill pill-${r.status === "done" ? "closed" : r.status === "contacted" ? "working" : "new"}`}>{r.status}</span>
                    </div>
                  ))}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
