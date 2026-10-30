import { NextResponse } from "next/server";
import { adminDb, alertEmails, sendEmail } from "../../../lib/server";
import { SITE } from "../../../lib/site";
import { TRADE_SLUGS, tradeOr } from "../../../lib/trades";
import { newSetupToken } from "../../../lib/pros";
import { requireEstimator, type EstimatorUser } from "../../../lib/estimator-auth";
import { assignRep } from "../../../lib/assign";
import {
  cleanLines, lineTotals, money, repCommission, toNum, ESTIMATE_BUCKET, type Line,
} from "../../../lib/estimator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DB = NonNullable<ReturnType<typeof adminDb>>;
const denied = () => NextResponse.json({ error: "Not authorised." }, { status: 401 });
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isTrade = (t: string) => (TRADE_SLUGS as readonly string[]).includes(t);
const pctOrNull = (v: unknown) => { const n = toNum(v); return n >= 0 && n <= 100 ? n : null; };

const EST_COLS =
  "id, created_at, updated_at, created_by, trade, status, lane, homeowner_name, homeowner_phone, homeowner_email, address, zip, problem, notes, items, range_low, range_high, share_consent_at, contact_method, roofer_id, sent_at, send_error, fee_pct, signed_price, sub_price, signed_at, fee_paid_at, source, visit_times, consent_text, rep_id, assigned_at, visited_at, help_requested_at, checklist, rep_commission_pct, rep_paid_at, estimate_photos(id, path, created_at)";
const REP_COLS = "id, created_at, name, email, phone, home_zip, active, bg_status, bg_checked_at, bg_provider, commission_pct, auth_user_id, setup_token_expires";

/**
 * The estimator app's data. Two roles:
 * - admin (ADMIN_EMAILS): everything — price book, all jobs, contractors,
 *   Road Pros, settings, money.
 * - rep (an active Road Pro): only the visits assigned to them, the price
 *   book (read-only, to add measured lines), and their own commission. No
 *   contractor fees, no other jobs, no sending.
 */
