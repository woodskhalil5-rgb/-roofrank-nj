/**
 * Ad measurement + ad-source capture. Browser-only helpers.
 *
 * - captureAttribution(): on every page load, if the URL carries ad tags
 *   (utm_*, gclid, fbclid, gbraid, wbraid), remember them for 30 days so the
 *   request/booking/application made later in the visit (or days later) is
 *   saved with the ad that brought the person.
 * - getAttribution(): what to send with a form.
 * - track(): one conversion event to Google (GA4 + Google Ads if configured)
 *   and the Meta pixel (if configured). Never sends names, emails, phones or
 *   addresses: only the event and the trade.
 *
 * Advertising tags (Google Ads conversions, Meta pixel) are skipped when the
 * browser sends Global Privacy Control, which the privacy notice promises to
 * honour as an opt-out of targeted advertising.
 */

const KEY = "jhp_attr";
const TAGS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "gbraid", "wbraid"] as const;
const DAYS = 30;

export type Attribution = Partial<Record<(typeof TAGS)[number] | "landing" | "referrer" | "at", string>>;

export function gpcOn(): boolean {
  return typeof navigator !== "undefined" && (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function captureAttribution(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const found: Attribution = {};
    for (const t of TAGS) {
      const v = q.get(t);
      if (v) found[t] = v.slice(0, 200);
    }
    if (Object.keys(found).length === 0) {
      // Organic visit: keep an existing ad touch; otherwise note where they came from once.
      if (!localStorage.getItem(KEY) && document.referrer && !document.referrer.startsWith(window.location.origin)) {
        localStorage.setItem(KEY, JSON.stringify({ referrer: document.referrer.slice(0, 200), landing: window.location.pathname, at: new Date().toISOString() }));
      }
      return;
    }
    // Latest ad click wins.
    localStorage.setItem(KEY, JSON.stringify({ ...found, landing: window.location.pathname.slice(0, 200), at: new Date().toISOString() }));
  } catch { /* storage off: attribution is best-effort */ }
}

export function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Attribution;
    if (a.at && Date.now() - new Date(a.at).getTime() > DAYS * 864e5) { localStorage.removeItem(KEY); return null; }
    return a;
  } catch { return null; }
}

type Conv = "homeowner_request" | "estimate_booked" | "contractor_application" | "road_pro_application";

/** GA4 event names (generate_lead is GA4's standard name) and Meta standard events. */
const GA_NAME: Record<Conv, string> = {
  homeowner_request: "generate_lead",
  estimate_booked: "book_visit",
  contractor_application: "contractor_application",
  road_pro_application: "road_pro_application",
};
const META: Record<Conv, [string, Record<string, string>]> = {
  homeowner_request: ["Lead", { content_category: "homeowner_request" }],
  estimate_booked: ["Schedule", { content_category: "estimate_booked" }],
  contractor_application: ["SubmitApplication", { content_category: "contractor" }],
  road_pro_application: ["SubmitApplication", { content_category: "road_pro" }],
};
/** Google Ads conversion labels, one per event, from Vercel env vars (public, not secrets). */
const ADS_LABEL: Record<Conv, string | undefined> = {
  homeowner_request: process.env.NEXT_PUBLIC_GADS_LABEL_LEAD,
  estimate_booked: process.env.NEXT_PUBLIC_GADS_LABEL_BOOKING,
  contractor_application: process.env.NEXT_PUBLIC_GADS_LABEL_CONTRACTOR,
  road_pro_application: process.env.NEXT_PUBLIC_GADS_LABEL_ROADPRO,
};

export function track(conv: Conv, params: Record<string, string | number | boolean> = {}): void {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void };
  w.gtag?.("event", GA_NAME[conv], params);
  if (gpcOn()) return;
  const ads = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = ADS_LABEL[conv];
  if (ads && label) w.gtag?.("event", "conversion", { send_to: `${ads}/${label}` });
  const [ev, extra] = META[conv];
  w.fbq?.("track", ev, { ...extra, ...(typeof params.trade === "string" ? { content_name: params.trade } : {}) });
}
