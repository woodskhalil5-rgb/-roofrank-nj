/**
 * Shared estimator types and maths. Pure: safe to import from the browser
 * (the scope sheet) and the server (validation, the contractor email).
 */

/** Private storage bucket for site-visit photos. */
export const ESTIMATE_BUCKET = "estimate-photos";

export type PriceItem = {
  id: string; trade: string; item: string; unit: string;
  low: number; high: number; source: string;
};

/** One line on an estimate: copied from the price book (or typed in) at the time. */
export type Line = { item: string; unit: string; qty: number; low: number; high: number };

export type EstimateStatus = "draft" | "sent" | "signed" | "lost";

export type Estimate = {
  id: string; created_at: string; updated_at: string; created_by: string;
  trade: string; status: EstimateStatus; lane: "A" | "B";
  homeowner_name: string; homeowner_phone: string; homeowner_email: string;
  address: string; zip: string; problem: string; notes: string;
  items: Line[]; range_low: number | null; range_high: number | null;
  share_consent_at: string | null; contact_method: "email" | "phone_email";
  roofer_id: string | null; sent_at: string | null; send_error: string | null;
  fee_pct: number | null; signed_price: number | null; sub_price: number | null;
  signed_at: string | null; fee_paid_at: string | null;
  photos?: { id: string; path: string; url: string | null }[];
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
export const toNum = num;

/** Sum of qty × low and qty × high across the lines. */
export function lineTotals(items: Line[]): { low: number; high: number } {
  let low = 0, high = 0;
  for (const l of items) {
    const q = num(l.qty);
    if (!(q > 0)) continue;
    low += q * (num(l.low) || 0);
    high += q * (num(l.high) || 0);
  }
  return { low: Math.round(low), high: Math.round(high) };
}

/** What JHP earns on a signed job: the percentage (lane A) or the spread (lane B). */
export function jhpEarnings(e: Pick<Estimate, "lane" | "signed_price" | "sub_price" | "fee_pct">): number | null {
  if (e.signed_price == null) return null;
  if (e.lane === "B") return e.sub_price == null ? null : Math.round(e.signed_price - e.sub_price);
  return e.fee_pct == null ? null : Math.round((e.signed_price * e.fee_pct) / 100);
}

export const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

/** Clean lines coming from the browser. Drops empty ones, caps sizes. */
export function cleanLines(raw: unknown): Line[] {
  if (!Array.isArray(raw)) return [];
  const out: Line[] = [];
  for (const r of raw.slice(0, 60)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const item = String(o.item ?? "").trim().slice(0, 120);
    const qty = num(o.qty), low = num(o.low), high = num(o.high);
    if (!item || !(qty > 0) || !(low >= 0) || !(high >= 0)) continue;
    out.push({
      item, unit: String(o.unit ?? "each").trim().slice(0, 30) || "each",
      qty: Math.round(qty * 100) / 100, low: Math.round(low * 100) / 100,
      high: Math.round(Math.max(low, high) * 100) / 100,
    });
  }
  return out;
}
