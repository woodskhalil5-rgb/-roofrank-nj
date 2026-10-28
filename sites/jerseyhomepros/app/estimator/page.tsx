"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TRADES, TRADE_SLUGS, tradeOr, type TradeSlug } from "../../lib/trades";
import {
  jhpEarnings, lineTotals, money, repCommission, toNum,
  type Estimate, type Line, type PriceItem,
} from "../../lib/estimator";
import { guideFor, TALK } from "../../lib/visits";

/**
 * JHP Estimator. Two kinds of user, one app:
 * - the operator (admin accounts): every job, price book, Road Pros,
 *   settings, sending to contractors, money;
 * - Road Pros (commission field reps): only their assigned visits, a guided
 *   checklist per trade, photos, price-book lines (the range is automatic and
 *   they can't change prices), a help button and their own commission.
 * The server enforces all of this; the screens just follow it.
 */

type Contractor = {
  id: string; company: string; trade: string; email: string; phone: string;
  leads_enabled: boolean; license_number: string | null; license_checked_at: string | null; license_status: string | null;
};
type Rep = {
  id: string; name: string; email: string; phone: string; home_zip?: string; active: boolean;
  bg_status: "pending" | "clear" | "not_clear"; bg_checked_at?: string | null; bg_provider?: string;
  commission_pct: number | null; auth_user_id?: string | null; setup_token_expires?: string | null;
};
type Settings = {
  visits_on: boolean; base_zip: string; radius_miles: number; visit_trades: string[]; rep_commission_pct: number | null;
  auto_assign?: boolean; max_assign_miles?: number;
};
type Applicant = {
  id: string; created_at: string; name: string; email: string; phone: string; home_zip: string;
  has_car: boolean; availability: string; experience: string;
};
type Data = {
  role: "admin" | "rep"; me?: Rep; priceBook: PriceItem[]; estimates: Estimate[];
  contractors?: Contractor[]; reps?: Rep[]; settings?: Settings | null; applications?: Applicant[];
};
type Api = (p: string, i?: RequestInit) => Promise<Record<string, unknown>>;

type Draft = {
  id?: string; trade: TradeSlug;
  homeowner_name: string; homeowner_phone: string; homeowner_email: string;
  address: string; zip: string; problem: string; notes: string;
  items: Line[]; range_low: string; range_high: string;
  share_consent: boolean; share_consent_at: string | null; contact_method: "email" | "phone_email";
  checklist: Record<string, string | boolean>;
};

const blank = (trade: TradeSlug = "roofing"): Draft => ({
  trade, homeowner_name: "", homeowner_phone: "", homeowner_email: "", address: "", zip: "",
  problem: "", notes: "", items: [], range_low: "", range_high: "",
  share_consent: false, share_consent_at: null, contact_method: "email", checklist: {},
});

function fromEstimate(e: Estimate): Draft {
  const t = lineTotals(e.items ?? []);
  const overridden = e.range_low != null && (e.range_low !== t.low || e.range_high !== t.high);
  return {
    id: e.id, trade: tradeOr(e.trade).slug as TradeSlug,
    homeowner_name: e.homeowner_name, homeowner_phone: e.homeowner_phone, homeowner_email: e.homeowner_email,
    address: e.address, zip: e.zip, problem: e.problem, notes: e.notes, items: e.items ?? [],
    range_low: overridden ? String(e.range_low ?? "") : "", range_high: overridden ? String(e.range_high ?? "") : "",
    share_consent: Boolean(e.share_consent_at), share_consent_at: e.share_consent_at, contact_method: e.contact_method,
    checklist: e.checklist ?? {},
  };
}

let client: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

/** Phone photos are 5-10 MB; shrink to ~1600px JPEG before upload. */
async function shrink(file: File, maxSide = 1600): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Can't read that photo.")); i.src = url;
    });
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"); if (!ctx) throw new Error("Can't prepare that photo.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Can't prepare that photo."))), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}

const STATUS_LABEL: Record<string, string> = { requested: "Booked", draft: "Draft", sent: "Sent", signed: "Signed", lost: "Lost" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const post = (api: Api, body: Record<string, unknown>) =>
  api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const isOpen = (e: Estimate) => e.status === "requested" || e.status === "draft" || e.status === "sent";

type View = "jobs" | "book" | "pros" | "settings" | "how" | "edit";

export default function Estimator() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [view, setView] = useState<View>("jobs");
  const [editId, setEditId] = useState<string | null>(null);
  // Changes only when a job is OPENED, so saving a new estimate (which gives it
  // an id) doesn't remount the editor and wipe what was typed.
  const [editKey, setEditKey] = useState(0);

  useEffect(() => {
    const c = sb();
    if (!c) { setNote("Sign-in is not configured."); setReady(true); return; }
    c.auth.getSession().then(({ data }) => { setToken(data.session?.access_token ?? null); setReady(true); });
    const { data: sub } = c.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const api: Api = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) setDenied(true);
    if (!r.ok) throw new Error(j.error || "Something went wrong. Try again.");
    return j;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    try { const j = await api("/api/estimator"); setDenied(false); setData(j as unknown as Data); } catch (e) { setNote((e as Error).message); }
  }, [token, api]);
  useEffect(() => { load(); }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const c = sb(); if (!c) return;
    setNote("Signing in…");
    const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
    setNote(error ? error.message : ""); setPassword("");
  }
  const signOut = () => { sb()?.auth.signOut(); setData(null); };

  if (!ready) return <main className="estpage"><p className="estnote">Loading…</p></main>;

  if (!token) {
    return (
      <main className="estpage">
        <EstBar />
        <form className="estcard estsignin" onSubmit={signIn}>
          <h1>Sign in</h1>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="button gold" type="submit">Sign in <span>→</span></button>
          {note && <p className="estnote">{note}</p>}
          <p className="estnote">Road Pros: use the email and password you set up from your invite.</p>
        </form>
      </main>
    );
  }

  if (denied) {
    return (
      <main className="estpage"><EstBar onSignOut={signOut} />
        <div className="estcard"><h1>No access</h1><p>This account isn&rsquo;t an active JHP estimator or Road Pro.</p></div>
      </main>
    );
  }

  if (!data) return <main className="estpage"><EstBar /><p className="estnote">{note || "Loading jobs…"}</p></main>;

  const admin = data.role === "admin";
  const open = (id: string | null) => { setEditId(id); setEditKey((k) => k + 1); setView("edit"); window.scrollTo(0, 0); };
  const tabs: [View, string][] = admin
    ? [["jobs", "Jobs"], ["book", "Prices"], ["pros", "Road Pros"], ["settings", "Settings"]]
    : [["jobs", "My visits"], ["how", "How to"]];

  return (
    <main className="estpage">
      <EstBar onSignOut={signOut} rep={data.me?.name} />
      {view !== "edit" && (
        <div className="esttabs">
          {tabs.map(([v, label]) => <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{label}</button>)}
        </div>
      )}
      {view === "jobs" && <Jobs data={data} onOpen={open} />}
      {view === "book" && admin && <PriceBook data={data} api={api} reload={load} />}
      {view === "pros" && admin && <RoadPros data={data} api={api} reload={load} />}
      {view === "settings" && admin && <SettingsView data={data} api={api} reload={load} />}
      {view === "how" && <HowTo />}
      {view === "edit" && (
        <Editor key={editKey} data={data} api={api} reload={load}
                estimate={data.estimates.find((e) => e.id === editId) ?? null}
                onSaved={(id) => setEditId(id)}
                onClose={() => { setView("jobs"); setEditId(null); load(); }} />
      )}
    </main>
  );
}

