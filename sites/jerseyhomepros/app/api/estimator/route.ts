import { NextResponse } from "next/server";
import { adminDb, requireAdmin, sendEmail } from "../../../lib/server";
import { SITE } from "../../../lib/site";
import { TRADE_SLUGS, tradeOr } from "../../../lib/trades";
import { cleanLines, lineTotals, money, toNum, ESTIMATE_BUCKET, type Line } from "../../../lib/estimator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const denied = () => NextResponse.json({ error: "Not authorised." }, { status: 401 });
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isTrade = (t: string) => (TRADE_SLUGS as readonly string[]).includes(t);

const EST_COLS =
  "id, created_at, updated_at, created_by, trade, status, lane, homeowner_name, homeowner_phone, homeowner_email, address, zip, problem, notes, items, range_low, range_high, share_consent_at, contact_method, roofer_id, sent_at, send_error, fee_pct, signed_price, sub_price, signed_at, fee_paid_at, estimate_photos(id, path, created_at)";

/** Everything the estimator app shows. Operator-only. */
export async function GET(req: Request) {
  const who = await requireAdmin(req);
  if (!who) return denied();
  const db = adminDb();
  if (!db) return bad("Database not connected.", 503);

  const url = new URL(req.url);
  const zip = url.searchParams.get("zip") ?? "";
  const trade = url.searchParams.get("trade") ?? "";

  // Contractor picker for one job: distances from that ZIP.
  if (zip && trade) {
    if (!/^[0-9]{5}$/.test(zip) || !isTrade(trade)) return bad("Bad ZIP or trade.");
    const { data, error } = await db.rpc("provider_distances", { p_zip: zip, p_trade: trade });
    if (error) return bad("Couldn't check distances.", 500);
    return NextResponse.json({ distances: data ?? [] });
  }

  const [book, ests, pros] = await Promise.all([
    db.from("price_book").select("id, trade, item, unit, low, high, source").eq("active", true).order("trade").order("item"),
    db.from("estimates").select(EST_COLS).order("created_at", { ascending: false }).limit(300),
    db.from("roofers")
      .select("id, company, trade, email, phone, leads_enabled, license_number, license_checked_at, license_status")
      .eq("status", "approved").order("company"),
  ]);

  // Photos are private: short-lived signed links, made here, never stored.
  const rows = (ests.data ?? []) as unknown as (Record<string, unknown> & { estimate_photos: { id: string; path: string }[] })[];
  const paths = rows.flatMap((r) => r.estimate_photos.map((p) => p.path));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from(ESTIMATE_BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  const estimates = rows.map(({ estimate_photos, ...e }) => ({
    ...e,
    photos: estimate_photos.map((p) => ({ id: p.id, path: p.path, url: signed.get(p.path) ?? null })),
  }));

  return NextResponse.json({ who, priceBook: book.data ?? [], estimates, contractors: pros.data ?? [] });
}

type Body = Record<string, unknown> & { action?: string };

export async function POST(req: Request) {
  const who = await requireAdmin(req);
  if (!who) return denied();
  const db = adminDb();
  if (!db) return bad("Database not connected.", 503);
  const b = (await req.json().catch(() => ({}))) as Body;
  const now = new Date().toISOString();

  switch (b.action) {
    case "price_save": {
      const trade = str(b.trade, 20), item = str(b.item, 120), unit = str(b.unit, 30) || "each";
      const low = toNum(b.low), high = toNum(b.high);
      if (!isTrade(trade) || !item) return bad("Pick a trade and name the item.");
      if (!(low >= 0) || !(high >= low)) return bad("Enter a low and a high price (high at least the low).");
      const row = { trade, item, unit, low, high, source: str(b.source, 200), updated_at: now };
      const q = b.id ? db.from("price_book").update(row).eq("id", String(b.id)) : db.from("price_book").insert(row);
      const { error } = await q;
      return error ? bad("Couldn't save that price.", 500) : NextResponse.json({ ok: true });
    }

    case "price_delete": {
      const { error } = await db.from("price_book").update({ active: false, updated_at: now }).eq("id", String(b.id ?? ""));
      return error ? bad("Couldn't remove it.", 500) : NextResponse.json({ ok: true });
    }

    case "estimate_save": {
      const trade = str(b.trade, 20);
      if (!isTrade(trade)) return bad("Pick a trade.");
      const zip = str(b.zip, 5);
      if (zip && !/^[0-9]{5}$/.test(zip)) return bad("ZIP must be 5 digits.");
      const items: Line[] = cleanLines(b.items);
      const totals = lineTotals(items);
      // A typed-in range overrides the line maths (the estimator's judgement);
      // otherwise the range is the sum of the lines.
      const oLow = toNum(b.range_low), oHigh = toNum(b.range_high);
      const range_low = oLow >= 0 ? oLow : items.length ? totals.low : null;
      const range_high = oHigh >= 0 ? Math.max(oHigh, range_low ?? 0) : items.length ? totals.high : null;
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
      // Lane is only changed when the caller says so (the send box does).
      const lane = b.lane === "B" ? "B" : b.lane === "A" ? "A" : undefined;
      if (b.id) {
        // Keep the original time of the homeowner's OK; set it the first time only.
        const { data: cur } = await db.from("estimates").select("share_consent_at").eq("id", String(b.id)).single();
        if (!cur) return bad("Estimate not found.", 404);
        const share_consent_at = b.share_consent ? cur.share_consent_at ?? now : null;
        const { data, error } = await db.from("estimates")
          .update({ ...row, share_consent_at, ...(lane ? { lane } : {}) }).eq("id", String(b.id)).select("id").single();
        return error ? bad("Couldn't save the estimate.", 500) : NextResponse.json({ ok: true, id: data.id });
      }
      const { data, error } = await db.from("estimates")
        .insert({ ...row, lane: lane ?? "A", share_consent_at: b.share_consent ? now : null, created_by: who }).select("id").single();
      return error ? bad("Couldn't save the estimate.", 500) : NextResponse.json({ ok: true, id: data.id });
    }

    case "estimate_delete": {
      const id = String(b.id ?? "");
      const { data: e } = await db.from("estimates").select("status, estimate_photos(path)").eq("id", id).single();
      if (!e) return bad("Not found.", 404);
      if (e.status !== "draft") return bad("Only drafts can be deleted. Mark it lost instead.");
      const paths = ((e.estimate_photos ?? []) as { path: string }[]).map((p) => p.path);
      if (paths.length) await db.storage.from(ESTIMATE_BUCKET).remove(paths);
      const { error } = await db.from("estimates").delete().eq("id", id);
      return error ? bad("Couldn't delete it.", 500) : NextResponse.json({ ok: true });
    }

    case "send": return send(db, b, now);

    case "outcome": {
      const id = String(b.id ?? "");
      const status = String(b.status ?? "");
      if (!["sent", "signed", "lost"].includes(status)) return bad("Bad status.");
      const signed = toNum(b.signed_price), sub = toNum(b.sub_price), pct = toNum(b.fee_pct);
      const { data: cur } = await db.from("estimates").select("signed_at, fee_paid_at, lane").eq("id", id).single();
      if (!cur) return bad("Not found.", 404);
      if (status === "signed" && !(signed > 0)) return bad("Enter the signed contract price.");
      const update: Record<string, unknown> = {
        status, updated_at: now,
        signed_price: signed >= 0 ? signed : null,
        sub_price: sub >= 0 ? sub : null,
        fee_pct: pct >= 0 && pct <= 100 ? pct : null,
        signed_at: status === "signed" ? cur.signed_at ?? now : null,
        fee_paid_at: b.fee_paid ? cur.fee_paid_at ?? now : null,
      };
      const { error } = await db.from("estimates").update(update).eq("id", id);
      return error ? bad("Couldn't save that.", 500) : NextResponse.json({ ok: true });
    }
  }
  return bad("Unknown action.");
}

/**
 * Sends the scope to ONE contractor. Refused unless the homeowner's
 * permission to share is recorded on the estimate, the company is approved
 * in that trade, and there is a way to reach the homeowner.
 */
async function send(db: NonNullable<ReturnType<typeof adminDb>>, b: Body, now: string) {
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
    ...(items.length
      ? ["", "Measured on site:", ...items.map((l) => `- ${l.item}: ${l.qty} ${l.unit}`)]
      : []),
    ...(e.range_low != null && e.range_high != null
      ? ["", `JHP estimate range: ${money(e.range_low)} – ${money(e.range_high)}`,
         "This range is from JHP's site visit. Your price is yours to set."]
      : []),
    ...(e.notes ? ["", "Notes:", e.notes] : []),
    ...(links.length
      ? ["", `Photos (links work for 14 days):`, ...links.map((l, i) => `${i + 1}. ${l}`)]
      : []),
    "",
    ...(e.lane === "A"
      ? [`TERMS: Per your partner agreement, the referral fee on this job is ${pct}% of the signed contract price. Please reply with the signed price once the homeowner signs.`]
      : ["TERMS: Subcontract terms are agreed in writing with JHP before work starts."]),
    "",
    `— ${SITE.brand}`,
  ];

  const r = await sendEmail(pro.email, `JHP job: ${trade.label} in ${e.zip || "NJ"} — ${e.homeowner_name}`, lines.join("\n"));
  const update = {
    roofer_id: pro.id,
    fee_pct: e.lane === "A" ? pct : e.fee_pct,
    updated_at: now,
    ...(r.ok ? { status: e.status === "draft" ? "sent" : e.status, sent_at: now, send_error: null } : { send_error: r.error ?? "send_failed" }),
  };
  await db.from("estimates").update(update).eq("id", id);
  if (!r.ok) return bad(`The email didn't go out: ${r.error ?? "unknown error"}`, 502);
  return NextResponse.json({ ok: true });
}
