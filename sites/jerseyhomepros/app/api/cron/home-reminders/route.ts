import { NextResponse } from "next/server";
import { adminDb, sendEmail } from "../../../../lib/server";
import { SITE } from "../../../../lib/site";
import { TRADES, isTradeSlug } from "../../../../lib/trades";

export const maxDuration = 60;

/**
 * Daily Home Board reminders (Vercel Cron, signed with CRON_SECRET).
 * Only for homeowners who ticked the reminders box; one email per homeowner
 * listing open to-dos due within 3 days; each to-do is reminded once (a new
 * due date resets that). Every email has a one-click unsubscribe and the
 * postal address, as CAN-SPAM requires.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await db
    .from("home_todos")
    .select("id, title, trade, due_date, homeowner_id, homeowners!inner(email, zip, reminders, unsub_token)")
    .eq("status", "open")
    .is("reminded_at", null)
    .not("due_date", "is", null)
    .lte("due_date", soon)
    .eq("homeowners.reminders", true)
    .limit(300);

  type Row = {
    id: string; title: string; trade: string | null; due_date: string; homeowner_id: string;
    homeowners: { email: string; zip: string | null; reminders: boolean; unsub_token: string };
  };
  const byOwner = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    byOwner.set(r.homeowner_id, [...(byOwner.get(r.homeowner_id) ?? []), r]);
  }

  const postal = process.env.POSTAL_ADDRESS ?? "";
  let sent = 0;
  for (const rows of byOwner.values()) {
    const h = rows[0].homeowners;
    const lines = [
      `Here's what's coming up on your ${SITE.brand} Home Board:`,
      ``,
      ...rows.flatMap((r) => {
        const t = r.trade && isTradeSlug(r.trade) ? TRADES[r.trade] : null;
        return [
          `• ${r.title} (${new Date(r.due_date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
          ...(t ? [`  Get help: ${SITE.url}/${t.slug}${h.zip ? `?zip=${h.zip}` : ""}#estimate`] : []),
        ];
      }),
      ``,
      `Open your board: ${SITE.url}/home`,
      ``,
      `— ${SITE.brand}`,
      ``,
      `You're getting this because you turned on reminders on your Home Board.`,
      `Unsubscribe: ${SITE.url}/api/home/unsubscribe?t=${h.unsub_token}`,
      ...(postal ? [postal] : []),
    ];
    const res = await sendEmail(h.email, `Coming up on your Home Board`, lines.join("\n"));
    if (res.ok) {
      sent += 1;
      await db.from("home_todos").update({ reminded_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
    } else {
      console.error(`[home-reminders] send failed: ${res.error}`);
    }
  }
  return NextResponse.json({ ok: true, homeowners: byOwner.size, sent });
}
