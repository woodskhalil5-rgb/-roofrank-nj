import { NextResponse } from "next/server";
import { adminDb, requireAdmin, notifyRoofer, type LeadForEmail } from "../../../lib/server";

// A Response body can only be consumed once, so this must build a fresh
// object per request rather than share one module-level instance.
const denied = () => NextResponse.json({ error: "Not authorised." }, { status: 401 });

export async function GET(req: Request) {
  const who = await requireAdmin(req);
  if (!who) return denied();

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const [roofers, leads, matches, performance] = await Promise.all([
    db.from("roofers").select("*").order("created_at", { ascending: false }),
    db.from("leads").select("*").order("created_at", { ascending: false }).limit(200),
    db
      .from("lead_matches")
      .select("id, lead_id, roofer_id, distance_miles, notified_at, notify_error, roofers(company)")
      .order("created_at", { ascending: false })
      .limit(1000),
    db.from("roofer_performance").select("*").order("leads_received", { ascending: false }),
  ]);

  return NextResponse.json({
    who,
    roofers: roofers.data ?? [],
    leads: leads.data ?? [],
    matches: matches.data ?? [],
    performance: performance.data ?? [],
  });
}

export async function POST(req: Request) {
  const who = await requireAdmin(req);
  if (!who) return denied();

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "set_roofer_status") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!id || !["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { error } = await db.from("roofers").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_lead_status") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!id || !["new", "working", "closed", "spam"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { error } = await db.from("leads").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Re-run matching for an existing lead, e.g. after approving a new roofer.
  if (action === "rematch_lead") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing lead id." }, { status: 400 });
    const { data: count, error } = await db.rpc("match_lead", { p_lead_id: id });
    if (error) return NextResponse.json({ error: "Matching failed." }, { status: 500 });
    return NextResponse.json({ ok: true, matched: typeof count === "number" ? count : 0 });
  }

  // Retry any match whose notification email never went out.
  if (action === "retry_notifications") {
    const { data: rows } = await db
      .from("lead_matches")
      .select("id, distance_miles, lead_id, roofers(company, email), leads(*)")
      .is("notified_at", null)
      .limit(50);

    let sent = 0;
    let failed = 0;
    for (const row of rows ?? []) {
      const r = row as unknown as {
        id: string;
        distance_miles: number | null;
        roofers: { company: string; email: string } | null;
        leads: (LeadForEmail & { phone_consent?: boolean }) | null;
      };
      if (!r.roofers?.email || !r.leads) continue;
      const dist = r.distance_miles === null ? null : Number(r.distance_miles);
      const out = await notifyRoofer(
        r.roofers.email,
        r.roofers.company,
        r.leads,
        dist,
        r.leads.phone_consent === true
      );
      await db
        .from("lead_matches")
        .update(
          out.ok
            ? { notified_at: new Date().toISOString(), notify_error: null }
            : { notify_error: out.error ?? "unknown" }
        )
        .eq("id", r.id);
      if (out.ok) sent++; else failed++;
    }
    return NextResponse.json({ ok: true, sent, failed });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
