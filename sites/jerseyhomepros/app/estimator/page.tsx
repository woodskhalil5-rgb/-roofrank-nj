"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TRADES, TRADE_SLUGS, tradeOr, type TradeSlug } from "../../lib/trades";
import {
  jhpEarnings, lineTotals, money, toNum,
  type Estimate, type Line, type PriceItem,
} from "../../lib/estimator";

/**
 * JHP Estimator: the operator's on-site tool. Scope a job at the house
 * (measurements, photos, notes), price it from the price book, send it to ONE
 * partner contractor, then record whether it signed and what JHP is owed.
 * Admin sign-in (same accounts as /admin). Installs as its own app.
 */

type Contractor = {
  id: string; company: string; trade: string; email: string; phone: string;
  leads_enabled: boolean; license_number: string | null; license_checked_at: string | null; license_status: string | null;
};
type Data = { priceBook: PriceItem[]; estimates: Estimate[]; contractors: Contractor[] };

type Draft = {
  id?: string; trade: TradeSlug; lane: "A" | "B";
  homeowner_name: string; homeowner_phone: string; homeowner_email: string;
  address: string; zip: string; problem: string; notes: string;
  items: Line[]; range_low: string; range_high: string;
  share_consent: boolean; share_consent_at: string | null; contact_method: "email" | "phone_email";
};

const blank = (trade: TradeSlug = "roofing"): Draft => ({
  trade, lane: "A", homeowner_name: "", homeowner_phone: "", homeowner_email: "", address: "", zip: "",
  problem: "", notes: "", items: [], range_low: "", range_high: "",
  share_consent: false, share_consent_at: null, contact_method: "email",
});

function fromEstimate(e: Estimate): Draft {
  const t = lineTotals(e.items ?? []);
  const overridden = e.range_low != null && (e.range_low !== t.low || e.range_high !== t.high);
  return {
    id: e.id, trade: tradeOr(e.trade).slug as TradeSlug, lane: e.lane,
    homeowner_name: e.homeowner_name, homeowner_phone: e.homeowner_phone, homeowner_email: e.homeowner_email,
    address: e.address, zip: e.zip, problem: e.problem, notes: e.notes, items: e.items ?? [],
    range_low: overridden ? String(e.range_low ?? "") : "", range_high: overridden ? String(e.range_high ?? "") : "",
    share_consent: Boolean(e.share_consent_at), share_consent_at: e.share_consent_at, contact_method: e.contact_method,
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

const STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent", signed: "Signed", lost: "Lost" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Estimator() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [view, setView] = useState<"jobs" | "book" | "edit">("jobs");
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

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) setDenied(true);
    if (!r.ok) throw new Error(j.error || "Something went wrong. Try again.");
    return j;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    try { const j = await api("/api/estimator"); setDenied(false); setData(j); } catch (e) { setNote((e as Error).message); }
  }, [token, api]);
  useEffect(() => { load(); }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const c = sb(); if (!c) return;
    setNote("Signing in…");
    const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
    setNote(error ? error.message : ""); setPassword("");
  }

  if (!ready) return <main className="estpage"><p className="estnote">Loading…</p></main>;

  if (!token) {
    return (
      <main className="estpage">
        <EstBar />
        <form className="estcard estsignin" onSubmit={signIn}>
          <h1>Estimator sign-in</h1>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="button gold" type="submit">Sign in <span>→</span></button>
          {note && <p className="estnote">{note}</p>}
          <p className="estnote">Same account as the admin dashboard.</p>
        </form>
      </main>
    );
  }

  if (denied) {
    return (
      <main className="estpage"><EstBar onSignOut={() => sb()?.auth.signOut()} />
        <div className="estcard"><h1>Not an estimator account</h1><p>This account isn&rsquo;t on the admin list.</p></div>
      </main>
    );
  }

  if (!data) return <main className="estpage"><EstBar /><p className="estnote">{note || "Loading jobs…"}</p></main>;

  const open = (id: string | null) => { setEditId(id); setEditKey((k) => k + 1); setView("edit"); window.scrollTo(0, 0); };

  return (
    <main className="estpage">
      <EstBar onSignOut={() => sb()?.auth.signOut()} />
      {view !== "edit" && (
        <div className="esttabs">
          <button className={view === "jobs" ? "on" : ""} onClick={() => setView("jobs")}>Jobs</button>
          <button className={view === "book" ? "on" : ""} onClick={() => setView("book")}>Price book</button>
        </div>
      )}
      {view === "jobs" && <Jobs data={data} onOpen={open} />}
      {view === "book" && <PriceBook data={data} api={api} reload={load} />}
      {view === "edit" && (
        <Editor key={editKey} data={data} api={api} reload={load}
                estimate={data.estimates.find((e) => e.id === editId) ?? null}
                onSaved={(id) => setEditId(id)}
                onClose={() => { setView("jobs"); setEditId(null); load(); }} />
      )}
    </main>
  );
}

