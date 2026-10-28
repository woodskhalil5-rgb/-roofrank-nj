import { NextResponse } from "next/server";
import { adminDb, alertEmails, sendEmail } from "../../../lib/server";
import { SITE } from "../../../lib/site";
import { isTradeSlug, TRADES } from "../../../lib/trades";
import { VISIT_CONSENT_VERSION, visitConsentText, visitContractorCallsText } from "../../../lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Books a free JHP Road Pro site visit. Lands in the Estimator as a
 * "requested" job and alerts the operator. Refused unless the offer is
 * genuinely available for that ZIP and trade right now (visit_offered), so
 * the site can never take a booking nobody can drive to.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (str(b.company_site, 100)) return NextResponse.json({ ok: true }); // honeypot: bots fill every field

  const trade = str(b.trade, 20);
  const zip = str(b.zip, 5);
  const name = str(b.name, 120), phone = str(b.phone, 40), email = str(b.email, 200).toLowerCase();
  const address = str(b.address, 200), problem = str(b.problem, 1000), times = str(b.times, 300);
  if (!isTradeSlug(trade)) return bad("Pick a service.");
  if (!/^[0-9]{5}$/.test(zip)) return bad("Enter a 5-digit ZIP code.");
  if (!name || !address) return bad("Please add your name and the address for the visit.");
  if (phone.replace(/\D/g, "").length < 10) return bad("Please add a phone number so we can confirm the visit.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Please add a valid email address.");
  if (b.consent !== true) return bad("Please tick the box to agree to the visit.");

  const db = adminDb();
  if (!db) return bad("Unavailable. Please try again later.", 503);

  const { data: offered } = await db.rpc("visit_offered", { p_zip: zip, p_trade: trade });
  if (!offered) return bad("Free site visits aren't available for that ZIP or service yet. You can still send a request to contractors.", 409);

  // Same phone, same trade, last 30 minutes: a double-tap, not a second booking.
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: dup } = await db.from("estimates").select("id").eq("source", "booking").eq("trade", trade)
    .eq("homeowner_phone", phone).gte("created_at", since).limit(1);
  if (dup && dup.length) return NextResponse.json({ ok: true, duplicate: true });

  const t = TRADES[trade];
  const calls = b.contractor_calls === true;
  const consent_text = `[${VISIT_CONSENT_VERSION}] ${visitConsentText(t)}${calls ? ` | ${visitContractorCallsText(t)}` : ""}`;
  const now = new Date().toISOString();
  const { data: row, error } = await db.from("estimates").insert({
    created_by: "homeowner", source: "booking", status: "requested", trade, zip,
    homeowner_name: name, homeowner_phone: phone, homeowner_email: email, address, problem,
    visit_times: times, share_consent_at: now, consent_text,
    contact_method: calls ? "phone_email" : "email",
  }).select("id").single();
  if (error || !row) {
    console.error(`[visit] insert failed: ${error?.message}`);
    return bad("Couldn't book that. Please try again.", 500);
  }

  const alert = await sendEmail(alertEmails(), `New free site visit: ${t.label} in ${zip}`, [
    `A homeowner booked a free JHP Road Pro site visit.`,
    "",
    `Name: ${name}`, `Phone: ${phone}`, `Email: ${email}`, `Address: ${address}`, `ZIP: ${zip}`,
    `Service: ${t.label}`, ...(times ? [`Best times: ${times}`] : []), ...(problem ? ["", problem] : []),
    "",
    `Assign a Road Pro: ${SITE.url}/estimator`,
  ].join("\n"));
  if (!alert.ok) console.error(`[visit] operator alert failed estimate=${row.id} error=${alert.error}`);

  return NextResponse.json({
    ok: true,
    message: `Got it. ${SITE.brand} will call or text you at ${phone} to confirm a time for your free site visit.`,
  });
}
