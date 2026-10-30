import { adminDb, alertEmails, sendEmail } from "./server";
import { SITE } from "./site";
import { tradeOr } from "./trades";
import { stripe, stripeOn, dollars, type SCustomer, type SInvoice, type SCheckoutSession, type SPaymentMethod } from "./stripe";

/**
 * Contractor billing on Stripe Invoicing (plan from Stripe's planner, Oct 30):
 *  - Card on file: Checkout in setup mode (no charge), default payment method
 *    set on the Customer by the webhook.
 *  - Pay-per-lead (billing_plan 'ppl'): every delivered lead after
 *    billing_started_at becomes a `charges` row; the first `free_leads` are
 *    free; the rest are rolled into ONE invoice per contractor on the 1st of
 *    the month (or "Bill now" in admin). auto_advance + saved card = Stripe
 *    charges it; no card = Stripe-hosted pay page, link emailed by us.
 *  - Partner fee (10% of signed price): one invoice per job when Khalil hits
 *    "Bill fee" in the Estimator after the contractor says PAID IN FULL.
 *  - Webhooks (/api/webhooks/stripe) are the only thing that marks money paid.
 * Nothing is charged unless the contractor is switched to 'ppl' AND their
 * trade has a lead price, so turning Stripe on changes nothing by itself.
 */

type DB = NonNullable<ReturnType<typeof adminDb>>;
export type BillPro = {
  id: string; company: string; contact: string | null; email: string; trade: string;
  billing_plan: "none" | "ppl" | "partner"; billing_started_at: string | null;
  stripe_customer_id: string | null; card_on_file_at: string | null; card_brand: string | null; card_last4: string | null;
};
export const BILL_COLS = "id, company, contact, email, trade, billing_plan, billing_started_at, stripe_customer_id, card_on_file_at, card_brand, card_last4";

export async function ensureCustomer(db: DB, p: BillPro): Promise<string> {
  if (p.stripe_customer_id) return p.stripe_customer_id;
  const c = await stripe.post<SCustomer>("/customers", {
    name: p.company, email: p.email, description: `${tradeOr(p.trade).label} contractor`,
    metadata: { roofer_id: p.id },
  }, `cus-${p.id}`);
  await db.from("roofers").update({ stripe_customer_id: c.id }).eq("id", p.id).is("stripe_customer_id", null);
  // Re-read in case another request won the race; theirs is the one kept.
  const { data } = await db.from("roofers").select("stripe_customer_id").eq("id", p.id).single();
  return (data?.stripe_customer_id as string) ?? c.id;
}

/** Stripe-hosted page to save a card (or bank account). Charges nothing. */
export async function cardSetupUrl(db: DB, p: BillPro): Promise<string> {
  const customer = await ensureCustomer(db, p);
  const s = await stripe.post<SCheckoutSession>("/checkout/sessions", {
    mode: "setup", currency: "usd", customer,
    success_url: `${SITE.url}/account?billing=saved`,
    cancel_url: `${SITE.url}/account?billing=cancelled`,
    metadata: { roofer_id: p.id, purpose: "card_on_file" },
    integration_identifier: `jhp-card-setup-${INTEGRATION_SUFFIX}`,
  });
  if (!s.url) throw new Error("Stripe didn't return a page.");
  return s.url;
}
const INTEGRATION_SUFFIX = "kqvmtrha";

/** Stripe Customer Portal: update card, see invoices. Needs the portal saved once in the Stripe dashboard. */
export async function portalUrl(db: DB, p: BillPro): Promise<string> {
  const customer = await ensureCustomer(db, p);
  const s = await stripe.post<{ url: string }>("/billing_portal/sessions", { customer, return_url: `${SITE.url}/account` });
  return s.url;
}

