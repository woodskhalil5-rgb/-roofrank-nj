import { NextResponse } from "next/server";
import { adminDb, notifyOperatorApplication } from "../../../lib/server";
import { TRADES, isTradeSlug } from "../../../lib/trades";

/** Pulls 5-digit ZIPs out of free text, de-duplicated, order preserved. */
function parseZips(input: string): string[] {
  const found = String(input).match(/\b[0-9]{5}\b/g) ?? [];
  return Array.from(new Set(found));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const required = ["company", "contact", "email", "phone", "areas", "services"];
    for (const key of required) {
      if (!String(body[key] ?? "").trim()) {
        return NextResponse.json({ error: `Missing required field: ${key}` }, { status: 400 });
      }
    }

    const tradeSlug: unknown = body.trade;
    if (!isTradeSlug(tradeSlug)) {
      return NextResponse.json({ error: "Please choose your trade." }, { status: 400 });
    }
    const trade = TRADES[tradeSlug];

    const email = String(body.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid business email address." }, { status: 400 });
    }

    const zips = parseZips(body.areas);
    if (zips.length === 0) {
      return NextResponse.json(
        { error: "Please include at least one 5-digit New Jersey ZIP code you serve." },
        { status: 400 }
      );
    }

    const radius = Number(body.radius_miles ?? 25);
    if (!Number.isFinite(radius) || radius < 1 || radius > 100) {
      return NextResponse.json({ error: "Choose a service radius between 1 and 100 miles." }, { status: 400 });
    }

    const db = adminDb();
    if (!db) {
      return NextResponse.json(
        { error: "Applications aren't being accepted just yet. Please try again shortly." },
        { status: 503 }
      );
    }

    // Keep only ZIPs we can actually place on a map, otherwise matching
    // would silently never fire for this provider.
    const { data: known } = await db.from("nj_zips").select("zip").in("zip", zips);
    const validZips = (known ?? []).map((r: { zip: string }) => r.zip);
    if (validZips.length === 0) {
      return NextResponse.json(
        { error: "We didn't recognise those as New Jersey ZIP codes. Please check and try again." },
        { status: 400 }
      );
    }
    const rejected = zips.filter((z) => !validZips.includes(z));

    const company = String(body.company).trim();
    const contact = String(body.contact).trim();
    const phone = String(body.phone).trim();
    const services = String(body.services).trim();
    const radiusMiles = Math.round(radius);

    const { data: inserted, error } = await db
      .from("roofers")
      .insert({
        company,
        contact,
        email,
        phone,
        trade: trade.slug,
        service_zips: validZips,
        radius_miles: radiusMiles,
        services,
        status: "pending",
        notes: rejected.length ? `Unrecognised ZIPs submitted: ${rejected.join(", ")}` : "",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error(
        `[providers] INSERT FAILED trade=${trade.slug} error=${error?.message ?? "no row returned"}`
      );
      return NextResponse.json({ error: "We couldn't save your application. Please try again." }, { status: 500 });
    }

    // Applications used to arrive silently too. Supply is the constraint on
    // this business, so an application nobody sees for days is expensive.
    // Best-effort: the application is already saved.
    try {
      const alert = await notifyOperatorApplication(
        company,
        contact,
        email,
        phone,
        trade,
        validZips.length,
        radiusMiles,
        services
      );
      if (!alert.ok) {
        console.error(`[providers] OPERATOR ALERT FAILED id=${inserted.id} error=${alert.error}`);
      }
      await db
        .from("roofers")
        .update(
          alert.ok
            ? { operator_notified_at: new Date().toISOString(), operator_notify_error: null }
            : { operator_notify_error: alert.error ?? "unknown" }
        )
        .eq("id", inserted.id);
    } catch (err) {
      console.error(
        `[providers] operator alert threw id=${inserted.id} error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    return NextResponse.json({ ok: true, accepted_zips: validZips.length, ignored_zips: rejected });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
