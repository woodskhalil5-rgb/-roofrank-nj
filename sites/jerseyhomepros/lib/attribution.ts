/**
 * Server side of ad-source capture: keep only known keys, short strings.
 * Whatever the browser sends is untrusted, so nothing else gets stored.
 */
const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "gbraid", "wbraid", "landing", "referrer", "at"] as const;
export type Attr = Partial<Record<(typeof KEYS)[number], string>>;

export function cleanAttribution(v: unknown): Attr | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Attr = {};
  for (const k of KEYS) {
    const s = o[k];
    if (typeof s === "string" && s.trim()) out[k] = s.trim().slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}

/** One line for admin screens and emails: "facebook / cpc · spring-roof" or "Google Ads click" etc. */
export function attrLabel(a: Attr | null | undefined): string {
  if (!a) return "";
  const parts: string[] = [];
  if (a.utm_source || a.utm_medium) parts.push([a.utm_source, a.utm_medium].filter(Boolean).join(" / "));
  if (a.utm_campaign) parts.push(a.utm_campaign);
  if (a.utm_content) parts.push(a.utm_content);
  if (!parts.length && (a.gclid || a.gbraid || a.wbraid)) parts.push("Google Ads click");
  if (!parts.length && a.fbclid) parts.push("Facebook/Instagram click");
  if (!parts.length && a.referrer) {
    try { parts.push(`from ${new URL(a.referrer).hostname.replace(/^www\./, "")}`); } catch { parts.push("referral"); }
  }
  return parts.join(" · ");
}
