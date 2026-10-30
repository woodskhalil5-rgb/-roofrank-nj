import { NextResponse } from "next/server";
import { stripeOn, stripeTestMode } from "../../../lib/stripe";
import { accrueLeadCharges, billPendingLeads } from "../../../lib/billing";
import { isTradeSlug } from "../../../lib/trades";
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
import { DOCS_BUCKET } from "../../../lib/prodocs";

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
        "id, created_at, company, contact, email, phone, service_zips, radius_miles, services, status, notes, trade, approved_at, welcomed_at, welcome_error, slug, listed, auth_user_id, bio, website, setup_token_expires, leads_enabled, source, city, license_label, license_number, license_status, license_checked_at, insurance_path, insurance_uploaded_at, verified_at, verified_method, attribution, billing_plan, billing_started_at, card_on_file_at, card_brand, card_last4"
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

  // Insurance documents are private: short-lived signed links only.
  const docPaths = (providers.data ?? []).map((p: { insurance_path?: string }) => p.insurance_path).filter(Boolean) as string[];
  const docUrls = new Map<string, string>();
  if (docPaths.length) {
    const { data } = await db.storage.from(DOCS_BUCKET).createSignedUrls(docPaths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) docUrls.set(d.path, d.signedUrl);
  }
  const [prices, bset, charges] = await Promise.all([
    db.from("lead_prices").select("trade, price_cents"),
    db.from("estimator_settings").select("free_leads").eq("id", 1).maybeSingle(),
    db.from("charges").select("id, created_at, kind, amount_cents, description, status, credit_reason, hosted_invoice_url, paid_at, roofer_id, roofers(company)")
      .order("created_at", { ascending: false }).limit(300),
  ]);
  return NextResponse.json({
    billing: {
      on: stripeOn(), test: stripeTestMode(),
      prices: prices.data ?? [], free_leads: bset.data?.free_leads ?? 3, charges: charges.data ?? [],
    },
    who,
    providers: (providers.data ?? []).map((p: { insurance_path?: string }) => ({ ...p, insurance_url: p.insurance_path ? docUrls.get(p.insurance_path) ?? null : null })),
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

  // Verified badge. Only after Khalil has checked an HIC registration or an
  // insurance certificate (or vouches in person); the method is recorded.
  if (action === "set_billing_plan") {
    const id = String(body.id ?? "");
    const plan = String(body.plan ?? "");
    if (!["none", "ppl", "partner"].includes(plan)) return NextResponse.json({ error: "Pick a plan." }, { status: 400 });
    const { data: p } = await db.from("roofers").select("trade, billing_plan").eq("id", id).single();
    if (!p) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (plan === "ppl") {
      const { data: price } = await db.from("lead_prices").select("price_cents").eq("trade", p.trade).maybeSingle();
      if (!price) return NextResponse.json({ error: "Set a lead price for this trade first (Billing tab)." }, { status: 400 });
    }
    // Only leads delivered AFTER switching to pay-per-lead are ever billed.
    const update: Record<string, unknown> = { billing_plan: plan };
    if (plan === "ppl" && p.billing_plan !== "ppl") update.billing_started_at = new Date().toISOString();
    if (plan !== "ppl") update.billing_started_at = null;
    const { error } = await db.from("roofers").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_lead_price") {
    const trade = String(body.trade ?? "");
    if (!isTradeSlug(trade)) return NextResponse.json({ error: "Unknown trade." }, { status: 400 });
    if (body.dollars === null || body.dollars === "") {
      const { count } = await db.from("roofers").select("id", { count: "exact", head: true }).eq("trade", trade).eq("billing_plan", "ppl");
      if ((count ?? 0) > 0) return NextResponse.json({ error: "Move this trade's pay-per-lead companies off the plan first." }, { status: 400 });
      await db.from("lead_prices").delete().eq("trade", trade);
      return NextResponse.json({ ok: true });
    }
    const cents = Math.round(Number(body.dollars) * 100);
    if (!Number.isFinite(cents) || cents < 0 || cents > 100000) return NextResponse.json({ error: "Enter a price between $0 and $1,000." }, { status: 400 });
    const { error } = await db.from("lead_prices").upsert({ trade, price_cents: cents, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: "Save failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_free_leads") {
    const n = Number(body.n);
    if (!Number.isInteger(n) || n < 0 || n > 50) return NextResponse.json({ error: "Enter 0–50." }, { status: 400 });
    const { error } = await db.from("estimator_settings").update({ free_leads: n }).eq("id", 1);
    if (error) return NextResponse.json({ error: "Save failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "credit_charge") {
    const id = String(body.id ?? "");
    const reason = String(body.reason ?? "").trim().slice(0, 200) || "Bad lead";
    // Only charges not yet on an invoice; invoiced ones are refunded in Stripe.
    const { data, error } = await db.from("charges").update({ status: "credited", credit_reason: reason, updated_at: new Date().toISOString() })
      .eq("id", id).in("status", ["pending", "free"]).select("id");
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "Already invoiced: refund it in Stripe instead." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (action === "bill_now") {
    if (!stripeOn()) return NextResponse.json({ error: "Stripe isn't connected yet." }, { status: 503 });
    const id = String(body.id ?? "");
    await accrueLeadCharges(db);
    const out = await billPendingLeads(db, id || undefined);
    if (out.errors.length) return NextResponse.json({ error: out.errors.join("; ") }, { status: 502 });
    return NextResponse.json({ ok: true, invoices: out.invoices });
  }

  if (action === "set_verified") {
    const id = String(body.id ?? "");
    const on = body.verified === true;
    const method = String(body.method ?? "").trim().slice(0, 200);
    if (on && !method) return NextResponse.json({ error: "Say what you checked." }, { status: 400 });
    const { error } = await db.from("roofers")
      .update(on ? { verified_at: new Date().toISOString(), verified_method: method } : { verified_at: null, verified_method: "" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
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