function EstBar({ onSignOut, rep }: { onSignOut?: () => void; rep?: string }) {
  return (
    <div className="estbar">
      <a className="brand" href="/estimator"><span className="brandmark">J</span><span>JHP <b>{rep ? "ROAD PRO" : "ESTIMATOR"}</b>{rep && <small>{rep}</small>}</span></a>
      {onSignOut && <button className="adminsignout" onClick={onSignOut}>Sign out</button>}
    </div>
  );
}

/* ───────────────────────── Jobs list ───────────────────────── */

function Jobs({ data, onOpen }: { data: Data; onOpen: (id: string | null) => void }) {
  const admin = data.role === "admin";
  const [filter, setFilter] = useState<"open" | "signed" | "all">("open");
  const ests = data.estimates;
  const signed = ests.filter((e) => e.status === "signed");
  const shown = ests.filter((e) => filter === "all" || (filter === "signed" ? e.status === "signed" : isOpen(e)));
  const company = (id: string | null | undefined) => data.contractors?.find((c) => c.id === id)?.company;
  const repName = (id: string | null | undefined) => data.reps?.find((r) => r.id === id)?.name;

  let tiles: [string, string][];
  if (admin) {
    const earned = signed.reduce((s, e) => s + (jhpEarnings(e) ?? 0), 0);
    const unpaid = signed.filter((e) => !e.fee_paid_at).reduce((s, e) => s + (jhpEarnings(e) ?? 0), 0);
    const repOwed = signed.filter((e) => e.fee_paid_at && !e.rep_paid_at).reduce((s, e) => s + (repCommission(e) ?? 0), 0);
    tiles = [
      [String(ests.filter((e) => e.status === "requested" && !e.rep_id).length), "New bookings to assign"],
      [String(ests.filter(isOpen).length), "Open jobs"],
      [money(earned), "JHP earned"],
      [money(unpaid), "Still owed to JHP"],
      ...(repOwed > 0 ? [[money(repOwed), "Road Pro commission due"] as [string, string]] : []),
    ];
  } else {
    const mine = signed.reduce((s, e) => s + (e.rep_commission ?? 0), 0);
    const paid = signed.filter((e) => e.rep_paid_at).reduce((s, e) => s + (e.rep_commission ?? 0), 0);
    tiles = [
      [String(ests.filter((e) => isOpen(e) && !e.visited_at).length), "Visits to do"],
      [String(signed.length), "Signed"],
      [money(mine), "My commission"],
      [money(paid), "Paid to me"],
    ];
  }

  return (
    <>
      <div className="eststats">
        {tiles.map(([b, s]) => <div key={s}><b>{b}</b><span>{s}</span></div>)}
      </div>
      {!admin && <p className="estnote">Commission is your cut of what JHP earns on a signed job. It&rsquo;s due once the contractor pays JHP.</p>}
      <button className="button gold estnew" onClick={() => onOpen(null)}>+ New {admin ? "estimate" : "walk-up visit"} <span>→</span></button>
      <div className="esttabs small">
        {(["open", "signed", "all"] as const).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "open" ? "Open" : f === "signed" ? "Signed" : "All"}</button>
        ))}
      </div>
      {shown.length === 0 && <p className="estnote">Nothing here yet.</p>}
      <div className="estlist">
        {shown.map((e) => (
          <button key={e.id} className="estjob" onClick={() => onOpen(e.id)}>
            <span className="estrow">
              <span className={`estpill ${e.status}`}>{STATUS_LABEL[e.status]}{e.lane === "B" ? " · JHP job" : ""}</span>
              {e.help_requested_at && isOpen(e) && <span className="estpill help">Help asked</span>}
              {e.visited_at && isOpen(e) && <span className="estpill sent">Visit done</span>}
            </span>
            <b>{e.homeowner_name || "No name yet"}</b>
            <span>{tradeOr(e.trade).label} · {e.zip || "no ZIP"} · {when(e.created_at)}</span>
            {e.visit_times && isOpen(e) && <span>Best times: {e.visit_times}</span>}
            <span>
              {e.range_low != null ? `${money(e.range_low)} – ${money(e.range_high)}` : "Not priced"}
              {admin && company(e.roofer_id) ? ` · ${company(e.roofer_id)}` : ""}
            </span>
            {admin && (e.rep_id ? <span>Road Pro: {repName(e.rep_id) ?? "—"}</span> : e.status === "requested" ? <span className="esterr">Needs a Road Pro</span> : null)}
            {e.status === "signed" && (
              admin ? (
                <span className="estearn">Signed {money(e.signed_price)} · JHP {money(jhpEarnings(e))} {e.fee_paid_at ? "✓ paid" : "· unpaid"}</span>
              ) : (
                <span className="estearn">Signed · your commission {money(e.rep_commission)} {e.rep_paid_at ? "✓ paid" : ""}</span>
              )
            )}
            {admin && e.send_error && <span className="esterr">Email failed: {e.send_error}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Price book (admin) ───────────────────────── */

function signedStats(ests: Estimate[], trade: string) {
  const s = ests.filter((e) => e.trade === trade && e.status === "signed" && e.signed_price != null);
  if (!s.length) return null;
  const avg = s.reduce((a, e) => a + (e.signed_price ?? 0), 0) / s.length;
  const ranged = s.filter((e) => e.range_low != null && e.range_high != null);
  const inRange = ranged.filter((e) => (e.signed_price ?? 0) >= (e.range_low ?? 0) && (e.signed_price ?? 0) <= (e.range_high ?? 0)).length;
  return { n: s.length, avg, ranged: ranged.length, inRange };
}

function PriceBook({ data, api, reload }: { data: Data; api: Api; reload: () => void }) {
  const [trade, setTrade] = useState<TradeSlug>("roofing");
  const empty = { id: "", item: "", unit: "", low: "", high: "", source: "" };
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState("");
  const items = data.priceBook.filter((p) => p.trade === trade);
  const stats = signedStats(data.estimates, trade);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg("Saving…");
    try { await post(api, { action: "price_save", trade, ...form, id: form.id || undefined }); setForm(empty); setMsg("Saved."); reload(); }
    catch (err) { setMsg((err as Error).message); }
  }
  async function remove(id: string) {
    if (!window.confirm("Remove this price? Estimates that already used it keep their numbers.")) return;
    try { await post(api, { action: "price_delete", id }); reload(); } catch (err) { setMsg((err as Error).message); }
  }

  return (
    <>
      <select className="esttrade" value={trade} onChange={(e) => setTrade(e.target.value as TradeSlug)}>
        {TRADE_SLUGS.map((s) => <option key={s} value={s}>{TRADES[s].label}</option>)}
      </select>
      <p className="estnote">
        Real numbers only: your partner contractors&rsquo; rate sheets or your own signed jobs. Write where each one came from.
        Road Pros can use these lines but can&rsquo;t change the prices.
      </p>
      <div className="estcard">
        <h2>Signed {TRADES[trade].label} jobs</h2>
        {stats ? (
          <p>{stats.n} signed · average {money(stats.avg)}
            {stats.ranged > 0 && <> · {stats.inRange} of {stats.ranged} landed inside your estimate range</>}</p>
        ) : <p className="estnote">None yet. Once jobs sign, this shows what they really sold for around here.</p>}
      </div>
      <div className="estlist">
        {items.length === 0 && <p className="estnote">No prices for {TRADES[trade].label} yet.</p>}
        {items.map((p) => (
          <div key={p.id} className="estcard estprice">
            <b>{p.item}</b>
            <span>{money(p.low)} – {money(p.high)} per {p.unit}</span>
            {p.source && <span className="estnote">Source: {p.source}</span>}
            <div className="estrow">
              <button className="estlink" onClick={() => setForm({ id: p.id, item: p.item, unit: p.unit, low: String(p.low), high: String(p.high), source: p.source })}>Edit</button>
              <button className="estlink" onClick={() => remove(p.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <form className="estcard" onSubmit={save}>
        <h2>{form.id ? "Edit price" : "Add a price"}</h2>
        <label>Item<input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="Roof replacement, architectural shingle" required /></label>
        <div className="estgrid3">
          <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="square" /></label>
          <label>Low $<input inputMode="decimal" value={form.low} onChange={(e) => setForm({ ...form, low: e.target.value })} required /></label>
          <label>High $<input inputMode="decimal" value={form.high} onChange={(e) => setForm({ ...form, high: e.target.value })} required /></label>
        </div>
        <label>Source<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. partner's rate sheet, Oct 2026" /></label>
        <div className="estrow">
          <button className="button gold" type="submit">{form.id ? "Save" : "Add price"} <span>→</span></button>
          {form.id && <button type="button" className="estlink" onClick={() => setForm(empty)}>Cancel</button>}
        </div>
        {msg && <p className="estnote">{msg}</p>}
      </form>
    </>
  );
}

/* ───────────────────────── Road Pros (admin) ───────────────────────── */

function RoadPros({ data, api, reload }: { data: Data; api: Api; reload: () => void }) {
  const empty = { id: "", name: "", email: "", phone: "", home_zip: "", bg_status: "pending", bg_provider: "", commission_pct: "", active: true };
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState("");
  const reps = data.reps ?? [];
  const def = data.settings?.rep_commission_pct;

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg("Saving…");
    try { await post(api, { action: "rep_save", ...form, id: form.id || undefined }); setForm(empty); setMsg("Saved."); reload(); }
    catch (err) { setMsg((err as Error).message); }
  }
  async function invite(r: Rep) {
    if (!window.confirm(`Email ${r.name} (${r.email}) a link to set up their Road Pro app?`)) return;
    setMsg("Sending…");
    try { await post(api, { action: "rep_invite", id: r.id }); setMsg(`Invite sent to ${r.email}.`); reload(); }
    catch (err) { setMsg((err as Error).message); }
  }

  const BG: Record<string, string> = { pending: "Background check pending", clear: "Background check clear", not_clear: "Did not pass" };
  const apps = data.applications ?? [];
  async function appAction(action: "app_add" | "app_decline", a: Applicant) {
    if (action === "app_decline" && !window.confirm(`Decline ${a.name}? (No email is sent.)`)) return;
    setMsg("Saving…");
    try { await post(api, { action, id: a.id }); setMsg(action === "app_add" ? `${a.name} added. Run their background check, then mark it clear.` : "Declined."); reload(); }
    catch (err) { setMsg((err as Error).message); }
  }

  return (
    <>
      {apps.length > 0 && (
        <section className="estcard estbooked">
          <h2>New applicants · {apps.length}</h2>
          <p className="estnote">From jerseyhomepros.com/road-pros. They&rsquo;ve been emailed the next steps. Call them, then add the ones you want.</p>
          {apps.map((a) => (
            <div key={a.id} className="estapp">
              <b>{a.name}</b>
              <span>{a.phone} · {a.email} · {a.home_zip}{a.has_car ? " · has a car" : " · no car listed"} · applied {when(a.created_at)}</span>
              {a.availability && <span className="estnote">Available: {a.availability}</span>}
              {a.experience && <span className="estnote">{a.experience}</span>}
              <div className="estrow">
                <button className="estlink" onClick={() => appAction("app_add", a)}>Add as Road Pro</button>
                <button className="estlink" onClick={() => appAction("app_decline", a)}>Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}
      <p className="estnote">Recruiting link to post on Indeed, Craigslist and social: <b>jerseyhomepros.com/road-pros</b></p>
      <p className="estnote">
        Visits can only be assigned to a Road Pro whose background check is marked <b>clear</b>. Run checks through a screening
        company (written disclosure and the person&rsquo;s signed OK first). Commission is their cut of what JHP earns
        {def != null ? ` (default ${def}%, change it in Settings)` : " (set a default in Settings)"}.
      </p>
      <div className="estlist">
        {reps.length === 0 && <p className="estnote">No Road Pros yet. Add yourself first if you&rsquo;ll do visits.</p>}
        {reps.map((r) => (
          <div key={r.id} className="estcard estprice">
            <b>{r.name}{!r.active && " (inactive)"}</b>
            <span>{r.email}{r.phone ? ` · ${r.phone}` : ""}{r.home_zip ? ` · lives in ${r.home_zip}` : " · no home ZIP (won't be auto-assigned)"}</span>
            <span className={r.bg_status === "clear" ? "estok" : "esterr"}>
              {BG[r.bg_status]}{r.bg_checked_at ? ` · ${when(r.bg_checked_at)}` : ""}{r.bg_provider ? ` · ${r.bg_provider}` : ""}
            </span>
            <span className="estnote">Commission: {r.commission_pct != null ? `${r.commission_pct}%` : def != null ? `${def}% (default)` : "not set"}
              {" · "}{r.auth_user_id ? "App set up ✓" : r.setup_token_expires ? "Invite sent" : "Not invited yet"}</span>
            <div className="estrow">
              <button className="estlink" onClick={() => setForm({ id: r.id, name: r.name, email: r.email, phone: r.phone, home_zip: r.home_zip ?? "", bg_status: r.bg_status, bg_provider: r.bg_provider ?? "", commission_pct: r.commission_pct != null ? String(r.commission_pct) : "", active: r.active })}>Edit</button>
              {r.active && <button className="estlink" onClick={() => invite(r)}>{r.auth_user_id ? "Send password reset" : "Send app invite"}</button>}
            </div>
          </div>
        ))}
      </div>
      <form className="estcard" onSubmit={save}>
        <h2>{form.id ? "Edit Road Pro" : "Add a Road Pro"}</h2>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <div className="estgrid2">
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Phone<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        </div>
        <label>Home ZIP (for auto-assigning nearby visits)<input inputMode="numeric" maxLength={5} value={form.home_zip} onChange={(e) => setForm({ ...form, home_zip: e.target.value.replace(/\D/g, "") })} /></label>
        <label>Background check
          <select value={form.bg_status} onChange={(e) => setForm({ ...form, bg_status: e.target.value })}>
            <option value="pending">Pending</option><option value="clear">Clear</option><option value="not_clear">Did not pass</option>
          </select>
        </label>
        <div className="estgrid2">
          <label>Screening company<input value={form.bg_provider} onChange={(e) => setForm({ ...form, bg_provider: e.target.value })} placeholder="e.g. Checkr" /></label>
          <label>Commission % (blank = default)<input inputMode="decimal" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} /></label>
        </div>
        <label className="estcheck"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Active</span></label>
        <div className="estrow">
          <button className="button gold" type="submit">{form.id ? "Save" : "Add Road Pro"} <span>→</span></button>
          {form.id && <button type="button" className="estlink" onClick={() => setForm(empty)}>Cancel</button>}
        </div>
        {msg && <p className="estnote">{msg}</p>}
      </form>
    </>
  );
}

/* ───────────────────────── Settings (admin) ───────────────────────── */

function SettingsView({ data, api, reload }: { data: Data; api: Api; reload: () => void }) {
  const s = data.settings;
  const [f, setF] = useState({
    visits_on: s?.visits_on ?? false, base_zip: s?.base_zip ?? "08034", radius_miles: String(s?.radius_miles ?? 25),
    visit_trades: s?.visit_trades ?? [], rep_commission_pct: s?.rep_commission_pct != null ? String(s.rep_commission_pct) : "",
    auto_assign: s?.auto_assign ?? true, max_assign_miles: String(s?.max_assign_miles ?? 40),
  });
  const [msg, setMsg] = useState("");
  const cleared = (data.reps ?? []).filter((r) => r.active && r.bg_status === "clear").length;

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg("Saving…");
    try { await post(api, { action: "settings_save", ...f }); setMsg("Saved."); reload(); }
    catch (err) { setMsg((err as Error).message); }
  }
  const toggle = (t: string) => setF((x) => ({ ...x, visit_trades: x.visit_trades.includes(t) ? x.visit_trades.filter((y) => y !== t) : [...x.visit_trades, t] }));

  return (
    <form className="estcard" onSubmit={save}>
      <h2>Free site-visit offer</h2>
      <label className="estcheck"><input type="checkbox" checked={f.visits_on} onChange={(e) => setF({ ...f, visits_on: e.target.checked })} />
        <span><b>Show &ldquo;Get a free estimate from a JHP Road Pro&rdquo;</b> on the Home Scan and search results.</span></label>
      <p className={cleared > 0 ? "estnote" : "esterr"}>
        It only appears when this is on, the ZIP is inside the area, the service is ticked below, and at least one active Road Pro has a clear
        background check. Right now: {cleared} cleared Road Pro{cleared === 1 ? "" : "s"}.
      </p>
      <div className="estgrid2">
        <label>Area centre ZIP<input inputMode="numeric" maxLength={5} value={f.base_zip} onChange={(e) => setF({ ...f, base_zip: e.target.value.replace(/\D/g, "") })} /></label>
        <label>Radius (miles)<input inputMode="numeric" value={f.radius_miles} onChange={(e) => setF({ ...f, radius_miles: e.target.value })} /></label>
      </div>
      <p className="estnote">08034 (Cherry Hill) with 25 miles covers most of Camden, Gloucester and Burlington counties.</p>
      <h2>Services with free visits</h2>
      <div className="estchips">
        {TRADE_SLUGS.map((t) => (
          <label key={t} className="estcheck"><input type="checkbox" checked={f.visit_trades.includes(t)} onChange={() => toggle(t)} /><span>{TRADES[t].label}</span></label>
        ))}
      </div>
      <h2>Auto-assign</h2>
      <label className="estcheck"><input type="checkbox" checked={f.auto_assign} onChange={(e) => setF({ ...f, auto_assign: e.target.checked })} />
        <span>Give each new booking to the nearest cleared Road Pro with the fewest open visits, email them, and tell the homeowner who&rsquo;s coming.</span></label>
      <label>Only if they live within (miles)<input inputMode="numeric" value={f.max_assign_miles} onChange={(e) => setF({ ...f, max_assign_miles: e.target.value })} /></label>
      <p className="estnote">Nobody close enough? The booking waits for you to assign, and your morning briefing flags it.</p>
      <h2>Road Pro commission</h2>
      <label>Default % of what JHP earns<input inputMode="decimal" value={f.rep_commission_pct} onChange={(e) => setF({ ...f, rep_commission_pct: e.target.value })} placeholder="e.g. 30" /></label>
      <p className="estnote">Copied onto each job when it&rsquo;s assigned, so changing it later never rewrites a deal already made.</p>
      <button className="button gold" type="submit">Save settings <span>✓</span></button>
      {msg && <p className="estnote">{msg}</p>}
    </form>
  );
}

/* ───────────────────────── How to (Road Pros) ───────────────────────── */

function HowTo() {
  return (
    <>
      <section className="estcard">
        <h2>At the door</h2>
        <p>{TALK.opener}</p>
      </section>
      <section className="estcard">
        <h2>Why JHP</h2>
        <ul className="estul">{TALK.why.map((w) => <li key={w}>{w}</li>)}</ul>
      </section>
      <section className="estcard">
        <h2>Closing</h2>
        <p>{TALK.close}</p>
      </section>
      <section className="estcard">
        <h2>Never say or do</h2>
        <ul className="estul">{TALK.never.map((w) => <li key={w}>{w}</li>)}</ul>
      </section>
      <section className="estcard">
        <h2>3-day cancel rule</h2>
        <p>{TALK.cancel}</p>
      </section>
      <p className="estnote">Stuck at a house? Open the job and tap <b>I need help</b>. Khalil gets your photos and your number.</p>
    </>
  );
}

/* ───────────────────────── Job / scope sheet ───────────────────────── */

function Editor({ data, api, reload, estimate, onSaved, onClose }: {
  data: Data; api: Api; reload: () => Promise<void> | void; estimate: Estimate | null;
  onSaved: (id: string) => void; onClose: () => void;
}) {
  const admin = data.role === "admin";
  const [d, setD] = useState<Draft>(() => (estimate ? fromEstimate(estimate) : blank()));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ item: "", unit: "", qty: "", low: "", high: "" });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const book = data.priceBook.filter((p) => p.trade === d.trade);
  const totals = lineTotals(d.items);
  const stats = admin ? signedStats(data.estimates, d.trade) : null;
  const status = estimate?.status ?? "draft";
  const steps = guideFor(d.trade);
  const doneSteps = steps.filter((s) => Boolean(d.checklist[s.id])).length;

  async function save(silent = false): Promise<string | null> {
    setBusy(true); if (!silent) setMsg("Saving…");
    try {
      const j = await post(api, { action: "estimate_save", ...d });
      const id = String(j.id);
      await post(api, { action: "checklist_save", id, checklist: d.checklist });
      if (!d.id) { setD((x) => ({ ...x, id })); onSaved(id); }
      await reload();
      if (!silent) setMsg("Saved.");
      return id;
    } catch (e) { setMsg((e as Error).message); return null; }
    finally { setBusy(false); }
  }

  function addFromBook(id: string) {
    const p = book.find((x) => x.id === id); if (!p) return;
    set("items", [...d.items, { item: p.item, unit: p.unit, qty: 1, low: Number(p.low), high: Number(p.high) }]);
  }
  function addCustom() {
    const qty = toNum(custom.qty), low = toNum(custom.low), high = toNum(custom.high);
    if (!custom.item.trim() || !(qty > 0) || !(low >= 0)) { setMsg("Custom line needs an item, a quantity and a price."); return; }
    set("items", [...d.items, { item: custom.item.trim(), unit: custom.unit.trim() || "each", qty, low, high: high >= low ? high : low }]);
    setCustom({ item: "", unit: "", qty: "", low: "", high: "" }); setMsg("");
  }
  function setQty(i: number, v: string) {
    set("items", d.items.map((l, j) => (j === i ? { ...l, qty: v === "" ? 0 : toNum(v) || 0 } : l)));
  }
  const tick = (id: string, v: string | boolean) => setD((x) => ({ ...x, checklist: { ...x.checklist, [id]: v } }));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const id = d.id ?? (await save(true));
    if (!id) return;
    setBusy(true);
    let n = 0;
    for (const f of Array.from(files)) {
      setMsg(`Uploading photo ${++n} of ${files.length}…`);
      try {
        const blob = await shrink(f);
        const fd = new FormData(); fd.append("estimate_id", id); fd.append("file", blob, "photo.jpg");
        await api("/api/estimator/photo", { method: "POST", body: fd });
      } catch (e) { setMsg((e as Error).message); setBusy(false); await reload(); return; }
    }
    await reload(); setBusy(false); setMsg(`${files.length} photo${files.length > 1 ? "s" : ""} added.`);
  }
  async function removePhoto(pid: string) {
    if (!window.confirm("Delete this photo?")) return;
    try { await api("/api/estimator/photo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pid }) }); await reload(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function del() {
    if (!d.id || !window.confirm("Delete this job and its photos?")) return;
    try { await post(api, { action: "estimate_delete", id: d.id }); onClose(); } catch (e) { setMsg((e as Error).message); }
  }
  async function visitDone() {
    const id = await save(true); if (!id) return;
    try { await post(api, { action: "visit_done", id }); await reload(); setMsg(admin ? "Marked visited." : "Sent to Khalil for pricing. Nice work."); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function help() {
    const note = window.prompt("What do you need help with? (Khalil gets this, your photos and your number)") ?? null;
    if (note === null) return;
    const id = d.id ?? (await save(true)); if (!id) return;
    try { await post(api, { action: "help", id, note }); setMsg("Help request sent. Stay put, Khalil will call you."); await reload(); }
    catch (e) { setMsg((e as Error).message); }
  }

  const repCut = estimate?.rep_commission ?? null;

  return (
    <div className="esteditor">
      <div className="estrow estback">
        <button className="estlink" onClick={onClose}>← All {admin ? "jobs" : "visits"}</button>
        <span className={`estpill ${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <h1>{d.homeowner_name || (admin ? "New estimate" : "New visit")}</h1>

      {estimate?.source === "booking" && (
        <section className="estcard estbooked">
          <h2>Booked online by the homeowner</h2>
          {estimate.visit_times && <p><b>Best times:</b> {estimate.visit_times}</p>}
          <p className="estnote">They agreed to be called or texted to schedule, and to share their details with one contractor.
            {estimate.contact_method === "phone_email" ? " The contractor may call or text them too." : " The contractor must reply by email only."}</p>
          {admin && estimate.consent_text && <details><summary>Exact wording they agreed to</summary><p className="estnote">{estimate.consent_text}</p></details>}
        </section>
      )}

      {admin && d.id && estimate && <AssignBox estimate={estimate} data={data} api={api} reload={reload} />}

      {!admin && (
        <div className="estrow esthelp">
          <button className="button darkbtn" onClick={help} disabled={busy}>I need help <span>!</span></button>
        </div>
      )}

      <section className="estcard">
        <h2>Visit guide · {doneSteps}/{steps.length}</h2>
        <ol className="estguide">
          {steps.map((s) => (
            <li key={s.id} className={d.checklist[s.id] ? "done" : ""}>
              {s.kind === "ask" || s.kind === "measure" ? (
                <label>
                  <span><i>{s.kind === "ask" ? "ASK" : "MEASURE"}</i> {s.text}</span>
                  <input value={String(d.checklist[s.id] ?? "")} onChange={(e) => tick(s.id, e.target.value)} placeholder="Their answer / the number" />
                </label>
              ) : (
                <label className="estcheck">
                  <input type="checkbox" checked={Boolean(d.checklist[s.id])} onChange={(e) => tick(s.id, e.target.checked)} />
                  <span><i>{s.kind === "photo" ? "PHOTO" : "DO"}</i> {s.text}</span>
                </label>
              )}
              {s.hint && <small>{s.hint}</small>}
            </li>
          ))}
        </ol>
      </section>

      <section className="estcard">
        <h2>Homeowner</h2>
        <label>Name<input value={d.homeowner_name} onChange={(e) => set("homeowner_name", e.target.value)} autoComplete="off" /></label>
        <div className="estgrid2">
          <label>Phone<input type="tel" value={d.homeowner_phone} onChange={(e) => set("homeowner_phone", e.target.value)} /></label>
          <label>Email<input type="email" value={d.homeowner_email} onChange={(e) => set("homeowner_email", e.target.value)} /></label>
        </div>
        <label>Address<input value={d.address} onChange={(e) => set("address", e.target.value)} /></label>
        <label>ZIP<input inputMode="numeric" maxLength={5} value={d.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} /></label>
      </section>

      <section className="estcard">
        <h2>The job</h2>
        <label>Service
          <select value={d.trade} onChange={(e) => set("trade", e.target.value as TradeSlug)}>
            {TRADE_SLUGS.map((s) => <option key={s} value={s}>{TRADES[s].label}</option>)}
          </select>
        </label>
        <label>What&rsquo;s the problem?<textarea rows={3} value={d.problem} onChange={(e) => set("problem", e.target.value)} placeholder="What the homeowner told you and what you saw" /></label>
      </section>

      <section className="estcard">
        <h2>Measurements &amp; price</h2>
        {d.items.length === 0 && <p className="estnote">Add a line from the price book and type the quantity you measured. The range adds itself up.</p>}
        {d.items.map((l, i) => (
          <div key={i} className="estline">
            <div><b>{l.item}</b><span>{money(l.low)}–{money(l.high)} per {l.unit}</span></div>
            <label className="estqty"><input inputMode="decimal" value={l.qty || ""} onChange={(e) => setQty(i, e.target.value)} aria-label={`Quantity of ${l.item}`} /><span>{l.unit}</span></label>
            <span className="estlinetotal">{money(l.qty * l.low)}–{money(l.qty * l.high)}</span>
            <button className="estx" onClick={() => set("items", d.items.filter((_, j) => j !== i))} aria-label="Remove line">×</button>
          </div>
        ))}
        {book.length > 0 ? (
          <select value="" onChange={(e) => addFromBook(e.target.value)}>
            <option value="">+ Add from price book…</option>
            {book.map((p) => <option key={p.id} value={p.id}>{p.item} ({money(p.low)}–{money(p.high)}/{p.unit})</option>)}
          </select>
        ) : (
          <p className="estnote">No {TRADES[d.trade].label} prices yet. {admin ? "Add them under Prices, or type a line below." : "Write your measurements in the guide above; Khalil will price it."}</p>
        )}
        {admin && (
          <details className="estcustom">
            <summary>Type a line in</summary>
            <label>Item<input value={custom.item} onChange={(e) => setCustom({ ...custom, item: e.target.value })} /></label>
            <div className="estgrid2">
              <label>Qty<input inputMode="decimal" value={custom.qty} onChange={(e) => setCustom({ ...custom, qty: e.target.value })} /></label>
              <label>Unit<input value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value })} placeholder="sq ft" /></label>
              <label>Low $ each<input inputMode="decimal" value={custom.low} onChange={(e) => setCustom({ ...custom, low: e.target.value })} /></label>
              <label>High $ each<input inputMode="decimal" value={custom.high} onChange={(e) => setCustom({ ...custom, high: e.target.value })} /></label>
            </div>
            <button type="button" className="estlink" onClick={addCustom}>Add line</button>
          </details>
        )}
        <div className="esttotal">
          <span>Estimate range</span>
          <b>{admin && (d.range_low || d.range_high) ? `${money(toNum(d.range_low) || 0)} – ${money(toNum(d.range_high) || toNum(d.range_low) || 0)}` : d.items.length ? `${money(totals.low)} – ${money(totals.high)}` : "—"}</b>
        </div>
        {admin ? (
          <div className="estgrid2">
            <label>Adjust low $ (optional)<input inputMode="decimal" value={d.range_low} onChange={(e) => set("range_low", e.target.value)} placeholder={d.items.length ? String(totals.low) : ""} /></label>
            <label>Adjust high $ (optional)<input inputMode="decimal" value={d.range_high} onChange={(e) => set("range_high", e.target.value)} placeholder={d.items.length ? String(totals.high) : ""} /></label>
          </div>
        ) : (
          <p className="estnote">This range comes from JHP&rsquo;s price book. You can show it to the homeowner; the contractor sets the final price.</p>
        )}
        {stats && <p className="estnote">Your signed {TRADES[d.trade].label} jobs: {stats.n}, averaging {money(stats.avg)}.</p>}
      </section>

      <section className="estcard">
        <h2>Photos</h2>
        <div className="estphotos">
          {(estimate?.photos ?? []).map((p) => (
            <div key={p.id} className="estphoto">
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="Site photo" /></a> : <span>Photo</span>}
              <button className="estx" onClick={() => removePhoto(p.id)} aria-label="Delete photo">×</button>
            </div>
          ))}
        </div>
        <label className="button gold estupload">
          Take or add photos <span>+</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} disabled={busy} />
        </label>
      </section>

      <section className="estcard">
        <h2>Notes for the contractor</h2>
        <textarea rows={4} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Access, pets, materials, anything they should know" />
      </section>

      <section className="estcard">
        <h2>Homeowner&rsquo;s OK</h2>
        <label className="estcheck">
          <input type="checkbox" checked={d.share_consent} onChange={(e) => set("share_consent", e.target.checked)} />
          <span>The homeowner agreed JHP can share their contact details, photos and this scope with <b>one</b> contractor for this job.</span>
        </label>
        <div className="estradio">
          <label><input type="radio" checked={d.contact_method === "email"} onChange={() => set("contact_method", "email")} /> Contractor: email only</label>
          <label><input type="radio" checked={d.contact_method === "phone_email"} onChange={() => set("contact_method", "phone_email")} /> Contractor may call or text too</label>
        </div>
        {d.share_consent_at && <p className="estnote">Recorded {new Date(d.share_consent_at).toLocaleString("en-US")}.</p>}
      </section>

      {!admin && repCut != null && (
        <div className="esttotal"><span>Your commission on this job</span><b>{money(repCut)}{estimate?.rep_paid_at ? " ✓ paid" : ""}</b></div>
      )}

      <div className="estsave">
        <div className="estrow">
          <button className="button gold" onClick={() => save()} disabled={busy}>{busy ? "Working…" : "Save"} <span>✓</span></button>
          {d.id && !estimate?.visited_at && isOpen(estimate ?? ({ status } as Estimate)) && (
            <button className="button darkbtn" onClick={visitDone} disabled={busy}>Visit done <span>→</span></button>
          )}
        </div>
        {estimate?.visited_at && <p className="estnote">Visit done {new Date(estimate.visited_at).toLocaleString("en-US")}.</p>}
        {msg && <p className="estnote">{msg}</p>}
      </div>

      {admin && d.id && estimate && <SendBox d={d} estimate={estimate} data={data} api={api} reload={reload} saveFirst={() => save(true)} />}
      {admin && d.id && estimate && (estimate.status === "sent" || estimate.status === "signed" || estimate.status === "lost") && <Outcome estimate={estimate} api={api} reload={reload} />}
      {admin && d.id && (status === "draft" || status === "requested") && <button className="estlink estdanger" onClick={del}>Delete this job</button>}
    </div>
  );
}

function AssignBox({ estimate, data, api, reload }: { estimate: Estimate; data: Data; api: Api; reload: () => Promise<void> | void }) {
  const reps = (data.reps ?? []).filter((r) => r.active);
  const [rep, setRep] = useState(estimate.rep_id ?? "");
  const [msg, setMsg] = useState("");
  const current = reps.find((r) => r.id === estimate.rep_id);

  async function assign() {
    setMsg(rep ? "Assigning and emailing…" : "Unassigning…");
    try {
      const j = await post(api, { action: "assign", id: estimate.id, rep_id: rep || null });
      setMsg(rep ? (j.emailed ? "Assigned. They've been emailed the visit." : `Assigned, but the email failed: ${j.emailError ?? "unknown"}. Text them.`) : "Unassigned.");
      await reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <section className="estcard">
      <h2>Road Pro</h2>
      {current && <p>Assigned to <b>{current.name}</b>{estimate.assigned_at ? ` on ${when(estimate.assigned_at)}` : ""}
        {estimate.rep_commission_pct != null ? ` · ${estimate.rep_commission_pct}% of JHP's earnings` : " · no commission % set"}.</p>}
      {estimate.help_requested_at && <p className="esterr">Asked for help {new Date(estimate.help_requested_at).toLocaleString("en-US")}.</p>}
      <select value={rep} onChange={(e) => setRep(e.target.value)}>
        <option value="">Nobody</option>
        {reps.map((r) => <option key={r.id} value={r.id} disabled={r.bg_status !== "clear"}>{r.name}{r.bg_status !== "clear" ? " (background check not clear)" : ""}</option>)}
      </select>
      <div className="estrow"><button className="button gold" onClick={assign} disabled={rep === (estimate.rep_id ?? "")}>{rep ? "Assign" : "Unassign"} <span>→</span></button></div>
      {reps.length === 0 && <p className="estnote">No Road Pros yet. Add one under Road Pros.</p>}
      {msg && <p className="estnote">{msg}</p>}
    </section>
  );
}

function SendBox({ d, estimate, data, api, reload, saveFirst }: {
  d: Draft; estimate: Estimate; data: Data; api: Api; reload: () => Promise<void> | void; saveFirst: () => Promise<string | null>;
}) {
  const [lane, setLane] = useState<"A" | "B">(estimate.lane);
  const [pro, setPro] = useState(estimate.roofer_id ?? "");
  const [pct, setPct] = useState(estimate.fee_pct != null ? String(estimate.fee_pct) : "");
  const [dist, setDist] = useState<Record<string, { miles: number; covers: boolean }>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const pros = useMemo(() => (data.contractors ?? []).filter((c) => c.trade === d.trade), [data.contractors, d.trade]);

  useEffect(() => {
    if (!/^[0-9]{5}$/.test(d.zip)) { setDist({}); return; }
    api(`/api/estimator?zip=${d.zip}&trade=${d.trade}`).then((j) => {
      const m: Record<string, { miles: number; covers: boolean }> = {};
      for (const r of (j.distances as { roofer_id: string; miles: number; covers: boolean }[]) ?? []) m[r.roofer_id] = r;
      setDist(m);
    }).catch(() => setDist({}));
  }, [d.zip, d.trade, api]);

  async function send() {
    const c = pros.find((x) => x.id === pro);
    if (!c) { setMsg("Pick a contractor."); return; }
    if (!window.confirm(`Email this job to ${c.company} (${c.email})?`)) return;
    setBusy(true); setMsg("Saving and sending…");
    try {
      const id = await saveFirst(); if (!id) return;
      await post(api, { action: "estimate_save", ...d, id, lane });
      await post(api, { action: "send", id, roofer_id: pro, fee_pct: pct });
      setMsg(`Sent to ${c.company}.`); await reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="estcard estsend">
      <h2>{estimate.sent_at ? "Sent" : "Send to a contractor"}</h2>
      {estimate.sent_at && <p className="estnote">Emailed {new Date(estimate.sent_at).toLocaleString("en-US")} to {(data.contractors ?? []).find((c) => c.id === estimate.roofer_id)?.company ?? "a contractor"}.</p>}
      <div className="estradio">
        <label><input type="radio" checked={lane === "A"} onChange={() => setLane("A")} /> <b>Referral</b>: they sign the homeowner, pay JHP a %</label>
        <label><input type="radio" checked={lane === "B"} onChange={() => setLane("B")} /> <b>JHP job</b>: JHP signs the homeowner, subs it out</label>
      </div>
      {lane === "B" && <p className="estnote">On a JHP job, JHP is the contractor: registration, insurance and a written contract with the 3-day cancellation notice are on JHP.</p>}
      <label>Contractor
        <select value={pro} onChange={(e) => setPro(e.target.value)}>
          <option value="">Choose…</option>
          {pros.map((c) => {
            const x = dist[c.id];
            return <option key={c.id} value={c.id}>
              {c.company}{x ? ` · ${x.miles < 1 ? "<1" : Math.round(x.miles)} mi${x.covers ? "" : " (outside their area)"}` : ""}{c.license_checked_at ? " · registry checked" : ""}
            </option>;
          })}
        </select>
      </label>
      {pros.length === 0 && <p className="estnote">No approved {TRADES[d.trade].label} contractors yet. Sign one up first.</p>}
      {lane === "A" && <label>Referral fee % (from their partner agreement)<input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="10" /></label>}
      {!d.share_consent && <p className="esterr">Tick the homeowner&rsquo;s OK above before sending.</p>}
      <button className="button gold" onClick={send} disabled={busy || !pro || !d.share_consent}>{estimate.sent_at ? "Send again" : "Send job"} <span>→</span></button>
      {msg && <p className="estnote">{msg}</p>}
    </section>
  );
}

function Outcome({ estimate, api, reload }: { estimate: Estimate; api: Api; reload: () => Promise<void> | void }) {
  const [signed, setSigned] = useState(estimate.signed_price != null ? String(estimate.signed_price) : "");
  const [sub, setSub] = useState(estimate.sub_price != null ? String(estimate.sub_price) : "");
  const [pct, setPct] = useState(estimate.fee_pct != null ? String(estimate.fee_pct) : "");
  const [repPct, setRepPct] = useState(estimate.rep_commission_pct != null ? String(estimate.rep_commission_pct) : "");
  const [paid, setPaid] = useState(Boolean(estimate.fee_paid_at));
  const [repPaid, setRepPaid] = useState(Boolean(estimate.rep_paid_at));
  const [msg, setMsg] = useState("");
  const n = (v: string) => (toNum(v) >= 0 ? toNum(v) : null);
  const preview = { lane: estimate.lane, signed_price: n(signed), sub_price: n(sub), fee_pct: n(pct), status: "signed" as const, rep_commission_pct: n(repPct) };
  const earned = jhpEarnings(preview);
  const repCut = estimate.rep_id ? repCommission(preview) : null;

  async function mark(status: "signed" | "lost" | "sent") {
    setMsg("Saving…");
    try {
      await post(api, { action: "outcome", id: estimate.id, status, signed_price: signed, sub_price: sub, fee_pct: pct, fee_paid: paid,
        ...(estimate.rep_id ? { rep_commission_pct: repPct, rep_paid: repPaid } : {}) });
      setMsg("Saved."); await reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <section className="estcard">
      <h2>Did it sign?</h2>
      <label>Signed contract price $<input inputMode="decimal" value={signed} onChange={(e) => setSigned(e.target.value)} /></label>
      {estimate.lane === "B"
        ? <label>JHP pays the contractor $<input inputMode="decimal" value={sub} onChange={(e) => setSub(e.target.value)} /></label>
        : <label>Referral fee %<input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></label>}
      <div className="esttotal"><span>JHP earns</span><b>{money(earned)}</b></div>
      <label className="estcheck"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /><span>JHP has been paid</span></label>
      {estimate.rep_id && (
        <>
          <label>Road Pro commission (% of JHP&rsquo;s earnings)<input inputMode="decimal" value={repPct} onChange={(e) => setRepPct(e.target.value)} /></label>
          <div className="esttotal"><span>Road Pro gets</span><b>{money(repCut)}</b></div>
          <label className="estcheck"><input type="checkbox" checked={repPaid} onChange={(e) => setRepPaid(e.target.checked)} /><span>Road Pro has been paid</span></label>
        </>
      )}
      <div className="estrow">
        <button className="button gold" onClick={() => mark("signed")}>Signed <span>✓</span></button>
        <button className="button darkbtn" onClick={() => mark("lost")}>Lost</button>
        {estimate.status !== "sent" && <button className="estlink" onClick={() => mark("sent")}>Back to open</button>}
      </div>
      {msg && <p className="estnote">{msg}</p>}
    </section>
  );
}