/** Copy the saved method onto the Customer as the invoice default and onto our row. */
export async function saveDefaultMethod(db: DB, customerId: string, paymentMethodId: string) {
  await stripe.post("/customers/" + customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  const pm = await stripe.get<SPaymentMethod>(`/payment_methods/${paymentMethodId}`);
  const brand = pm.card?.brand ?? (pm.us_bank_account ? (pm.us_bank_account.bank_name || "bank") : pm.type);
  const last4 = pm.card?.last4 ?? pm.us_bank_account?.last4 ?? "";
  await db.from("roofers").update({ card_on_file_at: new Date().toISOString(), card_brand: brand, card_last4: last4 }).eq("stripe_customer_id", customerId);
}

// ---------------- pay-per-lead ----------------

/** Turn delivered leads into charges. Idempotent (unique index per roofer+lead). */
export async function accrueLeadCharges(db: DB) {
  const out = { created: 0, free: 0, skipped: [] as string[] };
  const [{ data: pros }, { data: prices }, { data: st }] = await Promise.all([
    db.from("roofers").select(BILL_COLS).eq("billing_plan", "ppl").not("billing_started_at", "is", null),
    db.from("lead_prices").select("trade, price_cents"),
    db.from("estimator_settings").select("free_leads").eq("id", 1).maybeSingle(),
  ]);
  const price = new Map<string, number>();
  for (const r of prices ?? []) price.set(String(r.trade), Number(r.price_cents));
  const free = Number(st?.free_leads ?? 3);

  for (const p of (pros ?? []) as unknown as BillPro[]) {
    const cents = price.get(p.trade);
    if (cents == null) { out.skipped.push(`${p.company}: no lead price for ${p.trade}`); continue; }
    const [{ data: matches }, { count: used }] = await Promise.all([
      db.from("lead_matches").select("lead_id, created_at, notified_at, leads(id, zip, status, created_at)")
        .eq("roofer_id", p.id).not("notified_at", "is", null).gte("created_at", p.billing_started_at!).order("created_at").limit(500),
      db.from("charges").select("id", { count: "exact", head: true }).eq("roofer_id", p.id).eq("kind", "lead"),
    ]);
    const { data: existing } = await db.from("charges").select("lead_id").eq("roofer_id", p.id).eq("kind", "lead");
    const have = new Set((existing ?? []).map((c) => String(c.lead_id)));
    let n = used ?? 0;
    for (const m of (matches ?? []) as unknown as { lead_id: string; leads: { id: string; zip: string; status: string; created_at: string } | null }[]) {
      if (!m.leads || m.leads.status === "spam" || have.has(m.lead_id)) continue;
      const isFree = n < free;
      const day = new Date(m.leads.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
      const { error } = await db.from("charges").insert({
        roofer_id: p.id, kind: "lead", lead_id: m.lead_id,
        amount_cents: isFree ? 0 : cents, status: isFree ? "free" : "pending",
        description: `${tradeOr(p.trade).label} request, ZIP ${m.leads.zip}, ${day}${isFree ? ` (free lead ${n + 1} of ${free})` : ""}`,
      });
      if (!error) { n++; isFree ? out.free++ : out.created++; }
    }
  }
  return out;
}

/** One Stripe invoice for a set of charges. Returns the invoice. */
async function invoiceCharges(db: DB, p: BillPro, charges: { id: string; amount_cents: number; description: string }[], memo: string, kind: string): Promise<SInvoice> {
  const customer = await ensureCustomer(db, p);
  const hasCard = Boolean(p.card_on_file_at);
  const key = `${kind}-${p.id}-${charges.map((c) => c.id).sort().join(".")}`.slice(0, 250);
  const inv = await stripe.post<SInvoice>("/invoices", {
    customer, currency: "usd", auto_advance: true, pending_invoice_items_behavior: "exclude",
    collection_method: hasCard ? "charge_automatically" : "send_invoice",
    ...(hasCard ? {} : { days_until_due: 7 }),
    description: memo,
    metadata: { roofer_id: p.id, kind },
  }, `inv-${key}`);
  for (const c of charges) {
    await stripe.post("/invoiceitems", {
      customer, invoice: inv.id, amount: c.amount_cents, currency: "usd", description: c.description,
      metadata: { charge_id: c.id },
    }, `ii-${c.id}-${inv.id}`);
  }
  const fin = await stripe.post<SInvoice>(`/invoices/${inv.id}/finalize`, { auto_advance: true }, `fin-${inv.id}`);
  await db.from("charges").update({
    status: "invoiced", stripe_invoice_id: fin.id, hosted_invoice_url: fin.hosted_invoice_url ?? null, updated_at: new Date().toISOString(),
  }).in("id", charges.map((c) => c.id));
  if (!hasCard && fin.hosted_invoice_url) {
    await sendEmail(p.email, `${SITE.brand} invoice: ${dollars(fin.amount_due)}`, [
      `${p.contact || p.company},`, "",
      memo, "",
      ...charges.map((c) => `  • ${c.description}: ${dollars(c.amount_cents)}`), "",
      `Total due: ${dollars(fin.amount_due)}, within 7 days.`,
      `Pay by card or bank here (secure Stripe page):`,
      fin.hosted_invoice_url, "",
      `Want this charged automatically next time? Save a card in your dashboard: ${SITE.url}/account`, "",
      `Questions? Just reply. — ${SITE.brand}`,
    ].join("\n"), alertEmails()[0]);
  }
  return fin;
}

/** Bill every pending lead charge for one contractor (or all, when no id). */
export async function billPendingLeads(db: DB, rooferId?: string) {
  const out = { invoices: [] as string[], errors: [] as string[] };
  let q = db.from("charges").select("id, roofer_id, amount_cents, description").eq("kind", "lead").eq("status", "pending");
  if (rooferId) q = q.eq("roofer_id", rooferId);
  const { data } = await q.order("created_at").limit(2000);
  const byPro = new Map<string, { id: string; amount_cents: number; description: string }[]>();
  for (const c of data ?? []) {
    const arr = byPro.get(String(c.roofer_id)) ?? [];
    arr.push({ id: String(c.id), amount_cents: Number(c.amount_cents), description: String(c.description) });
    byPro.set(String(c.roofer_id), arr);
  }
  for (const [id, charges] of byPro) {
    const { data: p } = await db.from("roofers").select(BILL_COLS).eq("id", id).single();
    if (!p) continue;
    for (let i = 0; i < charges.length; i += 200) { // Stripe allows 250 items per invoice
      const chunk = charges.slice(i, i + 200);
      try {
        const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });
        const inv = await invoiceCharges(db, p as unknown as BillPro, chunk, `${SITE.brand} homeowner requests delivered (statement ${month}).`, "leads");
        out.invoices.push(`${(p as unknown as BillPro).company}: ${dollars(inv.amount_due)} (${chunk.length} leads)`);
      } catch (e) { out.errors.push(`${(p as unknown as BillPro).company}: ${e instanceof Error ? e.message : "error"}`); }
    }
  }
  return out;
}

