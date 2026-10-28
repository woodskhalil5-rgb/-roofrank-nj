import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { runChasers, sendBriefing } from "../../../../lib/ops";
import { GET as homeReminders } from "../home-reminders/route";

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
  const brief = await sendBriefing(db, auto);
  if (!brief.ok) console.error(`[daily] briefing failed: ${brief.error}`);
  return NextResponse.json({ reminders, chases: auto.chases.length, feeNotices: auto.feeNotices.length, errors: auto.errors, briefing: brief.ok });
}
