import { NextResponse } from "next/server";
import {
  adminDb,
  requireAdmin,
  notifyProvider,
  notifyProviderApproved,
  notifyOperator,
  type LeadForEmail,
} from "../../../lib/server";
import { tradeOr } from "../../../lib/trades";
import { issueAccountLink, slugify } from "../../../lib/pros";

// A Response body can only be consumed once, so this must build a fresh
// object per request rather than share one module-level instance.
const denied = () => NextResponse.json({ error: "Not authorised." }, { status: 401 });

export async function GET(req: Request) {
  const who = await requireAdmin(req);
  if (!who) return denied();

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const [providers, leads, matches, performance, requests, claims] = await Promise.all([
    db
      .from("roofers")
      // Explicit columns: the setup-token hash never leaves the server.
      .select(
        "id, created_at, company, contact, email, phone, service_zips, radius_miles, services, status, notes, trade, approved_at, welcomed_at, welcome_error, slug, listed, auth_user_id, bio, website, setup_token_expires, leads_enabled, source, city, license_label, license_number, license_status, license_checked_at"
      )
      .order("created_at", { ascending: false }),
    db.from("leads").select("*").order("created_at", { ascending: false }).limit(300),
    db
      .from("lead_matches")
      .select("id, lead_id, roofer_id, distance_miles, notified_at, notify_error, roofers(company)")
      .order("created_at", { ascending: false })
      .limit(1000),
    db.from("roofer_performance").select("*").order("leads_received", { ascending: false }),
    db
      .from("service_requests")
      .select("*, roofers(company, contact, email, phone, trade)")
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("claims")
      .select("id, created_at, roofer_id, contact, email, phone, role, status, operator_notify_error, roofers(company, trade, city, status, license_number, website)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return NextResponse.json({
    who,
    providers: providers.data ?? [],
    leads: leads.data ?? [],
    matches: matches.data ?? [],
    performance: performance.data ?? [],
    requests: requests.data ?? [],
    claims: claims.data ?? [],
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

  if (action === "set_provider_status") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!id || !["pending", "approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { data: row, error } = await db
      .from("roofers")
      .update({ status, ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}) })
      .eq("id", id)
      .select("company, email, trade")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });

    // Best-effort welcome. A failed send must not make the approval look failed:
    // the provider is already approved and will still be matched.
    //
    // The outcome is now WRITTEN DOWN. It used to be returned here and then
    // thrown away, so afterwards nobody could tell whether a contractor had
    // ever been sent the contact rules they are expected to follow — and that
    // is the one email they get before they start phoning homeowners.
    let welcomed = false;
    const { data: access } = await db.from("roofers").select("leads_enabled").eq("id", id).maybeSingle();
    if (status === "approved" && row?.email && access?.leads_enabled !== false) {
      const out = await notifyProviderApproved(row.email, row.company, tradeOr(row.trade));
      welcomed = out.ok;
      await db
        .from("roofers")
        .update({
          welcomed_at: out.ok ? new Date().toISOString() : null,
          welcome_error: out.error ?? null,
          welcome_ids: out.ids ?? null,
        })
        .eq("id", id);
      if (!out.ok) {
        console.error(`[admin] WELCOME EMAIL FAILED provider=${id} error=${out.error}`);
      }
    }
    return NextResponse.json({ ok: true, welcomed });
  }

  // Re-send the welcome email, for a provider whose send failed or predates
  // this being recorded at all. Safe to run twice: it is the same message.
  if (action === "resend_welcome") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing provider." }, { status: 400 });

    const { data: row } = await db
      .from("roofers")
      .select("company, email, trade, status")
      .eq("id", id)
      .maybeSingle();
    if (!row?.email) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    if (row.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved providers get the welcome email." },
        { status: 400 }
      );
    }

    const out = await notifyProviderApproved(row.email, row.company, tradeOr(row.trade));
    await db
      .from("roofers")
      .update({
        welcomed_at: out.ok ? new Date().toISOString() : null,
        welcome_error: out.error ?? null,
        welcome_ids: out.ids ?? null,
      })
      .eq("id", id);
    if (!out.ok) {
      console.error(`[admin] WELCOME RESEND FAILED provider=${id} error=${out.error}`);
      return NextResponse.json({ error: `Could not send: ${out.error}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, welcomed: true, to: row.email });
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

  // Re-run matching for an existing lead, e.g. after approving a new provider.
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
        lead_id: string;
        distance_miles: number | null;
        roofers: { company: string; email: string } | null;
        leads: (LeadForEmail & { phone_consent?: boolean; trade?: string }) | null;
      };
      if (!r.roofers?.email || !r.leads) continue;
      const dist = r.distance_miles === null ? null : Number(r.distance_miles);

      // How many companies this lead went to in total, so the email can state
      // the real number rather than assume this retry is the only recipient.
      const { count } = await db
        .from("lead_matches")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", r.lead_id);

      const out = await notifyProvider(
        r.roofers.email,
        r.roofers.company,
        r.leads,
        tradeOr(r.leads.trade),
        dist,
        r.leads.phone_consent === true,
        Math.max(0, (count ?? 1) - 1)
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

    // Operator alerts are retried by the same button. A lead whose alert never
    // sent is a lead nobody knows about, which is strictly worse than a
    // contractor notification that failed, so it must not need its own trip.
    const { data: unalerted } = await db
      .from("leads")
      .select("*")
      .is("operator_notified_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    let alertsSent = 0;
    let alertsFailed = 0;
    for (const row of unalerted ?? []) {
      const l = row as LeadForEmail & {
        id: string;
        trade?: string;
        phone_consent?: boolean;
      };
      const { count } = await db
        .from("lead_matches")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", l.id);

      const out = await notifyOperator(
        l,
        tradeOr(l.trade),
        count ?? 0,
        l.id,
        l.phone_consent === true
      );
      await db
        .from("leads")
        .update(
          out.ok
            ? { operator_notified_at: new Date().toISOString(), operator_notify_error: null }
            : { operator_notify_error: out.error ?? "unknown" }
        )
        .eq("id", l.id);
      if (out.ok) alertsSent++; else alertsFailed++;
    }

    return NextResponse.json({ ok: true, sent, failed, alertsSent, alertsFailed });
  }

  // Show or hide a provider's public directory profile. Only approved
  // providers can be listed; a slug is assigned the first time.
  if (action === "set_listed") {
    const id = String(body.id ?? "");
    const listed = body.listed === true;
    const { data: row } = await db
      .from("roofers")
      .select("id, company, status, slug")
      .eq("id", id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    if (listed && row.status !== "approved" && row.status !== "unclaimed") {
      return NextResponse.json({ error: "Only approved or unclaimed companies can be listed." }, { status: 400 });
    }
    const update: Record<string, unknown> = { listed };
    if (listed && !row.slug) update.slug = await freeSlug(db, row.company, row.id);
    const { error } = await db.from("roofers").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Email a provider the link that sets up (or resets) their dashboard login.
  if (action === "invite_account") {
    const id = String(body.id ?? "");
    const { data: row } = await db.from("roofers").select("auth_user_id").eq("id", id).maybeSingle();
    const out = await issueAccountLink(id, row?.auth_user_id ? "reset" : "invite");
    if (!out.ok) return NextResponse.json({ error: `Could not send: ${out.error}` }, { status: 502 });
    return NextResponse.json({ ok: true, to: out.to });
  }

  if (action === "set_request_status") {
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!id || !["new", "contacted", "done"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { error } = await db.from("service_requests").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Hand an unclaimed listing to the person who claimed it, after the
  // operator has confirmed they work there. They get the page and the
  // dashboard; requests stay off until set_leads_enabled (i.e. they've paid).
  if (action === "approve_claim") {
    const id = String(body.id ?? "");
    const { data: claim } = await db
      .from("claims")
      .select("id, roofer_id, contact, email, phone, status")
      .eq("id", id)
      .maybeSingle();
    if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    if (claim.status !== "new") return NextResponse.json({ error: "Already decided." }, { status: 400 });

    const { data: row } = await db.from("roofers").select("status").eq("id", claim.roofer_id).maybeSingle();
    if (row?.status !== "unclaimed") {
      return NextResponse.json({ error: "That listing is no longer unclaimed." }, { status: 400 });
    }
    const { error } = await db
      .from("roofers")
      .update({
        status: "approved",
        leads_enabled: false,
        contact: claim.contact,
        email: claim.email,
        phone: claim.phone,
        approved_at: new Date().toISOString(),
      })
      .eq("id", claim.roofer_id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });

    await db.from("claims").update({ status: "approved" }).eq("id", claim.id);
    // Any other pending claims on the same company lose by definition.
    await db.from("claims").update({ status: "rejected" })
      .eq("roofer_id", claim.roofer_id).eq("status", "new");

    const out = await issueAccountLink(claim.roofer_id, "invite");
    if (!out.ok) {
      return NextResponse.json(
        { error: `Claim approved, but the dashboard link didn't send: ${out.error}. Use Invite to dashboard.` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, to: out.to });
  }

  if (action === "reject_claim") {
    const id = String(body.id ?? "");
    const { error } = await db.from("claims").update({ status: "rejected" }).eq("id", id).eq("status", "new");
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Paid lead access. Turning it on is the moment requests start, so it is
  // also when the contact rules must reach them: the welcome email is sent
  // if it never was.
  if (action === "set_leads_enabled") {
    const id = String(body.id ?? "");
    const enabled = body.enabled === true;
    const { data: row } = await db
      .from("roofers")
      .select("company, email, trade, status, welcomed_at")
      .eq("id", id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    if (enabled && row.status !== "approved") {
      return NextResponse.json({ error: "Only approved companies can receive requests." }, { status: 400 });
    }
    const { error } = await db.from("roofers").update({ leads_enabled: enabled }).eq("id", id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });

    if (enabled && !row.welcomed_at && row.email) {
      const out = await notifyProviderApproved(row.email, row.company, tradeOr(row.trade));
      await db
        .from("roofers")
        .update({
          welcomed_at: out.ok ? new Date().toISOString() : null,
          welcome_error: out.error ?? null,
          welcome_ids: out.ids ?? null,
        })
        .eq("id", id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** A slug for this company that no other provider has. */
async function freeSlug(
  db: NonNullable<ReturnType<typeof adminDb>>,
  company: string,
  id: string
): Promise<string> {
  const base = slugify(company) || "pro";
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const { data } = await db.from("roofers").select("id").eq("slug", candidate).maybeSingle();
    if (!data || data.id === id) return candidate;
  }
  return `${base}-${id.slice(0, 6)}`;
}
