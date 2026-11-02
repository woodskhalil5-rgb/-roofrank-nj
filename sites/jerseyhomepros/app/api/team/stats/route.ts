import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { requireTeamKey } from "../../../../lib/teamkeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Counts only, for the team's tracking: no names, phones, emails or amounts owed. */
export async function GET(req: Request) {
  if (!(await requireTeamKey(req, "stats"))) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const since = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const [leads, apps, pros, visits] = await Promise.all([
    db.from("leads").select("trade, created_at, attribution").neq("status", "spam").gte("created_at", since(30)),
    db.from("roofers").select("trade, created_at, attribution, wants_partner").gte("created_at", since(30)).neq("source", "public_records"),
    db.from("roofers").select("trade, status, billing_plan, verified_at").in("status", ["approved", "pending", "unclaimed"]),
    db.from("estimates").select("trade, created_at").eq("source", "booking").gte("created_at", since(30)),
  ]);
  const count = <T,>(rows: T[] | null, key: (r: T) => string) => {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) { const k = key(r) || "unknown"; m[k] = (m[k] ?? 0) + 1; }
    return m;
  };
  type L = { trade: string; created_at: string; attribution: Record<string, string> | null };
  const L7 = (leads.data ?? []).filter((l) => l.created_at >= since(7));
  const src = (r: L) => r.attribution?.utm_source || (r.attribution?.gclid ? "google_ads" : r.attribution?.fbclid ? "meta" : r.attribution?.referrer ? "referral" : "direct");
  const P = pros.data ?? [];
  return NextResponse.json({
    as_of: new Date().toISOString(),
    homeowner_requests: { last_7_days: L7.length, last_30_days: leads.data?.length ?? 0, by_trade_30d: count(leads.data as unknown as L[], (r) => r.trade), by_source_30d: count(leads.data as unknown as L[], src) },
    free_visit_bookings_30d: { total: visits.data?.length ?? 0, by_trade: count(visits.data, (r) => r.trade) },
    contractor_signups_30d: { total: apps.data?.length ?? 0, wants_partner: (apps.data ?? []).filter((a) => a.wants_partner).length, by_trade: count(apps.data, (r) => r.trade), by_source: count(apps.data as unknown as L[], src) },
    companies: {
      members: P.filter((p) => p.status === "approved").length,
      applied: P.filter((p) => p.status === "pending").length,
      pre_listed: P.filter((p) => p.status === "unclaimed").length,
      verified_members: P.filter((p) => p.status === "approved" && p.verified_at).length,
      members_by_plan: count(P.filter((p) => p.status === "approved"), (p) => p.billing_plan),
      members_by_trade: count(P.filter((p) => p.status === "approved"), (p) => p.trade),
    },
  });
}
