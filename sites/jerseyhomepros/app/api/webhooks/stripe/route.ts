import { NextResponse } from "next/server";
import { adminDb, alertEmails, sendEmail } from "../../../../lib/server";
import { stripe, verifyWebhook, dollars, type SEvent, type SSetupIntent } from "../../../../lib/stripe";
import { saveDefaultMethod } from "../../../../lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe → JHP. The only place money is marked paid.
 * Signature-verified with STRIPE_WEBHOOK_SECRET (rejects everything until set),
 * and each event id is stored once so Stripe's retries are harmless.
 *
 * Events: checkout.session.completed, customer.updated, invoice.finalized,
 * invoice.paid, invoice.payment_failed, invoice.voided,
 * invoice.marked_uncollectible, charge.refunded, charge.dispute.created.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  let event: SEvent;
  try { event = verifyWebhook(raw, req.headers.get("stripe-signature"), secret); }
  catch { return NextResponse.json({ error: "bad signature" }, { status: 400 }); }

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "db" }, { status: 503 }); // Stripe retries

  // Idempotency: first writer wins; a duplicate delivery is acknowledged and skipped.
  const { error: dupErr } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) {
    if (dupErr.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  try {
    await handle(db, event);
  } catch (e) {
    // Let Stripe retry: forget the event so the retry isn't treated as a duplicate.
    await db.from("stripe_events").delete().eq("id", event.id);
    console.error("stripe webhook", event.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

type DB = NonNullable<ReturnType<typeof adminDb>>;
const now = () => new Date().toISOString();

async function handle(db: DB, event: SEvent) {
  const o = event.data.object as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : null);

  switch (event.type) {
    case "checkout.session.completed": {
      if (o.mode !== "setup" || !s("setup_intent") || !s("customer")) return;
      const si = await stripe.get<SSetupIntent>(`/setup_intents/${s("setup_intent")}`);
      if (si.payment_method) await saveDefaultMethod(db, s("customer")!, si.payment_method);
      return;
    }
    case "customer.updated": {
      // Card changed in the customer portal.
      const pm = (o.invoice_settings as { default_payment_method?: string | null } | undefined)?.default_payment_method;
      const prev = (event as unknown as { data: { previous_attributes?: { invoice_settings?: unknown } } }).data.previous_attributes;
      if (pm && prev?.invoice_settings !== undefined) {
          const p = await stripe.get<{ card?: { brand: string; last4: string }; us_bank_account?: { bank_name?: string; last4: string }; type: string }>(`/payment_methods/${pm}`);
        await db.from("roofers").update({
          card_on_file_at: now(),
          card_brand: p.card?.brand ?? p.us_bank_account?.bank_name ?? p.type,
          card_last4: p.card?.last4 ?? p.us_bank_account?.last4 ?? "",
        }).eq("stripe_customer_id", s("id")!);
      }
      return;
    }
    case "invoice.finalized":
      await db.from("charges").update({ hosted_invoice_url: s("hosted_invoice_url"), updated_at: now() }).eq("stripe_invoice_id", s("id")!);
      return;
    case "invoice.paid": {
      const id = s("id")!;
      const { data: rows } = await db.from("charges").update({ status: "paid", paid_at: now(), updated_at: now() })
        .eq("stripe_invoice_id", id).select("kind, estimate_id, roofer_id");
      // A paid partner-fee invoice is what marks the job's fee paid (and makes Road Pro commission due).
      const jobs = (rows ?? []).filter((r) => r.kind === "partner_fee" && r.estimate_id).map((r) => String(r.estimate_id));
      if (jobs.length) await db.from("estimates").update({ fee_paid_at: now(), updated_at: now() }).in("id", jobs).is("fee_paid_at", null);
      return;
    }
    case "invoice.payment_failed": {
      const id = s("id")!;
      await db.from("charges").update({ status: "failed", updated_at: now() }).eq("stripe_invoice_id", id).in("status", ["invoiced", "failed"]);
      await sendEmail(alertEmails(), `Stripe: payment failed (${dollars(Number(o.amount_due ?? 0))})`, [
        `A contractor invoice payment failed. Stripe will retry automatically per your retry settings.`,
        `Customer: ${s("customer_name") ?? s("customer_email") ?? s("customer")}`,
        `Invoice: ${s("hosted_invoice_url") ?? id}`,
      ].join("\n"));
      return;
    }
    case "invoice.voided":
    case "invoice.marked_uncollectible":
      await db.from("charges").update({ status: "void", updated_at: now() }).eq("stripe_invoice_id", s("id")!).neq("status", "paid");
      return;
    case "charge.refunded":
    case "charge.dispute.created":
      await sendEmail(alertEmails(), event.type === "charge.refunded" ? "Stripe: a contractor charge was refunded" : "Stripe: DISPUTE opened — respond in Stripe", [
        `${event.type} for ${dollars(Number(o.amount ?? 0))}.`,
        `Open the Stripe dashboard to see details${event.type === "charge.dispute.created" ? " and respond before the deadline" : ""}.`,
      ].join("\n"));
      return;
    default:
      return;
  }
}
