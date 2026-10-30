import { NextResponse } from "next/server";
import { adminDb, notifyOperatorServiceRequest } from "../../../lib/server";
import { requireContractor, safeWebsite, slugify, photoUrl, MAX_GALLERY } from "../../../lib/pros";
import { tradeOr } from "../../../lib/trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const denied = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

const MARKETING_ITEMS = [
  "Website",
  "Google Business Profile",
  "Google Ads",
  "Facebook / Instagram ads",
  "Review requests",
  "Something else",
] as const;

const LEAD_ITEMS = [
  "Start receiving requests",
  "More ZIP codes",
  "A wider radius",
  "Another trade",
  "Just more volume",
] as const;

type EventRow = { created_at: string; kind: string };

/** Month key in New Jersey time, e.g. "2026-10". */
function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
}

export async function GET(req: Request) {
  const me = await requireContractor(req);
  if (!me) return denied();
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);

  const [events, matches, requests, demand] = await Promise.all([
    db
      .from("profile_events")
      .select("created_at, kind")
      .eq("roofer_id", me.id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50000),
    db
      .from("lead_matches")
      .select(
        "created_at, distance_miles, leads(id, created_at, name, phone, email, zip, property_type, service, timing, details, phone_consent, status, requested_roofer_id)"
      )
      .eq("roofer_id", me.id)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("service_requests")
      .select("id, created_at, kind, items, details, status")
      .eq("roofer_id", me.id)
      .order("created_at", { ascending: false })
      .limit(20),
    db.rpc("area_demand", { p_roofer_id: me.id, p_days: 30 }),
  ]);

  type LeadRow = {
    id: string; created_at: string; name: string; phone: string; email: string; zip: string;
    property_type: string; service: string; timing: string; details: string;
    phone_consent: boolean; status: string; requested_roofer_id: string | null;
  };
  // Spam is excluded so a junk submission never shows up as a lead they got.
  const leads = ((matches.data ?? []) as unknown as { created_at: string; distance_miles: number | null; leads: LeadRow | null }[])
    .filter((m) => m.leads && m.leads.status !== "spam")
    .map((m) => ({
      ...(m.leads as LeadRow),
      matched_at: m.created_at,
      distance_miles: m.distance_miles === null ? null : Number(m.distance_miles),
      from_profile: m.leads?.requested_roofer_id === me.id,
    }));

  // Six calendar months, newest first, with zeros where nothing happened.
  const months: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < 6; i++) {
    months.push(cursor.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7));
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - 1);
  }
  const blank = () => ({ views: 0, request_clicks: 0, website_clicks: 0, leads: 0 });
  const byMonth = new Map(months.map((m) => [m, blank()]));
  for (const e of (events.data ?? []) as EventRow[]) {
    const b = byMonth.get(monthKey(e.created_at));
    if (!b) continue;
    if (e.kind === "view") b.views++;
    else if (e.kind === "request_click") b.request_clicks++;
    else if (e.kind === "website_click") b.website_clicks++;
  }
  for (const l of leads) {
    const b = byMonth.get(monthKey(l.matched_at));
    if (b) b.leads++;
  }

  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30 = blank();
  for (const e of (events.data ?? []) as EventRow[]) {
    if (new Date(e.created_at).getTime() < cutoff30) continue;
    if (e.kind === "view") last30.views++;
    else if (e.kind === "request_click") last30.request_clicks++;
    else if (e.kind === "website_click") last30.website_clicks++;
  }
  last30.leads = leads.filter((l) => new Date(l.matched_at).getTime() >= cutoff30).length;

  return NextResponse.json({
    me: {
      company: me.company,
      contact: me.contact,
      email: me.email,
      trade: me.trade,
      status: me.status,
      slug: me.slug,
      listed: me.listed,
      bio: me.bio,
      website: me.website,
      services: me.services,
      service_zips: me.service_zips,
      radius_miles: me.radius_miles,
      leads_enabled: me.leads_enabled,
      year_founded: me.year_founded,
      hours: me.hours,
      towns: me.towns,
      service_list: me.service_list,
      highlights: me.highlights,
      logo: me.logo_path ? { path: me.logo_path, url: photoUrl(me.logo_path) } : null,
      gallery: me.gallery_paths.map((p) => ({ path: p, url: photoUrl(p) })),
      hic_number: me.license_number,
      insurance_uploaded_at: me.insurance_uploaded_at,
      verified_at: me.verified_at,
    },
    serviceOptions: tradeOr(me.trade).providerServices,
    maxGallery: MAX_GALLERY,
    // Real requests in their trade and area, last 30 days — the ones they
    // would have been eligible for. A count from the database, never an estimate.
    areaDemand30: typeof demand.data === "number" ? demand.data : 0,
    last30,
    months: months.map((m) => ({ month: m, ...byMonth.get(m)! })),
    leads: leads.slice(0, 50),
    totalLeads: leads.length,
    requests: requests.data ?? [],
    marketingItems: MARKETING_ITEMS,
    leadItems: LEAD_ITEMS,
  });
}

