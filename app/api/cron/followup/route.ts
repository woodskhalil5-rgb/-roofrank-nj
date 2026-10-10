import { NextResponse } from "next/server";
import { adminDb, sendEmail } from "../../../../lib/server";

export const maxDuration = 60;

const SITE = "https://roofranknj.com";
const DAYS = 14;

/**
 * Sends the 14-day homeowner follow-up. Invoked by Vercel Cron (vercel.json),
 * which signs requests with CRON_SECRET as a bearer token.
 *
 * These are marketing emails under CAN-SPAM, so every one carries a one-click
 * unsubscribe and a postal address.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads } = await db
    .from("leads")
    .select("id, name, email, zip, service, feedback_token")
    .is("followup_sent_at", null)
    .is("feedback", null)
    .eq("unsubscribed", false)
    .eq("status", "new")
    .lte("created_at", cutoff)
    .limit(40);

  if (!leads?.length) return NextResponse.json({ ok: true, sent: 0 });

  const postal = process.env.POSTAL_ADDRESS ?? "";
  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    // Only offer roofers who were actually matched to this lead.
    const { data: matches } = await db
      .from("lead_matches")
      .select("roofer_id, roofers(company)")
      .eq("lead_id", lead.id)
      .not("notified_at", "is", null);

    const link = (a: string, r?: string) =>
      `${SITE}/api/feedback?t=${lead.feedback_token}&a=${a}${r ? `&r=${r}` : ""}`;

    const hiredLines = (matches ?? []).map((m) => {
      const row = m as unknown as { roofer_id: string; roofers: { company: string } | null };
      return `  • I hired ${row.roofers?.company ?? "them"}: ${link("hired", row.roofer_id)}`;
    });

    const body = [
      `Hi ${lead.name.split(" ")[0] || "there"},`,
      ``,
      `About two weeks ago you asked RoofRank NJ for help with ${lead.service.toLowerCase()} in ${lead.zip}.`,
      ``,
      `One question, and one click answers it — did you end up hiring anyone?`,
      ``,
      ...(hiredLines.length ? hiredLines : [`  • Yes, I hired someone: ${link("hired")}`]),
      `  • Still deciding: ${link("deciding")}`,
      `  • Nobody ever contacted me: ${link("no_contact")}`,
      ``,
      `That last one matters to us. If no one reached out, we want to know — we take`,
      `it up with the companies involved.`,
      ``,
      `Thanks,`,
      `RoofRank NJ`,
      ``,
      `—`,
      `RoofRank NJ is a referral service operated by Destiny Marketing Group LLC.`,
      `We are not a roofing contractor.`,
      postal ? postal : ``,
      `Don't want this follow-up? Unsubscribe: ${SITE}/api/feedback?t=${lead.feedback_token}&unsub=1`,
    ]
      .filter((l) => l !== ``)
      .join("\n");

    const out = await sendEmail(
      lead.email,
      `Did you find a roofer, ${lead.name.split(" ")[0] || "there"}?`,
      body
    );

    if (out.ok) {
      await db.from("leads").update({ followup_sent_at: new Date().toISOString() }).eq("id", lead.id);
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed });
}