export async function GET(req: Request) {
  const who = await requireEstimator(req);
  if (!who) return denied();
  const db = adminDb();
  if (!db) return bad("Database not connected.", 503);

  const url = new URL(req.url);
  const zip = url.searchParams.get("zip") ?? "";
  const trade = url.searchParams.get("trade") ?? "";
  if (zip && trade) {
    if (who.role !== "admin") return denied();
    if (!/^[0-9]{5}$/.test(zip) || !isTrade(trade)) return bad("Bad ZIP or trade.");
    const { data, error } = await db.rpc("provider_distances", { p_zip: zip, p_trade: trade });
    if (error) return bad("Couldn't check distances.", 500);
    return NextResponse.json({ distances: data ?? [] });
  }

  let estQ = db.from("estimates").select(EST_COLS).order("created_at", { ascending: false }).limit(300);
  if (who.role === "rep") estQ = estQ.eq("rep_id", who.rep.id);

  const [book, ests] = await Promise.all([
    db.from("price_book").select("id, trade, item, unit, low, high, source").eq("active", true).order("trade").order("item"),
    estQ,
  ]);

  const rows = (ests.data ?? []) as unknown as (Record<string, unknown> & { estimate_photos: { id: string; path: string }[] })[];
  const paths = rows.flatMap((r) => r.estimate_photos.map((p) => p.path));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(ESTIMATE_BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  let estimates = rows.map(({ estimate_photos, ...e }) => ({
    ...e,
    photos: estimate_photos.map((p) => ({ id: p.id, path: p.path, url: signed.get(p.path) ?? null })),
  })) as Record<string, unknown>[];

  if (who.role === "rep") {
    // A rep sees their commission, never the contractor's fee terms.
    estimates = estimates.map((e) => {
      const commission = repCommission(e as never);
      const { fee_pct: _f, sub_price: _s, roofer_id: _r, send_error: _e, consent_text: _c, ...rest } = e;
      void _f; void _s; void _r; void _e; void _c;
      return { ...rest, rep_commission: commission };
    });
    return NextResponse.json({ role: "rep", me: who.rep, priceBook: book.data ?? [], estimates });
  }

  const [pros, reps, settings, apps] = await Promise.all([
    db.from("roofers")
      .select("id, company, trade, email, phone, leads_enabled, license_number, license_checked_at, license_status")
      .eq("status", "approved").order("company"),
    db.from("road_pros").select(REP_COLS).order("name"),
    db.from("estimator_settings").select("*").eq("id", 1).single(),
    db.from("road_pro_applications").select("id, created_at, name, email, phone, home_zip, has_car, availability, experience, status")
      .eq("status", "new").order("created_at", { ascending: false }).limit(100),
  ]);
  return NextResponse.json({
    role: "admin", who: who.email, priceBook: book.data ?? [], estimates,
    contractors: pros.data ?? [], reps: reps.data ?? [], settings: settings.data ?? null, applications: apps.data ?? [],
  });
}

type Body = Record<string, unknown> & { action?: string };

export async function POST(req: Request) {
  const who = await requireEstimator(req);
  if (!who) return denied();
  const db = adminDb();
  if (!db) return bad("Database not connected.", 503);
  const b = (await req.json().catch(() => ({}))) as Body;
  const now = new Date().toISOString();

  // ── Allowed for Road Pros (on their own jobs) and the operator ──
  switch (b.action) {
    case "estimate_save": return saveEstimate(db, who, b, now);
    case "checklist_save": {
      const e = await ownedEstimate(db, who, String(b.id ?? ""));
      if (!e) return bad("Job not found.", 404);
      const raw = (b.checklist ?? {}) as Record<string, unknown>;
      const checklist: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(raw).slice(0, 80)) {
        if (!/^[a-z_]{1,30}$/.test(k)) continue;
        checklist[k] = typeof v === "boolean" ? v : String(v ?? "").slice(0, 500);
      }
      const { error } = await db.from("estimates").update({ checklist, updated_at: now }).eq("id", e.id);
      return error ? bad("Couldn't save the checklist.", 500) : ok();
    }
    case "visit_done": {
      const e = await ownedEstimate(db, who, String(b.id ?? ""));
      if (!e) return bad("Job not found.", 404);
      const { error } = await db.from("estimates").update({ visited_at: e.visited_at ?? now, updated_at: now }).eq("id", e.id);
      if (error) return bad("Couldn't save that.", 500);
      if (who.role === "rep") {
        await sendEmail(alertEmails(), `Visit done: ${tradeOr(e.trade).label} in ${e.zip || "NJ"} (${who.rep.name})`,
          [`${who.rep.name} finished the site visit for ${e.homeowner_name || "a homeowner"}.`, "", `Price it and send it: ${SITE.url}/estimator`].join("\n"));
      }
      return ok();
    }
    case "help": {
      const e = await ownedEstimate(db, who, String(b.id ?? ""));
      if (!e) return bad("Job not found.", 404);
      const note = str(b.note, 1000);
      const name = who.role === "rep" ? who.rep.name : who.email;
      const phone = who.role === "rep" ? who.rep.phone : "";
      const r = await sendEmail(alertEmails(), `HELP at a visit: ${name} — ${tradeOr(e.trade).label}, ${e.zip || "NJ"}`, [
        `${name} needs help at a site visit right now.`,
        ...(phone ? [`Call them: ${phone}`] : []),
        "",
        `Homeowner: ${e.homeowner_name || "—"}  ·  ${e.address || e.zip || ""}`,
        ...(note ? ["", `Their note: ${note}`] : []),
        "",
        `Open the job: ${SITE.url}/estimator`,
      ].join("\n"));
      await db.from("estimates").update({ help_requested_at: now }).eq("id", e.id);
      return r.ok ? ok() : bad("The help message didn't go out. Call Khalil directly.", 502);
    }
  }

  if (who.role !== "admin") return denied();

  // ── Operator only ──
  switch (b.action) {
    case "price_save": {
      const trade = str(b.trade, 20), item = str(b.item, 120), unit = str(b.unit, 30) || "each";
      const low = toNum(b.low), high = toNum(b.high);
      if (!isTrade(trade) || !item) return bad("Pick a trade and name the item.");
      if (!(low >= 0) || !(high >= low)) return bad("Enter a low and a high price (high at least the low).");
      const row = { trade, item, unit, low, high, source: str(b.source, 200), updated_at: now };
      const { error } = b.id ? await db.from("price_book").update(row).eq("id", String(b.id)) : await db.from("price_book").insert(row);
      return error ? bad("Couldn't save that price.", 500) : ok();
    }
    case "price_delete": {
      const { error } = await db.from("price_book").update({ active: false, updated_at: now }).eq("id", String(b.id ?? ""));
      return error ? bad("Couldn't remove it.", 500) : ok();
    }
    case "estimate_delete": {
      const id = String(b.id ?? "");
      const { data: e } = await db.from("estimates").select("status, estimate_photos(path)").eq("id", id).single();
      if (!e) return bad("Not found.", 404);
      if (!["draft", "requested"].includes(e.status)) return bad("Only drafts and unworked requests can be deleted. Mark it lost instead.");
      const paths = ((e.estimate_photos ?? []) as { path: string }[]).map((p) => p.path);
      if (paths.length) await db.storage.from(ESTIMATE_BUCKET).remove(paths);
      const { error } = await db.from("estimates").delete().eq("id", id);
      return error ? bad("Couldn't delete it.", 500) : ok();
    }
    case "send": return send(db, b, now);
    case "outcome": {
      const id = String(b.id ?? "");
      const status = String(b.status ?? "");
      if (!["sent", "signed", "lost"].includes(status)) return bad("Bad status.");
      const signedP = toNum(b.signed_price), sub = toNum(b.sub_price);
      const { data: cur } = await db.from("estimates").select("signed_at, fee_paid_at, rep_paid_at").eq("id", id).single();
      if (!cur) return bad("Not found.", 404);
      if (status === "signed" && !(signedP > 0)) return bad("Enter the signed contract price.");
      const { error } = await db.from("estimates").update({
        status, updated_at: now,
        signed_price: signedP >= 0 ? signedP : null,
        sub_price: sub >= 0 ? sub : null,
        fee_pct: pctOrNull(b.fee_pct),
        signed_at: status === "signed" ? cur.signed_at ?? now : null,
        fee_paid_at: b.fee_paid ? cur.fee_paid_at ?? now : null,
        rep_commission_pct: b.rep_commission_pct === undefined ? undefined : pctOrNull(b.rep_commission_pct),
        rep_paid_at: b.rep_paid ? cur.rep_paid_at ?? now : null,
      }).eq("id", id);
      return error ? bad("Couldn't save that.", 500) : ok();
    }
    case "assign": {
      const id = String(b.id ?? ""), repId = str(b.rep_id, 40);
      if (!repId) {
        const { error } = await db.from("estimates").update({ rep_id: null, assigned_at: null, updated_at: now }).eq("id", id);
        return error ? bad("Couldn't unassign.", 500) : ok();
      }
      const r = await assignRep(db, id, repId);
      return r.ok ? ok({ emailed: r.emailed, emailError: r.emailError }) : bad(r.error);
    }
    case "settings_save": {
      const base_zip = str(b.base_zip, 5);
      if (!/^[0-9]{5}$/.test(base_zip)) return bad("Base ZIP must be 5 digits.");
      const radius = Math.round(toNum(b.radius_miles));
      if (!(radius >= 1 && radius <= 150)) return bad("Radius must be 1–150 miles.");
      const trades = (Array.isArray(b.visit_trades) ? b.visit_trades : []).map(String).filter(isTrade);
      const { error } = await db.from("estimator_settings").update({
        visits_on: b.visits_on === true, base_zip, radius_miles: radius, visit_trades: trades,
        rep_commission_pct: pctOrNull(b.rep_commission_pct), updated_at: now,
        auto_assign: b.auto_assign !== false,
        max_assign_miles: Math.min(150, Math.max(1, Math.round(toNum(b.max_assign_miles)) || 40)),
      }).eq("id", 1);
      return error ? bad("Couldn't save settings.", 500) : ok();
    }
    case "rep_save": {
      const name = str(b.name, 120), email = str(b.email, 200).toLowerCase(), phone = str(b.phone, 40);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Add a name and a valid email.");
      const bg = ["pending", "clear", "not_clear"].includes(String(b.bg_status)) ? String(b.bg_status) : "pending";
      const row: Record<string, unknown> = {
        name, email, phone, active: b.active !== false, bg_status: bg, bg_provider: str(b.bg_provider, 120),
        home_zip: /^[0-9]{5}$/.test(str(b.home_zip, 5)) ? str(b.home_zip, 5) : "",
        commission_pct: pctOrNull(b.commission_pct),
      };
      if (b.id) {
        const { data: cur } = await db.from("road_pros").select("bg_status, bg_checked_at").eq("id", String(b.id)).single();
        if (!cur) return bad("Road Pro not found.", 404);
        row.bg_checked_at = bg === "pending" ? null : cur.bg_status === bg ? cur.bg_checked_at : now;
        const { error } = await db.from("road_pros").update(row).eq("id", String(b.id));
        return error ? bad(error.code === "23505" ? "That email is already a Road Pro." : "Couldn't save.", 400) : ok();
      }
      row.bg_checked_at = bg === "pending" ? null : now;
      const { error } = await db.from("road_pros").insert(row);
      return error ? bad(error.code === "23505" ? "That email is already a Road Pro." : "Couldn't save.", 400) : ok();
    }
    case "app_add": {
      // Applicant → Road Pro (background check pending until you mark it clear).
      const { data: a } = await db.from("road_pro_applications").select("id, name, email, phone, home_zip, status").eq("id", String(b.id ?? "")).single();
      if (!a || a.status !== "new") return bad("Applicant not found.");
      const { data: rep, error } = await db.from("road_pros")
        .insert({ name: a.name, email: a.email, phone: a.phone, home_zip: a.home_zip, bg_status: "pending" }).select("id").single();
      if (error || !rep) return bad(error?.code === "23505" ? "That email is already a Road Pro." : "Couldn't add them.", 400);
      await db.from("road_pro_applications").update({ status: "added", road_pro_id: rep.id }).eq("id", a.id);
      return ok();
    }
    case "app_decline": {
      const { error } = await db.from("road_pro_applications").update({ status: "declined" }).eq("id", String(b.id ?? "")).eq("status", "new");
      return error ? bad("Couldn't update.", 500) : ok();
    }
    case "rep_invite": {
      const { data: rep } = await db.from("road_pros").select("id, name, email, active").eq("id", String(b.id ?? "")).single();
      if (!rep || !rep.active) return bad("Pick an active Road Pro.");
      const t = newSetupToken();
      const { error } = await db.from("road_pros").update({ setup_token_hash: t.hash, setup_token_expires: t.expires }).eq("id", rep.id);
      if (error) return bad("Couldn't create the link.", 500);
      const link = `${SITE.url}/estimator/setup?token=${encodeURIComponent(t.token)}`;
      const r = await sendEmail(rep.email, `Set up your JHP Road Pro app`, [
        `${rep.name},`, "",
        `You've been added as a ${SITE.brand} Road Pro. Choose a password to open the JHP Estimator app:`, "",
        link, "",
        `The link works once and expires in 72 hours.`, "",
        `On your phone, open the app and add it to your home screen (Share → Add to Home Screen on iPhone).`, "",
        `— ${SITE.brand}`,
      ].join("\n"));
      return r.ok ? ok({ to: rep.email }) : bad(`The email didn't go out: ${r.error ?? "unknown"}`, 502);
    }
  }
  return bad("Unknown action.");
}

