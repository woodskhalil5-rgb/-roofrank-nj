import { NextResponse } from "next/server";
import { adminDb } from "../../../lib/server";
import { isTradeSlug } from "../../../lib/trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How many companies would receive a request for this trade + ZIP right now.
 *
 * Backs the Home Scan "N available in your ZIP" moment. The count comes from
 * `available_providers`, which uses exactly the same test as `match_lead`
 * (approved, leads_enabled, within radius), so the number shown before the
 * form is the number the request actually goes to. Unclaimed listings never
 * count: they don't receive requests.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const trade = q.get("trade") ?? "";
  const zip = q.get("zip") ?? "";
  if (!isTradeSlug(trade) || !/^[0-9]{5}$/.test(zip)) {
    return NextResponse.json({ error: "Enter a 5-digit ZIP code." }, { status: 400 });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });

  const [{ data, error }, visit] = await Promise.all([
    db.rpc("available_providers", { p_zip: zip, p_trade: trade }),
    // Free Road Pro visit offer: only when it can actually be honoured here.
    db.rpc("visit_offered", { p_zip: zip, p_trade: trade }),
  ]);
  if (error) return NextResponse.json({ error: "Unavailable." }, { status: 503 });

  return NextResponse.json(
    data === null ? { valid: false } : { valid: true, count: Number(data), visit: visit.data === true },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