/** Daily cron entry: accrue every day; invoice on the 1st (New Jersey time). */
export async function runBilling(db: DB) {
  if (!stripeOn()) return { off: true };
  const accrued = await accrueLeadCharges(db);
  const dayOfMonth = Number(new Date().toLocaleDateString("en-US", { day: "numeric", timeZone: "America/New_York" }));
  const billed = dayOfMonth === 1 ? await billPendingLeads(db) : { invoices: [], errors: [] };
  return { accrued, billed };
}

// ---------------- partner 10% fee ----------------

export async function billPartnerFee(db: DB, estimateId: string): Promise<SInvoice> {
  const { data: e } = await db.from("estimates")
    .select("id, trade, zip, homeowner_name, status, lane, signed_price, fee_pct, fee_paid_at, roofer_id")
    .eq("id", estimateId).single();
  if (!e) throw new Error("Job not found.");
  if (e.status !== "signed" || e.lane !== "A") throw new Error("Only signed referral jobs get a fee invoice.");
  if (e.fee_paid_at) throw new Error("This fee is already marked paid.");
  const fee = Math.round(Number(e.signed_price ?? 0) * Number(e.fee_pct ?? 0)); // dollars × % = cents
  if (!(fee > 0)) throw new Error("Add the signed price and fee % first.");
  const { data: p } = await db.from("roofers").select(BILL_COLS).eq("id", e.roofer_id).single();
  if (!p) throw new Error("No contractor on this job.");
  const { data: prior } = await db.from("charges").select("id, status, stripe_invoice_id, hosted_invoice_url").eq("estimate_id", e.id).eq("kind", "partner_fee").neq("status", "void").maybeSingle();
  if (prior?.stripe_invoice_id) throw new Error("A fee invoice already exists for this job.");
  const desc = `${SITE.brand} referral fee: ${e.fee_pct}% of $${Number(e.signed_price).toLocaleString("en-US")} (${tradeOr(e.trade).label} job, ${e.homeowner_name || e.zip || "NJ"})`;
  const charge = prior ?? (await db.from("charges").insert({
    roofer_id: (p as unknown as BillPro).id, kind: "partner_fee", estimate_id: e.id, amount_cents: fee, description: desc, status: "pending",
  }).select("id").single()).data;
  if (!charge) throw new Error("Couldn't record the fee.");
  return invoiceCharges(db, p as unknown as BillPro, [{ id: String(charge.id), amount_cents: fee, description: desc }],
    `Referral fee per your ${SITE.brand} partner agreement, due now that the homeowner has paid you.`, "partner_fee");
}