/** The estimate if this user may work on it: admin any, rep only their own. */
async function ownedEstimate(db: DB, who: EstimatorUser, id: string) {
  if (!id) return null;
  const { data } = await db.from("estimates").select("id, trade, zip, homeowner_name, address, rep_id, visited_at, share_consent_at").eq("id", id).single();
  if (!data) return null;
  if (who.role === "rep" && data.rep_id !== who.rep.id) return null;
  return data;
}

async function saveEstimate(db: DB, who: EstimatorUser, b: Body, now: string) {
  const trade = str(b.trade, 20);
  if (!isTrade(trade)) return bad("Pick a trade.");
  const zip = str(b.zip, 5);
  if (zip && !/^[0-9]{5}$/.test(zip)) return bad("ZIP must be 5 digits.");

  let items: Line[] = cleanLines(b.items);
  let range_low: number | null, range_high: number | null;
  if (who.role === "rep") {
    // Road Pros can only use price-book lines at price-book prices, and can't
    // override the range: a rep on commission never sets the price.
    const { data: book } = await db.from("price_book").select("item, unit, low, high").eq("trade", trade).eq("active", true);
    const byItem = new Map<string, { item: string; unit: string; low: number; high: number }>();
    for (const p of book ?? []) byItem.set(p.item, p);
    items = items.flatMap((l) => {
      const p = byItem.get(l.item);
      return p ? [{ item: p.item, unit: p.unit, qty: l.qty, low: Number(p.low), high: Number(p.high) }] : [];
    });
    const t = lineTotals(items);
    range_low = items.length ? t.low : null;
    range_high = items.length ? t.high : null;
  } else {
    const t = lineTotals(items);
    const oLow = toNum(b.range_low), oHigh = toNum(b.range_high);
    range_low = oLow >= 0 ? oLow : items.length ? t.low : null;
    range_high = oHigh >= 0 ? Math.max(oHigh, range_low ?? 0) : items.length ? t.high : null;
  }

  const row = {
    trade, zip, items, range_low, range_high,
    homeowner_name: str(b.homeowner_name, 120),
    homeowner_phone: str(b.homeowner_phone, 40),
    homeowner_email: str(b.homeowner_email, 200).toLowerCase(),
    address: str(b.address, 200),
    problem: str(b.problem, 1000),
    notes: str(b.notes, 4000),
    contact_method: b.contact_method === "phone_email" ? "phone_email" : "email",
    updated_at: now,
  };
  const lane = who.role === "admin" ? (b.lane === "B" ? "B" : b.lane === "A" ? "A" : undefined) : undefined;

  if (b.id) {
    const owned = await ownedEstimate(db, who, String(b.id));
    if (!owned) return bad("Job not found.", 404);
    // Keep the original time of the homeowner's OK; set it the first time only.
    const share_consent_at = b.share_consent ? owned.share_consent_at ?? now : null;
    const { data, error } = await db.from("estimates")
      .update({ ...row, share_consent_at, ...(lane ? { lane } : {}) }).eq("id", owned.id).select("id").single();
    return error ? bad("Couldn't save the job.", 500) : ok({ id: data.id });
  }

  const extra: Record<string, unknown> = { lane: lane ?? "A", share_consent_at: b.share_consent ? now : null, created_by: who.email };
  if (who.role === "rep") {
    // A rep's own walk-up job is assigned to them, with their commission rate.
    const { data: s } = await db.from("estimator_settings").select("rep_commission_pct").eq("id", 1).single();
    Object.assign(extra, { rep_id: who.rep.id, assigned_at: now, rep_commission_pct: who.rep.commission_pct ?? s?.rep_commission_pct ?? null });
  }
  const { data, error } = await db.from("estimates").insert({ ...row, ...extra }).select("id").single();
  return error ? bad("Couldn't save the job.", 500) : ok({ id: data.id });
}

