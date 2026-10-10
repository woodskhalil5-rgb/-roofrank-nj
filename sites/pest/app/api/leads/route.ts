import { NextResponse } from "next/server";
import { adminDb, notifyRoofer, type LeadForEmail } from "../../../lib/server";
import { SITE } from "../../../lib/site";
import { CONSENT_VERSION, SHARING_CONSENT_TEXT, PHONE_CONSENT_TEXT, TERMS_ACK } from "../../../lib/consent";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const required = ["name", "phone", "email", "zip", "property_type", "service", "timing"];
    for (const key of required) {
      if (!String(body[key] ?? "").trim()) {
        return NextResponse.json({ error: `Missing required field: ${key}` }, { status: 400 });
      }
    }
    if (!/^[0-9]{5}$/.test(String(body.zip))) {
      return NextResponse.json({ error: "Enter a valid 5-digit ZIP code." }, { status: 400 });
    }

    // Sharing consent is required: it IS the service. Phone/text consent is separate
    // and optional, because TCPA forbids making it a condition of the service.
    if (body.consent !== "yes") {
      return NextResponse.json(
        { error: `Please agree to have your request shared with ${SITE.companies}.` },
        { status: 400 }
      );
    }
    const phoneConsent = body.phone_consent === "yes";

    const db = adminDb();
    if (!db) {
      return NextResponse.json(
        { error: "The lead form is built, but the database is not connected yet. Please try again shortly." },
        { status: 503 }
      );
    }

    // Only serve New Jersey. Keeps the service honest about its name, and keeps
    // out-of-state privacy regimes out of scope.
    const zip = String(body.zip);
    const { data: zipRow } = await db.from("nj_zips").select("zip").eq("zip", zip).maybeSingle();
    if (!zipRow) {
      return NextResponse.json(
        { error: `${SITE.brand} currently serves New Jersey only. That ZIP code isn't in our service area.` },
        { status: 400 }
      );
    }

    const lead: LeadForEmail = {
      name: String(body.name).trim(),
      phone: String(body.phone).trim(),
      email: String(body.email).trim(),
      zip,
      property_type: String(body.property_type),
      service: String(body.service),
      timing: String(body.timing),
      details: String(body.details ?? "").trim(),
    };

    const forwarded = req.headers.get("x-forwarded-for") ?? "";
    const shown = `${SHARING_CONSENT_TEXT} ${TERMS_ACK}`;
    const consentText = phoneConsent ? `${shown}\n\n${PHONE_CONSENT_TEXT}` : shown;

    const { data: inserted, error } = await db
      .from("leads")
      .insert({
        ...lead,
        consent: true,
        phone_consent: phoneConsent,
        consent_text: consentText,
        consent_version: CONSENT_VERSION,
        consent_ip: forwarded.split(",")[0].trim().slice(0, 120),
        consent_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400),
        consent_at: new Date().toISOString(),
        status: "new",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: "We couldn't save your request. Please try again." }, { status: 500 });
    }

    // The homeowner is already safely saved. Everything below is best-effort:
    // a matching or email failure must never surface as a submission failure.
    let matched = 0;
    try {
      const { data: count } = await db.rpc("match_lead", { p_lead_id: inserted.id });
      matched = typeof count === "number" ? count : 0;

      if (matched > 0) {
        const { data: rows } = await db
          .from("lead_matches")
          .select("id, distance_miles, roofers(company, email)")
          .eq("lead_id", inserted.id)
          .is("notified_at", null);

        for (const row of rows ?? []) {
          const roofer = (row as unknown as { roofers: { company: string; email: string } | null }).roofers;
          if (!roofer?.email) continue;
          const dist = row.distance_miles === null ? null : Number(row.distance_miles);
          const sent = await notifyRoofer(roofer.email, roofer.company, lead, dist, phoneConsent);
          await db
            .from("lead_matches")
            .update(
              sent.ok
                ? { notified_at: new Date().toISOString(), notify_error: null }
                : { notify_error: sent.error ?? "unknown" }
            )
            .eq("id", row.id);
        }
      }
    } catch {
      // Swallowed deliberately: the lead is saved and visible in the admin dashboard,
      // where unnotified matches can be retried.
    }

    return NextResponse.json({ ok: true, matched });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
