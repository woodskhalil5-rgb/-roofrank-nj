import { NextResponse } from "next/server";
import { adminDb } from "../../../lib/server";
import { currentHomeowner } from "../../../lib/homeowner";
import { isTradeSlug } from "../../../lib/trades";
import { SUGGESTIONS, dueDateFor, suggestionsFor } from "../../../lib/seasonal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TodoRow = {
  id: string;
  created_at: string;
  title: string;
  trade: string | null;
  due_date: string | null;
  status: "open" | "hired" | "done";
  source: "custom" | "seasonal" | "request";
  lead_id: string | null;
  done_at: string | null;
};

/** The signed-in homeowner's board. */
export async function GET(req: Request) {
  const h = await currentHomeowner(req);
  if (!h) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });

  const { data: todos } = await db
    .from("home_todos")
    .select("id, created_at, title, trade, due_date, status, source, lead_id, done_at")
    .eq("homeowner_id", h.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (todos ?? []) as TodoRow[];

  // For request items: when it was sent and how many companies it really went to.
  const leadIds = rows.flatMap((t) => (t.lead_id ? [t.lead_id] : []));
  const sentTo: Record<string, { created_at: string; zip: string; matched: number }> = {};
  if (leadIds.length) {
    const { data: leads } = await db.from("leads").select("id, created_at, zip").in("id", leadIds);
    const { data: matches } = await db.from("lead_matches").select("lead_id").in("lead_id", leadIds);
    for (const l of (leads ?? []) as { id: string; created_at: string; zip: string }[]) {
      sentTo[l.id] = { created_at: l.created_at, zip: l.zip, matched: 0 };
    }
    for (const m of (matches ?? []) as { lead_id: string }[]) {
      if (sentTo[m.lead_id]) sentTo[m.lead_id].matched += 1;
    }
  }

  const taken = new Set(rows.filter((t) => t.source === "seasonal").map((t) => t.title));
  return NextResponse.json({
    me: { email: h.email, zip: h.zip, reminders: h.reminders },
    todos: rows.map((t) => ({ ...t, request: t.lead_id ? sentTo[t.lead_id] ?? null : null })),
    suggestions: suggestionsFor()
      .filter((s) => !taken.has(s.title))
      .map((s) => ({ key: s.key, title: s.title, trade: s.trade, due_date: dueDateFor(s) })),
  });
}

/** Board edits. Every write is scoped to the signed-in homeowner's own rows. */
export async function POST(req: Request) {
  const h = await currentHomeowner(req);
  if (!h) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const date = (v: unknown) => {
    const s = String(v ?? "");
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };

  if (action === "add_todo") {
    const title = String(body.title ?? "").trim().slice(0, 160);
    if (!title) return NextResponse.json({ error: "Write what needs doing." }, { status: 400 });
    const { count } = await db.from("home_todos").select("id", { count: "exact", head: true }).eq("homeowner_id", h.id);
    if ((count ?? 0) >= 200) return NextResponse.json({ error: "Your board is full." }, { status: 400 });
    const trade = isTradeSlug(body.trade) ? body.trade : null;
    const { error } = await db.from("home_todos").insert({
      homeowner_id: h.id, title, trade, due_date: date(body.due_date), source: "custom",
    });
    if (error) return NextResponse.json({ error: "Couldn't add it." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "add_suggestion") {
    const s = SUGGESTIONS.find((x) => x.key === body.key);
    if (!s) return NextResponse.json({ error: "Unknown suggestion." }, { status: 400 });
    await db.from("home_todos").insert({
      homeowner_id: h.id, title: s.title, trade: s.trade, due_date: dueDateFor(s), source: "seasonal",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_status") {
    const status = String(body.status ?? "");
    if (!["open", "hired", "done"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    await db
      .from("home_todos")
      .update({ status, done_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", String(body.id ?? ""))
      .eq("homeowner_id", h.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_due") {
    await db
      .from("home_todos")
      .update({ due_date: date(body.due_date), reminded_at: null })
      .eq("id", String(body.id ?? ""))
      .eq("homeowner_id", h.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_todo") {
    await db.from("home_todos").delete().eq("id", String(body.id ?? "")).eq("homeowner_id", h.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_zip") {
    const zip = String(body.zip ?? "");
    if (!/^[0-9]{5}$/.test(zip)) return NextResponse.json({ error: "Enter a 5-digit ZIP." }, { status: 400 });
    await db.from("homeowners").update({ zip }).eq("id", h.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_reminders") {
    const on = body.on === true;
    await db
      .from("homeowners")
      .update({ reminders: on, reminders_consent_at: on ? new Date().toISOString() : null })
      .eq("id", h.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
