import { NextResponse } from "next/server";
import { cleanAttribution } from "../../../lib/attribution";
import { addRequestItem, currentHomeowner } from "../../../lib/homeowner";
import {
  adminDb,
  notifyProvider,
  notifyOperator,
  type LeadForEmail,
} from "../../../lib/server";
import { SITE } from "../../../lib/site";
import { TRADES, isTradeSlug, type Trade } from "../../../lib/trades";
import { CONSENT_VERSION, sharingConsentText, phoneConsentText, TERMS_ACK } from "../../../lib/consent";

/**
 * How many requests one IP may submit per hour before being turned away.
 * Deliberately generous: a household behind one NAT address, or a homeowner
 * who legitimately needs a roofer and a mover in the same sitting, must not
 * be blocked. It only has to stop a script.
 */
const RATE_LIMIT_PER_HOUR = 6;

/**
 * A repeat of the same email and trade inside this window is treated as the
 * same request, not a second one. Double-clicking submit, or a flaky mobile
 * connection retrying the POST, previously produced two leads and two
 * contractor emails for one homeowner.
 */
const DEDUPE_WINDOW_MINUTES = 15;

/** `%` and `_` are wildcards to ILIKE, so they are escaped before matching. */
function escapeLike(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

/** What the homeowner is told, which must match what the software will do. */
function confirmation(matched: number, trade: Trade): string {
  if (matched > 0) {
    return `Request received. We've sent it to ${matched} participating ${
      matched === 1 ? trade.company : trade.companies
    } serving your area, who will contact you directly.`;
  }
  // No promise of a timeline, because nothing enforces one. The operator
  // alert is what makes even this much true.
  return `Request received. We don't currently have a participating ${trade.company} signed up for your ZIP code, so ${SITE.brand} will review your request and follow up by email.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // `phone` is deliberately absent. It is required only when the homeowner
    // ticks the calls-and-texts box, which is checked below once the trade is
    // known. Demanding a number we are then forbidden to dial was the single
    // highest-friction field on the form.
    const required = ["name", "email", "zip", "property_type", "service", "timing"];
    for (const key of required) {
      if (!String(body[key] ?? "").trim()) {
        return NextResponse.json({ error: `Missing required field: ${key}` }, { status: 400 });
      }
    }
    if (!/^[0-9]{5}$/.test(String(body.zip))) {
      return NextResponse.json({ error: "Enter a valid 5-digit ZIP code." }, { status: 400 });
    }
    // body is `any` from req.json(), and TypeScript cannot narrow a property of
    // an `any` through a type guard, so the slug is bound to a typed local first.
    const tradeSlug: unknown = body.trade;
    if (!isTradeSlug(tradeSlug)) {
      return NextResponse.json({ error: "Please choose what kind of help you need." }, { status: 400 });
    }
    const trade = TRADES[tradeSlug];

    const email = String(body.email).trim();
    // The form's type="email" is client-side only and a direct POST bypasses it.
    // An unparseable address means the homeowner can never be reached.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    // Sharing consent is required: it IS the service. Phone/text consent is separate
    // and optional, because TCPA forbids making it a condition of the service.
    if (body.consent !== "yes") {
      return NextResponse.json(
        { error: `Please agree to have your request shared with ${trade.companies}.` },
        { status: 400 }
      );
    }
    const phoneConsent = body.phone_consent === "yes";

    // Phone is optional, and only meaningful if someone is allowed to dial it.
    // Consenting to calls without leaving a number would produce a lead the
    // contractor is told they may ring and has no way to.
    const phone = String(body.phone ?? "").trim();
    if (phoneConsent && !phone) {
      return NextResponse.json(
        { error: "Add a phone number, or untick the calls and texts box to be contacted by email only." },
        { status: 400 }
      );
    }
    // Enough digits to dial, checked only when a number was actually given.
    // Formatting is left alone so the contractor sees what the homeowner typed.
    if (phone && (phone.match(/[0-9]/g) ?? []).length < 10) {
      return NextResponse.json({ error: "Enter a valid phone number including area code." }, { status: 400 });
    }

    const db = adminDb();
    if (!db) {
      console.error("[leads] database not connected: missing Supabase env vars");
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

    const forwarded = req.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0].trim().slice(0, 120);

    // Rate limit before writing anything. Skipped when the IP is unknown,
    // since every such caller would otherwise share one bucket.
    if (ip) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: rateErr } = await db
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("consent_ip", ip)
        .gte("created_at", since);
      if (rateErr) {
        // Fail open: a broken counter must not block a real homeowner.
        console.error("[leads] rate-limit check failed, allowing request:", rateErr.message);
      } else if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
        console.warn(`[leads] rate limited ip=${ip} count=${count}`);
        return NextResponse.json(
          { error: "You've sent several requests recently. Please try again later, or email us if something went wrong." },
          { status: 429 }
        );
      }
    }

    // Treat an immediate repeat as the same request. Returns the original
    // outcome so the homeowner sees a success, not a confusing error.
    const dedupeSince = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data: dupe } = await db
      .from("leads")
      .select("id")
      .ilike("email", escapeLike(email))
      .eq("trade", trade.slug)
      .gte("created_at", dedupeSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dupe) {
      const { count: matchCount } = await db
        .from("lead_matches")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", dupe.id);
      const matched = matchCount ?? 0;
      console.log(`[leads] duplicate suppressed lead_id=${dupe.id} trade=${trade.slug}`);
      return NextResponse.json({
        ok: true,
        duplicate: true,
        matched,
        message: confirmation(matched, trade),
      });
    }

    const lead: LeadForEmail = {
      name: String(body.name).trim().slice(0, 200),
      // Empty string rather than null: every consumer of LeadForEmail treats
      // phone as a string, and the email builders omit the line when it is blank.
      phone: phone.slice(0, 40),
      email,
      zip,
      property_type: String(body.property_type).slice(0, 80),
      service: String(body.service).slice(0, 120),
      timing: String(body.timing).slice(0, 80),
      details: String(body.details ?? "").trim().slice(0, 4000),
    };

    // The directory profile the homeowner started from, if any. Attribution
    // only: it is recorded on the lead and changes nothing about matching, so
    // the request still reaches only companies that serve this ZIP.
    let requested: { id: string; company: string; status: string; leads_enabled: boolean } | null = null;
    const proSlug = String(body.pro ?? "");
    if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(proSlug)) {
      const { data: proRow } = await db
        .from("roofers")
        .select("id, company, status, leads_enabled")
        .eq("slug", proSlug)
        .eq("trade", trade.slug)
        .in("status", ["approved", "unclaimed"])
        .eq("listed", true)
        .maybeSingle();
      requested = (proRow as { id: string; company: string; status: string; leads_enabled: boolean } | null) ?? null;
    }

    // Signed in to a Home Board with the same address = the email is verified
    // (the sign-in link proved they control it). Only then is it marked so.
    const homeowner = await currentHomeowner(req);
    const emailVerified = Boolean(homeowner && homeowner.email === email.trim().toLowerCase());

    const shown = `${sharingConsentText(trade)} ${TERMS_ACK}`;
    const consentText = phoneConsent ? `${shown}\n\n${phoneConsentText(trade)}` : shown;

    const { data: inserted, error } = await db
      .from("leads")
      .insert({
        ...lead,
        trade: trade.slug,
        attribution: cleanAttribution(body.attribution),
        consent: true,
        phone_consent: phoneConsent,
        consent_text: consentText,
        consent_version: CONSENT_VERSION,
        consent_ip: ip,
        consent_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400),
        consent_at: new Date().toISOString(),
        status: "new",
        requested_roofer_id: requested?.id ?? null,
        homeowner_id: emailVerified && homeowner ? homeowner.id : null,
        email_verified: emailVerified,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      // Logged rather than swallowed: this is the one failure the homeowner
      // is told about, so it has to be diagnosable afterwards.
      console.error(
        `[leads] INSERT FAILED trade=${trade.slug} zip=${zip} error=${error?.message ?? "no row returned"}`
      );
      return NextResponse.json({ error: "We couldn't save your request. Please try again." }, { status: 500 });
    }

    const leadId = inserted.id as string;
    if (emailVerified && homeowner) {
      try { await addRequestItem(homeowner.id, leadId, trade.slug); } catch { /* board item is best-effort */ }
    }

    // The homeowner is already safely saved. Everything below is best-effort:
    // a matching or email failure must never surface as a submission failure.
    let matched = 0;
    try {
      const { data: count, error: matchErr } = await db.rpc("match_lead", { p_lead_id: leadId });
      if (matchErr) {
        console.error(`[leads] match_lead failed lead_id=${leadId} error=${matchErr.message}`);
      }
      matched = typeof count === "number" ? count : 0;

      if (matched > 0) {
        const { data: rows } = await db
          .from("lead_matches")
          .select("id, distance_miles, roofers(company, email)")
          .eq("lead_id", leadId)
          .is("notified_at", null);

        for (const row of rows ?? []) {
          const provider = (row as unknown as { roofers: { company: string; email: string } | null }).roofers;
          if (!provider?.email) continue;
          const dist = row.distance_miles === null ? null : Number(row.distance_miles);
          // `matched` counts every company this lead went to, including this one.
          const sent = await notifyProvider(
            provider.email,
            provider.company,
            lead,
            trade,
            dist,
            phoneConsent,
            Math.max(0, matched - 1),
            emailVerified
          );
          if (!sent.ok) {
            console.error(
              `[leads] provider notify failed lead_id=${leadId} match_id=${row.id} error=${sent.error}`
            );
          }
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
    } catch (err) {
      console.error(
        `[leads] matching/notification threw lead_id=${leadId} error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    // The operator is told about every lead, matched or not. This is the step
    // whose absence meant an unmatched lead reached nobody at all, and it runs
    // last so a mail failure cannot cost us the saved record.
    try {
      const alert = await notifyOperator(lead, trade, matched, leadId, phoneConsent);
      if (!alert.ok) {
        console.error(`[leads] OPERATOR ALERT FAILED lead_id=${leadId} error=${alert.error}`);
      }
      // Both fields are written every time. The old code wrote one or the
      // other, so an alert that reached one address and bounced off another
      // recorded a clean success and the bounce vanished. The message ids are
      // what /api/health/alerts uses to ask Resend whether these were actually
      // delivered — operator_notified_at only means Resend accepted them.
      await db
        .from("leads")
        .update({
          operator_notified_at: alert.ok ? new Date().toISOString() : null,
          operator_notify_error: alert.error ?? null,
          operator_notify_ids: alert.ids ?? null,
        })
        .eq("id", leadId);
    } catch (err) {
      console.error(
        `[leads] operator alert threw lead_id=${leadId} error=${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    if (matched === 0) {
      // Worth its own line in the logs: it means supply, not the funnel, is
      // what is losing this lead.
      console.warn(`[leads] UNMATCHED lead_id=${leadId} trade=${trade.slug} zip=${zip}`);
    }

    // A homeowner who chose a company from its profile is told plainly when
    // that company does not cover their ZIP, rather than left to assume it
    // received the request.
    let message = confirmation(matched, trade);
    if (requested) {
      const { count: reachedChosen } = await db
        .from("lead_matches")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId)
        .eq("roofer_id", requested.id);
      if (requested.status !== "approved" || !requested.leads_enabled) {
        message = `${requested.company} isn't taking requests through ${SITE.brand}, so your request did not go to them. ${message}`;
      } else if ((reachedChosen ?? 0) === 0) {
        message = `${requested.company} isn't taking requests for ZIP ${zip} through ${SITE.brand} right now, so your request did not go to them. ${message}`;
      }
    }

    return NextResponse.json({
      ok: true,
      matched,
      lead_id: leadId,
      message,
    });
  } catch (err) {
    console.error(`[leads] unhandled error=${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