export async function POST(req: Request) {
  const me = await requireContractor(req);
  if (!me) return denied();
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action ?? "");

  if (action === "update_profile") {
    const bio = String(body.bio ?? "").trim().slice(0, 1500);
    const rawSite = String(body.website ?? "").trim();
    const website = rawSite ? safeWebsite(rawSite) : "";
    if (website === null) {
      return NextResponse.json({ error: "That website address doesn't look right." }, { status: 400 });
    }
    const listed = body.listed === true;

    // Everything below is the company's own description of itself. The
    // profile labels it as such; none of it is checked by us.
    const rawYear = String(body.year_founded ?? "").trim();
    const year = rawYear ? Number(rawYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1850 || year > new Date().getFullYear())) {
      return NextResponse.json({ error: "Enter the year the business started, like 2012." }, { status: 400 });
    }
    const allowed: readonly string[] = tradeOr(me.trade).providerServices;
    const service_list = (Array.isArray(body.service_list) ? body.service_list : [])
      .map((x) => String(x))
      .filter((x) => allowed.includes(x));
    const highlights = (Array.isArray(body.highlights) ? body.highlights : [])
      .map((x) => String(x).trim().slice(0, 70))
      .filter(Boolean)
      .slice(0, 4);
    const update: Record<string, unknown> = {
      bio, website, listed,
      year_founded: year,
      hours: String(body.hours ?? "").trim().slice(0, 200),
      towns: String(body.towns ?? "").trim().slice(0, 400),
      service_list,
      highlights,
    };
    // A profile needs an address before it can be shown.
    if (listed && !me.slug) update.slug = `${slugify(me.company) || "pro"}-${me.id.slice(0, 6)}`;
    const { error } = await db.from("roofers").update(update).eq("id", me.id);
    if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "service_request") {
    const kind = String(body.kind ?? "");
    if (kind !== "more_leads" && kind !== "marketing") {
      return NextResponse.json({ error: "Choose what you're asking for." }, { status: 400 });
    }
    const allowed: readonly string[] = kind === "marketing" ? MARKETING_ITEMS : LEAD_ITEMS;
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((i) => String(i))
      .filter((i) => allowed.includes(i));
    const details = String(body.details ?? "").trim().slice(0, 2000);
    if (items.length === 0 && !details) {
      return NextResponse.json({ error: "Pick at least one option or add a note." }, { status: 400 });
    }

    // One open request of each kind per day is plenty; this stops a stuck
    // button from flooding the operator's inbox.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("roofer_id", me.id)
      .eq("kind", kind)
      .gte("created_at", dayAgo);
    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: "We've got your recent requests. We'll be in touch — no need to send another." },
        { status: 429 }
      );
    }

    const { data: inserted, error } = await db
      .from("service_requests")
      .insert({ roofer_id: me.id, kind, items, details })
      .select("id")
      .single();
    if (error || !inserted) {
      return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 500 });
    }

    const { data: full } = await db.from("roofers").select("phone").eq("id", me.id).maybeSingle();
    const out = await notifyOperatorServiceRequest(
      me.company, me.contact, me.email, String(full?.phone ?? ""), tradeOr(me.trade), kind, items, details
    );
    await db
      .from("service_requests")
      .update({
        operator_notified_at: out.ok ? new Date().toISOString() : null,
        operator_notify_error: out.error ?? null,
      })
      .eq("id", inserted.id);
    if (!out.ok) console.error(`[account] service request alert failed id=${inserted.id} error=${out.error}`);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