function EstBar({ onSignOut }: { onSignOut?: () => void }) {
  return (
    <div className="estbar">
      <a className="brand" href="/estimator"><span className="brandmark">J</span><span>JHP <b>ESTIMATOR</b></span></a>
      {onSignOut && <button className="adminsignout" onClick={onSignOut}>Sign out</button>}
    </div>
  );
}

/* ───────────────────────── Jobs list ───────────────────────── */

function Jobs({ data, onOpen }: { data: Data; onOpen: (id: string | null) => void }) {
  const [filter, setFilter] = useState<"open" | "signed" | "all">("open");
  const ests = data.estimates;
  const signed = ests.filter((e) => e.status === "signed");
  const earned = signed.reduce((s, e) => s + (jhpEarnings(e) ?? 0), 0);
  const unpaid = signed.filter((e) => !e.fee_paid_at).reduce((s, e) => s + (jhpEarnings(e) ?? 0), 0);
  const shown = ests.filter((e) => filter === "all" || (filter === "signed" ? e.status === "signed" : e.status === "draft" || e.status === "sent"));
  const company = (id: string | null) => data.contractors.find((c) => c.id === id)?.company;

  return (
    <>
      <div className="eststats">
        <div><b>{ests.filter((e) => e.status === "draft" || e.status === "sent").length}</b><span>Open jobs</span></div>
        <div><b>{signed.length}</b><span>Signed</span></div>
        <div><b>{money(earned)}</b><span>JHP earned</span></div>
        <div><b>{money(unpaid)}</b><span>Still owed to JHP</span></div>
      </div>
      <button className="button gold estnew" onClick={() => onOpen(null)}>+ New estimate <span>→</span></button>
      <div className="esttabs small">
        {(["open", "signed", "all"] as const).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "open" ? "Open" : f === "signed" ? "Signed" : "All"}</button>
        ))}
      </div>
      {shown.length === 0 && <p className="estnote">No jobs here yet.</p>}
      <div className="estlist">
        {shown.map((e) => (
          <button key={e.id} className="estjob" onClick={() => onOpen(e.id)}>
            <span className={`estpill ${e.status}`}>{STATUS_LABEL[e.status]}{e.lane === "B" ? " · JHP job" : ""}</span>
            <b>{e.homeowner_name || "No name yet"}</b>
            <span>{tradeOr(e.trade).label} · {e.zip || "no ZIP"} · {when(e.created_at)}</span>
            <span>
              {e.range_low != null ? `${money(e.range_low)} – ${money(e.range_high)}` : "Not priced"}
              {e.roofer_id && company(e.roofer_id) ? ` · ${company(e.roofer_id)}` : ""}
            </span>
            {e.status === "signed" && (
              <span className="estearn">
                Signed {money(e.signed_price)} · JHP {money(jhpEarnings(e))} {e.fee_paid_at ? "✓ paid" : "· unpaid"}
              </span>
            )}
            {e.send_error && <span className="esterr">Email failed: {e.send_error}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Price book ───────────────────────── */

/** What signed jobs actually sold for, per trade. The real local pricing. */
function signedStats(ests: Estimate[], trade: string) {
  const s = ests.filter((e) => e.trade === trade && e.status === "signed" && e.signed_price != null);
  if (!s.length) return null;
  const avg = s.reduce((a, e) => a + (e.signed_price ?? 0), 0) / s.length;
  const ranged = s.filter((e) => e.range_low != null && e.range_high != null);
  const inRange = ranged.filter((e) => (e.signed_price ?? 0) >= (e.range_low ?? 0) && (e.signed_price ?? 0) <= (e.range_high ?? 0)).length;
  return { n: s.length, avg, ranged: ranged.length, inRange };
}

function PriceBook({ data, api, reload }: { data: Data; api: (p: string, i?: RequestInit) => Promise<unknown>; reload: () => void }) {
  const [trade, setTrade] = useState<TradeSlug>("roofing");
  const [form, setForm] = useState({ id: "", item: "", unit: "", low: "", high: "", source: "" });
  const [msg, setMsg] = useState("");
  const items = data.priceBook.filter((p) => p.trade === trade);
  const stats = signedStats(data.estimates, trade);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg("Saving…");
    try {
      await api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "price_save", trade, ...form, id: form.id || undefined }) });
      setForm({ id: "", item: "", unit: "", low: "", high: "", source: "" }); setMsg("Saved."); reload();
    } catch (err) { setMsg((err as Error).message); }
  }
  async function remove(id: string) {
    if (!window.confirm("Remove this price? Estimates that already used it keep their numbers.")) return;
    try { await api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "price_delete", id }) }); reload(); }
    catch (err) { setMsg((err as Error).message); }
  }

  return (
    <>
      <select className="esttrade" value={trade} onChange={(e) => setTrade(e.target.value as TradeSlug)}>
        {TRADE_SLUGS.map((s) => <option key={s} value={s}>{TRADES[s].label}</option>)}
      </select>
      <p className="estnote">
        Real numbers only: your partner contractors&rsquo; rate sheets or your own signed jobs. Write where each one came from,
        so a price never gets used without a source.
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
          {form.id && <button type="button" className="estlink" onClick={() => setForm({ id: "", item: "", unit: "", low: "", high: "", source: "" })}>Cancel</button>}
        </div>
        {msg && <p className="estnote">{msg}</p>}
      </form>
    </>
  );
}

