import { NextResponse } from "next/server";
import { adminDb, adminEmails, sendEmail } from "../../../lib/server";
import { isTradeSlug, TRADES } from "../../../lib/trades";
import { SITE } from "../../../lib/site";

/**
 * Interest in missed-call recovery, captured before the product exists.
 *
 * Deliberately NOT a lead: nothing here is matched, routed or shared with any
 * other company. It is a contractor telling us they want a slot, and the only
 * person who ever sees it is the operator.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const required = ["company", "contact", "email", "phone"];
    for (const key of required) {
      if (!String(body[key] ?? "").trim()) {
        return NextResponse.json({ error: `Missing required field: ${key}` }, { status: 400 });
      }
    }

    const email = String(body.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid business email address." }, { status: 400 });
    }

    // Trade is optional here — a contractor can want this without joining the
    // lead network, and refusing them over it would cost a sale for nothing.
    const rawTrade: unknown = body.trade;
    const trade = isTradeSlug(rawTrade) ? rawTrade : null;

    const db = adminDb();
    if (!db) {
      return NextResponse.json(
        { error: "We can't take sign-ups just this moment. Please try again shortly." },
        { status: 503 }
      );
    }

    const company = String(body.company).trim();
    const contact = String(body.contact).trim();
    const phone = String(body.phone).trim();
    const missed = String(body.missed_estimate ?? "").trim();
    const setup = String(body.current_setup ?? "").trim();

    const { error } = await db.from("receptionist_waitlist").insert({
      company,
      contact,
      email,
      phone,
      trade,
      missed_estimate: missed || null,
      current_setup: setup || null,
      notes: String(body.notes ?? "").trim(),
      status: "new",
    });

    if (error) {
      return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
    }

    // Best-effort operator alert. A failed send must not fail the sign-up:
    // the row is already saved and visible in the database either way.
    const to = adminEmails()[0];
    if (to) {
      await sendEmail(
        to,
        `Missed-call slot request — ${company}`,
        [
          `${company} wants a missed-call recovery slot.`,
          ``,
          `Contact: ${contact}`,
          `Phone:   ${phone}`,
          `Email:   ${email}`,
          ...(trade ? [`Trade:   ${TRADES[trade].label}`] : []),
          ...(missed ? [`Missed calls a week: ${missed}`] : []),
          ...(setup ? [`Handles calls now:   ${setup}`] : []),
          ``,
          `Call them back today. This is the warmest a contractor ever gets.`,
          ``,
          `— ${SITE.brand}`,
        ].join("\n")
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
