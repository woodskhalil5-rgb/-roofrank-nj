import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { runChasers, sendBriefing } from "../../../../lib/ops";
import { GET as homeReminders } from "../home-reminders/route";
import { runBilling } from "../../../../lib/billing";
import { dollars } from "../../../../lib/stripe";

export const maxDuration = 120;

/**
 * Daily 11:30 UTC (7:30am EDT / 6:30am EST), signed with CRON_SECRET.
 * One cron entry does three jobs so the project stays inside Vercel's cron
 * limits: Home Board reminders, contractor check-ins + fee notices, then the
 * morning briefing to Khalil.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const reminders = await homeReminders(req).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  const auto = await runChasers(db);
  // Billing: accrue delivered leads daily, invoice on the 1st. Never blocks the briefing.
  const done: string[] = [], needs: string[] = [];
  let billing: unknown = null;
  try {
    const b = await runBilling(db);
    billing = b;
    if (!b.off) {
      if (b.accrued.created || b.accrued.free) done.push(`Leads logged for billing: ${b.accrued.created} billable, ${b.accrued.free} free`);
      for (const s of b.accrued.skipped) needs.push(`Billing skipped — ${s}`);
      for (const i of b.billed.invoices) done.push(`Invoice sent: ${i}`);
      for (const e of b.billed.errors) needs.push(`Invoice failed: ${e}`);
    }
  } catch (e) { needs.push(`Billing run failed: ${e instanceof Error ? e.message : "error"}`); }
  const { data: failed } = await db.from("charges").select("amount_cents, roofers(company)").eq("status", "failed");
  for (const f of failed ?? []) needs.push(`Payment failed: ${(f.roofers as unknown as { company: string } | null)?.company ?? "contractor"} ${dollars(Number(f.amount_cents))} (Stripe is retrying)`);
  const brief = await sendBriefing(db, auto, { done, needs });
  if (!brief.ok) console.error(`[daily] briefing failed: ${brief.error}`);
  return NextResponse.json({ reminders, chases: auto.chases.length, feeNotices: auto.feeNotices.length, errors: auto.errors, briefing: brief.ok, billing });
}