/* ───────────────────────── Scope sheet ───────────────────────── */

type Api = (p: string, i?: RequestInit) => Promise<Record<string, unknown>>;

function Editor({ data, api, reload, estimate, onSaved, onClose }: {
  data: Data; api: Api; reload: () => Promise<void> | void; estimate: Estimate | null;
  onSaved: (id: string) => void; onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(() => (estimate ? fromEstimate(estimate) : blank()));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ item: "", unit: "", qty: "", low: "", high: "" });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const book = data.priceBook.filter((p) => p.trade === d.trade);
  const totals = lineTotals(d.items);
  const stats = signedStats(data.estimates, d.trade);
  const status = estimate?.status ?? "draft";

  async function save(silent = false): Promise<string | null> {
    setBusy(true); if (!silent) setMsg("Saving…");
    try {
      const j = await api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "estimate_save", ...d, lane: undefined }) });
      const id = String(j.id);
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
    if (!d.id || !window.confirm("Delete this draft and its photos?")) return;
    try { await api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "estimate_delete", id: d.id }) }); onClose(); }
    catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="esteditor">
      <div className="estrow estback">
        <button className="estlink" onClick={onClose}>← All jobs</button>
        <span className={`estpill ${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <h1>{d.homeowner_name || "New estimate"}</h1>

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
        <label>Trade
          <select value={d.trade} onChange={(e) => set("trade", e.target.value as TradeSlug)}>
            {TRADE_SLUGS.map((s) => <option key={s} value={s}>{TRADES[s].label}</option>)}
          </select>
        </label>
        <label>What&rsquo;s the problem?<textarea rows={3} value={d.problem} onChange={(e) => set("problem", e.target.value)} placeholder="What the homeowner told you and what you saw" /></label>
      </section>

      <section className="estcard">
        <h2>Measurements &amp; price</h2>
        {d.items.length === 0 && <p className="estnote">Add lines from your price book or type one in. The range adds itself up.</p>}
        {d.items.map((l, i) => (
          <div key={i} className="estline">
            <div><b>{l.item}</b><span>{money(l.low)}–{money(l.high)} per {l.unit}</span></div>
            <label className="estqty"><input inputMode="decimal" value={l.qty || ""} onChange={(e) => setQty(i, e.target.value)} aria-label={`Quantity of ${l.item}`} /><span>{l.unit}</span></label>
            <span className="estlinetotal">{money(l.qty * l.low)}–{money(l.qty * l.high)}</span>
            <button className="estx" onClick={() => set("items", d.items.filter((_, j) => j !== i))} aria-label="Remove line">×</button>
          </div>
        ))}
        {book.length > 0 && (
          <select value="" onChange={(e) => addFromBook(e.target.value)}>
            <option value="">+ Add from price book…</option>
            {book.map((p) => <option key={p.id} value={p.id}>{p.item} ({money(p.low)}–{money(p.high)}/{p.unit})</option>)}
          </select>
        )}
        {book.length === 0 && <p className="estnote">No {TRADES[d.trade].label} prices in your book yet. Add them under Price book, or type a line below.</p>}
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
        <div className="esttotal">
          <span>Estimate range</span>
          <b>{d.range_low || d.range_high ? `${money(toNum(d.range_low) || 0)} – ${money(toNum(d.range_high) || toNum(d.range_low) || 0)}` : d.items.length ? `${money(totals.low)} – ${money(totals.high)}` : "—"}</b>
        </div>
        <div className="estgrid2">
          <label>Adjust low $ (optional)<input inputMode="decimal" value={d.range_low} onChange={(e) => set("range_low", e.target.value)} placeholder={d.items.length ? String(totals.low) : ""} /></label>
          <label>Adjust high $ (optional)<input inputMode="decimal" value={d.range_high} onChange={(e) => set("range_high", e.target.value)} placeholder={d.items.length ? String(totals.high) : ""} /></label>
        </div>
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
          <span>The homeowner agreed I can share their contact details, photos and this scope with <b>one</b> contractor for this job.</span>
        </label>
        <div className="estradio">
          <label><input type="radio" checked={d.contact_method === "email"} onChange={() => set("contact_method", "email")} /> Email only</label>
          <label><input type="radio" checked={d.contact_method === "phone_email"} onChange={() => set("contact_method", "phone_email")} /> OK to call or text too</label>
        </div>
        {d.share_consent_at && <p className="estnote">Recorded {new Date(d.share_consent_at).toLocaleString("en-US")}.</p>}
      </section>

      <div className="estsave">
        <button className="button gold" onClick={() => save()} disabled={busy}>{busy ? "Working…" : "Save"} <span>✓</span></button>
        {msg && <p className="estnote">{msg}</p>}
      </div>

      {d.id && estimate && <SendBox d={d} estimate={estimate} data={data} api={api} reload={reload} saveFirst={() => save(true)} />}
      {d.id && estimate && estimate.status !== "draft" && <Outcome estimate={estimate} api={api} reload={reload} />}
      {d.id && status === "draft" && <button className="estlink estdanger" onClick={del}>Delete this draft</button>}
    </div>
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
  const pros = useMemo(() => data.contractors.filter((c) => c.trade === d.trade), [data.contractors, d.trade]);

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
      // Lane is part of the estimate; save it with the send.
      await api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "estimate_save", ...d, id, lane }) });
      await api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", id, roofer_id: pro, fee_pct: pct }) });
      setMsg(`Sent to ${c.company}.`); await reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="estcard estsend">
      <h2>{estimate.sent_at ? "Sent" : "Send to a contractor"}</h2>
      {estimate.sent_at && <p className="estnote">Emailed {new Date(estimate.sent_at).toLocaleString("en-US")} to {data.contractors.find((c) => c.id === estimate.roofer_id)?.company ?? "a contractor"}.</p>}
      <div className="estradio">
        <label><input type="radio" checked={lane === "A"} onChange={() => setLane("A")} /> <b>Referral</b>: they sign the homeowner, pay JHP a %</label>
        <label><input type="radio" checked={lane === "B"} onChange={() => setLane("B")} /> <b>JHP job</b>: JHP signs the homeowner, subs it out</label>
      </div>
      {lane === "B" && <p className="estnote">On a JHP job, JHP is the contractor: registration, insurance and a written contract with the homeowner are on JHP.</p>}
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
  const [paid, setPaid] = useState(Boolean(estimate.fee_paid_at));
  const [msg, setMsg] = useState("");
  const preview = jhpEarnings({ lane: estimate.lane, signed_price: toNum(signed) >= 0 ? toNum(signed) : null, sub_price: toNum(sub) >= 0 ? toNum(sub) : null, fee_pct: toNum(pct) >= 0 ? toNum(pct) : null });

  async function mark(status: "signed" | "lost" | "sent") {
    setMsg("Saving…");
    try {
      await api("/api/estimator", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "outcome", id: estimate.id, status, signed_price: signed, sub_price: sub, fee_pct: pct, fee_paid: paid }) });
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
      <div className="esttotal"><span>JHP earns</span><b>{money(preview)}</b></div>
      <label className="estcheck"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /><span>JHP has been paid</span></label>
      <div className="estrow">
        <button className="button gold" onClick={() => mark("signed")}>Signed <span>✓</span></button>
        <button className="button darkbtn" onClick={() => mark("lost")}>Lost</button>
        {estimate.status !== "sent" && <button className="estlink" onClick={() => mark("sent")}>Back to open</button>}
      </div>
      {msg && <p className="estnote">{msg}</p>}
    </section>
  );
}
