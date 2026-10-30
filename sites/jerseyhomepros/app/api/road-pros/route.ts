import { NextResponse } from "next/server";
import { cleanAttribution } from "../../../lib/attribution";
import { adminDb, alertEmails, sendEmail } from "../../../lib/server";
import { SITE } from "../../../lib/site";
import { firstName } from "../../../lib/assign";
import { RP_CONSENT } from "../../../lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Road Pro application. Lands in Estimator → Road Pros; applicant gets next steps; Khalil gets an alert. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (str(b.company_site, 100)) return NextResponse.json({ ok: true }); // honeypot
  const name = str(b.name, 120), email = str(b.email, 200).toLowerCase(), phone = str(b.phone, 40);
  const home_zip = str(b.home_zip, 5);
  if (!name) return bad("Please add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Please add a valid email.");
  if (phone.replace(/\D/g, "").length < 10) return bad("Please add a phone number.");
  if (!/^[0-9]{5}$/.test(home_zip)) return bad("Please add your 5-digit ZIP code.");
  if (b.consent !== true) return bad("Please tick the box so we can contact you.");

  const db = adminDb();
  if (!db) return bad("Unavailable. Please try again later.", 503);
  const { data: dup } = await db.from("road_pro_applications").select("id").eq("email", email).gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(1);
  if (dup?.length) return NextResponse.json({ ok: true, duplicate: true });

  const { error } = await db.from("road_pro_applications").insert({
    name, email, phone, home_zip, has_car: b.has_car === true,
    availability: str(b.availability, 300), experience: str(b.experience, 1500), consent_text: RP_CONSENT,
    attribution: cleanAttribution(b.attribution),
  });
  if (error) return bad("Couldn't send that. Please try again.", 500);

  const replyTo = alertEmails()[0];
  await sendEmail(email, `Your JHP Road Pro application`, [
    `Hi ${firstName(name)},`, "",
    `Thanks for applying to be a ${SITE.brand} Road Pro.`, "",
    "What happens next:",
    "  1. Khalil calls or texts you for a short conversation.",
    "  2. If it's a fit, you get a background check request from our screening company, with its own disclosure and consent form. Nothing is run without your signed permission.",
    "  3. Once that's clear, you get your commission agreement and a link to set up the JHP Road Pro app.", "",
    "Questions? Just reply to this email.", "",
    `— ${SITE.brand}`,
  ].join("\n"), replyTo);
  await sendEmail(alertEmails(), `New Road Pro applicant: ${name} (${home_zip})`, [
    `${name} applied to be a Road Pro.`, "",
    `Phone: ${phone}`, `Email: ${email}`, `Home ZIP: ${home_zip}`, `Has a car: ${b.has_car === true ? "yes" : "no"}`,
    ...(str(b.availability, 300) ? [`Availability: ${str(b.availability, 300)}`] : []),
    ...(str(b.experience, 1500) ? ["", str(b.experience, 1500)] : []),
    "", `Review in the Estimator → Road Pros: ${SITE.url}/estimator`,
  ].join("\n"));
  return NextResponse.json({ ok: true });
}
