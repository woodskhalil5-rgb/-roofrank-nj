import { NextResponse } from "next/server";
import { adminDb, notifyOperatorClaim } from "../../../../lib/server";
import { listedProBySlug } from "../../../../lib/pros";
import { tradeOr } from "../../../../lib/trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A request to claim an unclaimed listing. Recorded and sent to the operator;
 * nothing about the listing changes until the operator approves it in /admin.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const pro = await listedProBySlug(String(body.slug ?? ""));
  if (!pro || pro.status !== "unclaimed") {
    return NextResponse.json({ error: "This page can't be claimed." }, { status: 400 });
  }

  const contact = String(body.contact ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().slice(0, 320);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const role = String(body.role ?? "").trim().slice(0, 120);
  if (!contact) return NextResponse.json({ error: "Add your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if ((phone.match(/[0-9]/g) ?? []).length < 10) {
    return NextResponse.json({ error: "Enter a phone number with area code." }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Confirm that you work for this company." }, { status: 400 });
  }

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 120);
  // A handful of claims per IP per day is plenty for a real company.
  if (ip) {
    const { count } = await db
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: "Too many claim requests today. Try again tomorrow." }, { status: 429 });
    }
  }

  const { data: inserted, error } = await db
    .from("claims")
    .insert({ roofer_id: pro.id, contact, email, phone, role, ip })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: "Couldn't send your claim. Try again." }, { status: 500 });
  }

  const { data: demand } = await db.rpc("area_demand", { p_roofer_id: pro.id, p_days: 30 });
  const out = await notifyOperatorClaim(
    pro.company, tradeOr(pro.trade), pro.city, contact, email, phone, role,
    typeof demand === "number" ? demand : 0
  );
  await db
    .from("claims")
    .update({
      operator_notified_at: out.ok ? new Date().toISOString() : null,
      operator_notify_error: out.error ?? null,
    })
    .eq("id", inserted.id);
  if (!out.ok) console.error(`[claim] operator alert failed claim=${inserted.id} error=${out.error}`);

  return NextResponse.json({ ok: true });
}