/**
 * Sends the scope to ONE contractor. Refused unless the homeowner's
 * permission to share is recorded on the estimate, the company is approved
 * in that trade, and there is a way to reach the homeowner.
 */
async function send(db: DB, b: Body, now: string) {
  const id = String(b.id ?? ""), rooferId = String(b.roofer_id ?? "");
  const pct = toNum(b.fee_pct);
  const { data: e } = await db.from("estimates").select(EST_COLS).eq("id", id).single();
  if (!e) return bad("Estimate not found.", 404);
  if (!e.share_consent_at) return bad("Record the homeowner's OK to share their details first.");
  if (!e.homeowner_name || (!e.homeowner_email && !e.homeowner_phone)) return bad("Add the homeowner's name and a phone or email.");
  if (e.contact_method === "email" && !e.homeowner_email) return bad("Homeowner chose email only, but there's no email address.");
  const { data: pro } = await db.from("roofers").select("id, company, contact, email, trade, status").eq("id", rooferId).single();
  if (!pro || pro.status !== "approved") return bad("Pick an approved contractor.");
  if (pro.trade !== e.trade) return bad("That contractor isn't in this trade.");
  if (!pro.email) return bad("That contractor has no email on file.");
  if (e.lane === "A" && !(pct >= 0)) return bad("Enter the referral fee % from their partner agreement.");

  const trade = tradeOr(e.trade);
  const photos = (e.estimate_photos ?? []) as { path: string }[];
  let links: string[] = [];
  if (photos.length) {
    const { data } = await db.storage.from(ESTIMATE_BUCKET).createSignedUrls(photos.map((p) => p.path), 14 * 24 * 3600);
    links = (data ?? []).flatMap((s) => (s.signedUrl ? [s.signedUrl] : []));
  }
  const items = (e.items ?? []) as Line[];
  const emailOnly = e.contact_method === "email";

  const lines = [
    `${pro.contact || pro.company},`,
    "",
    e.lane === "B"
      ? `${SITE.brand} has a ${trade.label.toLowerCase()} job we'd like you to take on as our subcontractor. ${SITE.brand} holds the contract with the homeowner; we'll confirm your price and schedule with you before anything is promised to them.`
      : `${SITE.brand} visited this home and scoped the job below. It has been sent to you only.`,
    "",
    "HOMEOWNER",
    `Name: ${e.homeowner_name}`,
    ...(e.homeowner_phone && !emailOnly ? [`Phone: ${e.homeowner_phone}`] : []),
    ...(e.homeowner_email ? [`Email: ${e.homeowner_email}`] : []),
    ...(e.address ? [`Address: ${e.address}`] : []),
    ...(e.zip ? [`ZIP: ${e.zip}`] : []),
    "",
    "CONTACT PERMISSION",
    emailOnly
      ? "EMAIL ONLY. The homeowner did not agree to calls or texts. Reply by email."
      : "The homeowner agreed to be contacted by phone and email about this job.",
    "",
    "THE JOB",
    e.problem || "(see notes)",
    ...(items.length ? ["", "Measured on site:", ...items.map((l) => `- ${l.item}: ${l.qty} ${l.unit}`)] : []),
    ...(e.range_low != null && e.range_high != null
      ? ["", `JHP estimate range: ${money(e.range_low)} – ${money(e.range_high)}`,
         "This range is from JHP's site visit. Your price is yours to set."]
      : []),
    ...(e.notes ? ["", "Notes:", e.notes] : []),
    ...(links.length ? ["", `Photos (links work for 14 days):`, ...links.map((l, i) => `${i + 1}. ${l}`)] : []),
    "",
    ...(e.lane === "A"
      ? [`TERMS: Per your partner agreement, the referral fee on this job is ${pct}% of the signed contract price, due once the homeowner has paid you. If the homeowner doesn't sign, you owe nothing. Please reply with the signed price once they sign.`]
      : ["TERMS: Subcontract terms are agreed in writing with JHP before work starts."]),
    "",
    `— ${SITE.brand}`,
  ];

  const r = await sendEmail(pro.email, `JHP job: ${trade.label} in ${e.zip || "NJ"} — ${e.homeowner_name}`, lines.join("\n"));
  const update = {
    roofer_id: pro.id,
    fee_pct: e.lane === "A" ? pct : e.fee_pct,
    updated_at: now,
    ...(r.ok
      ? { status: ["draft", "requested"].includes(e.status) ? "sent" : e.status, sent_at: now, send_error: null }
      : { send_error: r.error ?? "send_failed" }),
  };
  await db.from("estimates").update(update).eq("id", id);
  if (!r.ok) return bad(`The email didn't go out: ${r.error ?? "unknown error"}`, 502);
  return ok();
}
