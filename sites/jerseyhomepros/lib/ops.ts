import { adminDb, alertEmails, sendEmail } from "./server";
import { SITE } from "./site";
import { tradeOr } from "./trades";
import { jhpEarnings, money, repCommission, type Estimate } from "./estimator";
import { firstName } from "./assign";

/**
 * The hands-off daily run: chase contractors on sent jobs, send fee notices
 * on signed ones, then email Khalil one morning briefing of what needs him.
 * Every contractor email sets Reply-To to Khalil, because the From address
 * has no inbox.
 */

type DB = NonNullable<ReturnType<typeof adminDb>>;
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export const MAX_CHASES = 2;      // day 3, day 7
export const MAX_FEE_NOTICES = 4; // when signed, then weekly

type Pro = { id: string; company: string; contact: string; email: string };
type Row = Estimate & { chase_count: number; last_chase_at: string | null; fee_notice_count: number; last_fee_notice_at: string | null; roofers: Pro | null };

const COLS = "id, created_at, trade, status, lane, homeowner_name, zip, sent_at, signed_at, signed_price, sub_price, fee_pct, fee_paid_at, rep_id, rep_commission_pct, rep_paid_at, visited_at, help_requested_at, assigned_at, source, range_low, range_high, chase_count, last_chase_at, fee_notice_count, last_fee_notice_at, roofer_id, roofers(id, company, contact, email)";

export async function runChasers(db: DB) {
  const replyTo = alertEmails()[0];
  const now = new Date().toISOString();
  const out = { chases: [] as string[], feeNotices: [] as string[], errors: [] as string[] };

  // 1. "Did it sign?" on referral jobs: day 3, then day 7.
  const { data: sent } = await db.from("estimates").select(COLS).eq("status", "sent").eq("lane", "A")
    .lt("chase_count", MAX_CHASES).not("sent_at", "is", null).limit(200);
  for (const e of (sent ?? []) as unknown as Row[]) {
    const due = e.chase_count === 0 ? e.sent_at! <= ago(3) : (e.last_chase_at ?? e.sent_at!) <= ago(4);
    if (!due || !e.roofers?.email) continue;
    const t = tradeOr(e.trade);
    const r = await sendEmail(e.roofers.email, `Quick check: ${t.label} job in ${e.zip || "NJ"} (${firstName(e.homeowner_name)})`, [
      `${e.roofers.contact || e.roofers.company},`, "",
      `Checking on the ${t.label.toLowerCase()} job ${SITE.brand} sent you on ${shortDate(e.sent_at!)} for ${e.homeowner_name || "a homeowner"} in ${e.zip || "NJ"}.`, "",
      `Just reply to this email with one of these:`,
      `  SIGNED + the contract price`,
      `  NOT YET (still talking)`,
      `  LOST (they went another way)`, "",
      `Thanks — ${SITE.brand}`,
    ].join("\n"), replyTo);
    if (r.ok) {
      await db.from("estimates").update({ chase_count: e.chase_count + 1, last_chase_at: now }).eq("id", e.id);
      out.chases.push(`${e.roofers.company} — ${e.homeowner_name || e.zip} (check-in ${e.chase_count + 1})`);
    } else out.errors.push(`chase ${e.id}: ${r.error}`);
  }

  // 2. Fee notices on signed referral jobs, until marked paid.
  const { data: signed } = await db.from("estimates").select(COLS).eq("status", "signed").eq("lane", "A")
    .is("fee_paid_at", null).lt("fee_notice_count", MAX_FEE_NOTICES).limit(200);
  for (const e of (signed ?? []) as unknown as Row[]) {
    const fee = jhpEarnings(e);
    if (fee == null || fee <= 0 || !e.roofers?.email) continue;
    // The fee is due once the homeowner has paid the contractor (Khalil, Oct 30),
    // so the first notice waits 14 days after signing, then weekly.
    const due = e.fee_notice_count === 0 ? (e.signed_at ?? now) <= ago(14) : (e.last_fee_notice_at ?? now) <= ago(7);
    if (!due) continue;
    const t = tradeOr(e.trade);
    const r = await sendEmail(e.roofers.email, `${e.fee_notice_count ? "Reminder: " : ""}JHP referral fee — ${t.label} job, ${e.homeowner_name || e.zip}`, [
      `${e.roofers.contact || e.roofers.company},`, "",
      `Checking in on the ${t.label.toLowerCase()} job you signed for ${e.homeowner_name || "the homeowner"} in ${e.zip || "NJ"}.`, "",
      `Per your partner agreement, the ${SITE.brand} referral fee is:`,
      `  ${e.fee_pct}% of ${money(e.signed_price)} = ${money(fee)}`,
      `It's due once the homeowner has paid you for the job.`, "",
      `Reply to this email with one of these:`,
      `  PAID IN FULL (the homeowner has paid you; we'll send payment details)`,
      `  NOT YET (job still in progress or payment pending)`,
      `  or tell us if the final price changed.`, "",
      `Thanks — ${SITE.brand}`,
    ].join("\n"), replyTo);
    if (r.ok) {
      await db.from("estimates").update({ fee_notice_count: e.fee_notice_count + 1, last_fee_notice_at: now }).eq("id", e.id);
      out.feeNotices.push(`${e.roofers.company} — ${money(fee)} (notice ${e.fee_notice_count + 1})`);
    } else out.errors.push(`fee ${e.id}: ${r.error}`);
  }
  return out;
}

