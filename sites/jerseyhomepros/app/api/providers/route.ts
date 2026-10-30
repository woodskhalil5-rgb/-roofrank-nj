import { NextResponse } from "next/server";
import { cleanAttribution } from "../../../lib/attribution";
import { adminDb, notifyOperatorApplication } from "../../../lib/server";
import { TRADES, isTradeSlug } from "../../../lib/trades";
import { newSetupToken } from "../../../lib/pros";

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

    // The service must belong to the trade being applied for. The form only
    // ever offers the right list, but whatever arrives here was previously
    // stored verbatim — which is how a moving company ended up on record as
    // offering "Multiple roofing services". A stale tab, a restored form on
    // the back button, or a direct POST all produce that mismatch, and the
    // wrong value then follows the contractor into the admin dashboard.
    const services = String(body.services ?? "").trim();
    if (!(trade.providerServices as readonly string[]).includes(services)) {
      return NextResponse.json(
        { error: `Choose a ${trade.label.toLowerCase()} service from the list.` },
        { status: 400 }
      );
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
    // `services` is declared above, where it is validated against the trade.
    const radiusMiles = Math.round(radius);
    // Optional at sign-up; a pro is only "Verified" after JHP checks it.
    const hic = String(body.hic_number ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
    // One-time token so they can attach an insurance certificate right after.
    const doc = newSetupToken();

    const { data: inserted, error } = await db
      .from("roofers")
      .insert({
        attribution: cleanAttribution(body.attribution),
        company,
        contact,
        email,
        phone,
        trade: trade.slug,
        service_zips: validZips,
        radius_miles: radiusMiles,
        services,
        status: "pending",
        license_number: hic,
        license_label: hic ? "NJ Home Improvement Contractor" : "",
        doc_token_hash: doc.hash,
        doc_token_expires: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
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
      // Written unconditionally, so a partial failure is recorded rather than
      // rounded up to success. See the matching comment in /api/leads.
      await db
        .from("roofers")
        .update({
          operator_notified_at: alert.ok ? new Date().toISOString() : null,
          operator_notify_error: alert.error ?? null,
          operator_notify_ids: alert.ids ?? null,
        })
        .eq("id", inserted.id);
    } catch (err) {
      console.error(
        `[providers] operator alert threw id=${inserted.id} error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    return NextResponse.json({ ok: true, accepted_zips: validZips.length, ignored_zips: rejected, doc_token: doc.token });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
