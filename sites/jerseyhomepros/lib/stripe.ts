import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Stripe REST client (server only). Stripe's own SDK couldn't be
 * installed in the build sandbox, so this calls the same REST API directly:
 * form-encoded bodies, a pinned API version, idempotency keys on every write.
 *
 * Keys live in Vercel env only:
 *   STRIPE_SECRET_KEY      a RESTRICTED key (rk_test_… / rk_live_…), never committed
 *   STRIPE_WEBHOOK_SECRET  whsec_… for /api/webhooks/stripe
 * With STRIPE_SECRET_KEY unset, `stripeOn()` is false and every billing
 * feature hides itself instead of erroring.
 */

const API = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2026-10-28.endive";

export const stripeOn = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const stripeTestMode = () => /^(rk|sk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");

type Params = Record<string, unknown>;

/** Stripe's bracket form encoding: { a: { b: 1 }, c: ["x"] } → a[b]=1&c[0]=x */
export function encode(params: Params, prefix = ""): string {
  const out: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => add(`${k}[${i}]`, x));
    else if (typeof v === "object") for (const [kk, vv] of Object.entries(v as Params)) add(`${k}[${kk}]`, vv);
    else out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) add(prefix ? `${prefix}[${k}]` : k, v);
  return out.join("&");
}

export class StripeError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError("Billing isn't set up yet.", 503);
  const qs = encode(params);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  }
  const url = method === "POST" || !qs ? `${API}${path}` : `${API}${path}?${qs}`;
  const r = await fetch(url, { method, headers, body: method === "POST" ? qs : undefined, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & T;
  // Never echo the key or request body; Stripe's message is safe to log.
  if (!r.ok) throw new StripeError(j.error?.message ?? `Stripe error ${r.status}`, r.status, j.error?.code);
  return j;
}

export const stripe = {
  get: <T>(path: string, params?: Params) => call<T>("GET", path, params),
  post: <T>(path: string, params: Params, idempotencyKey?: string) => call<T>("POST", path, params, idempotencyKey),
};

// ---------- object shapes we read (only the fields used) ----------
export type SCustomer = { id: string; invoice_settings?: { default_payment_method?: string | null } };
export type SInvoice = {
  id: string; status: "draft" | "open" | "paid" | "uncollectible" | "void"; customer: string;
  hosted_invoice_url?: string | null; amount_due: number; amount_paid: number;
  metadata?: Record<string, string>;
};
export type SCheckoutSession = { id: string; url: string | null; mode: string; customer: string | null; setup_intent: string | null; metadata?: Record<string, string> };
export type SSetupIntent = { id: string; payment_method: string | null; customer: string | null };
export type SPaymentMethod = { id: string; type: string; card?: { brand: string; last4: string }; us_bank_account?: { bank_name?: string; last4: string } };
export type SEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

/**
 * Verify a webhook per Stripe's signing scheme: header `t=…,v1=…`, HMAC-SHA256
 * of `${t}.${rawBody}` with the endpoint secret, 5-minute tolerance.
 */
export function verifyWebhook(rawBody: string, header: string | null, secret: string, toleranceSec = 300): SEvent {
  if (!header) throw new Error("Missing Stripe-Signature header");
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) throw new Error("Timestamp outside tolerance");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new Error("Signature mismatch");
  return JSON.parse(rawBody) as SEvent;
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