/** One email to Khalil: what needs him today, what ran on its own, who to call. */
export async function sendBriefing(db: DB, auto: Awaited<ReturnType<typeof runChasers>>, extra: { done?: string[]; needs?: string[] } = {}) {
  const since = ago(1);
  const [ests, leads, apps, claims, pending, reps, callList] = await Promise.all([
    db.from("estimates").select(COLS).in("status", ["requested", "draft", "sent", "signed"]).limit(500),
    db.from("leads").select("id, trade, zip, created_at, status, operator_notified_at, operator_notify_error").neq("status", "spam").gte("created_at", ago(30)),
    db.from("road_pro_applications").select("name, phone, home_zip, created_at").eq("status", "new").order("created_at"),
    db.from("claims").select("contact, phone, created_at, roofers(company, trade)").eq("status", "new"),
    db.from("roofers").select("company, contact, phone, trade, created_at").eq("status", "pending"),
    db.from("road_pros").select("id, name").eq("active", true),
    db.from("roofers").select("id, company, trade, city, website, license_number, slug").eq("status", "unclaimed")
      .in("trade", ["roofing", "hvac", "hardscaping", "windows"])
      .order("call_suggested_at", { ascending: true, nullsFirst: true }).limit(5),
  ]);
  const E = (ests.data ?? []) as unknown as Row[];
  const repName = new Map<string, string>();
  for (const r of reps.data ?? []) repName.set(String(r.id), String(r.name));
  const label = (e: Row) => `${tradeOr(e.trade).label}, ${e.zip || "NJ"} — ${e.homeowner_name || "no name"}`;
  const open = (e: Row) => e.status === "requested" || e.status === "draft";

  const help = E.filter((e) => e.help_requested_at && e.help_requested_at >= ago(2) && open(e));
  const unassigned = E.filter((e) => e.status === "requested" && !e.rep_id);
  const toPrice = E.filter((e) => open(e) && e.visited_at);
  const silent = E.filter((e) => e.status === "sent" && e.lane === "A" && e.chase_count >= MAX_CHASES && (e.last_chase_at ?? "") <= ago(3));
  const unpaid = E.filter((e) => e.status === "signed" && !e.fee_paid_at);
  const owed = unpaid.reduce((s, e) => s + (jhpEarnings(e) ?? 0), 0);
  const repDue = E.filter((e) => e.status === "signed" && e.fee_paid_at && !e.rep_paid_at && e.rep_id);
  const leadRows = leads.data ?? [];
  const unalerted = leadRows.filter((l) => !l.operator_notified_at || l.operator_notify_error);
  const newLeads = leadRows.filter((l) => l.created_at >= since);
  const newBookings = E.filter((e) => e.source === "booking" && e.created_at >= since);

  const section = (title: string, rows: string[]) => (rows.length ? ["", title, ...rows.map((r) => `  • ${r}`)] : []);
  const needs = [
    ...help.map((e) => `HELP asked at a visit: ${label(e)}${e.rep_id ? ` (${repName.get(e.rep_id) ?? "Road Pro"})` : ""}`),
    ...unassigned.map((e) => `Booking needs a Road Pro: ${label(e)}`),
    ...toPrice.map((e) => `Visit done, ready to price and send: ${label(e)}`),
    ...silent.map((e) => `No answer after ${MAX_CHASES} check-ins — call ${e.roofers?.company ?? "the contractor"}: ${label(e)}`),
    ...unpaid.filter((e) => e.lane === "B" || e.fee_notice_count >= MAX_FEE_NOTICES).map((e) => `Unpaid after ${MAX_FEE_NOTICES} notices${e.lane === "B" ? " (JHP job)" : ""} — call ${e.roofers?.company ?? ""}: ${label(e)} ${money(jhpEarnings(e))}`),
    ...repDue.map((e) => `Pay ${repName.get(e.rep_id!) ?? "Road Pro"} ${money(repCommission(e))}: ${label(e)}`),
    ...(unalerted.length ? [`${unalerted.length} request(s) with no confirmed alert — check /admin`] : []),
    ...(extra.needs ?? []),
  ];
  const calls = [
    ...(apps.data ?? []).map((a) => `Road Pro applicant: ${a.name}${a.phone ? ` · ${a.phone}` : ""}${a.home_zip ? ` · ${a.home_zip}` : ""}`),
    ...(claims.data ?? []).map((c) => {
      const r = c.roofers as unknown as { company: string; trade: string } | null;
      return `Verify claim: ${c.contact} for ${r?.company ?? "a listing"}${c.phone ? ` · ${c.phone}` : ""} (call the number on their own website/registration)`;
    }),
    ...(pending.data ?? []).map((p) => `Contractor applied: ${p.company} (${tradeOr(p.trade).label})${p.phone ? ` · ${p.phone}` : ""}`),
    ...(callList.data ?? []).map((r) => `Pitch: ${r.company} — ${tradeOr(r.trade).label}, ${r.city || "NJ"}${r.license_number ? ` · HIC ${r.license_number}` : ""}${r.website ? ` · ${r.website}` : ""}`),
  ];
  if (callList.data?.length) {
    await db.from("roofers").update({ call_suggested_at: new Date().toISOString() }).in("id", callList.data.map((r) => r.id));
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" });
  const text = [
    `Good morning, Khalil. ${SITE.brand} for ${today}.`,
    ...(needs.length ? section("NEEDS YOU", needs) : ["", "NEEDS YOU", "  Nothing. Everything is handled."]),
    "",
    "LAST 24 HOURS",
    `  • ${newBookings.length} free-visit booking(s), ${newLeads.length} contractor request(s)`,
    `  • Owed to JHP on signed jobs: ${money(owed)} (${unpaid.length} job${unpaid.length === 1 ? "" : "s"})`,
    ...section("DONE FOR YOU", [...auto.chases.map((c) => `Check-in sent: ${c}`), ...auto.feeNotices.map((f) => `Fee notice sent: ${f}`), ...(extra.done ?? [])]),
    ...section("CALL LIST", calls),
    ...(auto.errors.length ? ["", `(${auto.errors.length} automatic email(s) failed — they'll retry tomorrow)`] : []),
    "",
    `Estimator: ${SITE.url}/estimator  ·  Admin: ${SITE.url}/admin`,
  ].join("\n");

  const subject = needs.length ? `JHP today: ${needs.length} thing${needs.length === 1 ? "" : "s"} need you` : "JHP today: all clear";
  return sendEmail(alertEmails(), subject, text);
}
