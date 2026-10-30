import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminDb, sendAccountLink, type SendResult } from "./server";
import { SITE } from "./site";

/**
 * Server-only helpers for the public directory and contractor accounts.
 * Never import this into a "use client" module: it reaches the database with
 * the service-role key.
 */

/** What a public profile page may show. No email, no phone, no ZIP list
 *  beyond what coverage needs: contact goes through the request form. */
export type PublicPro = {
  id: string;
  slug: string;
  company: string;
  trade: string;
  services: string;
  bio: string;
  website: string;
  radius_miles: number;
  service_zips: string[];
  /** 'approved' = in the network; 'unclaimed' = listed from public records. */
  status: string;
  city: string;
  license_label: string;
  license_number: string;
  license_status: string;
  license_checked_at: string | null;
  /** Set only after JHP checked an HIC registration or insurance certificate. */
  verified_at: string | null;
  leads_enabled: boolean;
  logo_path: string;
  gallery_paths: string[];
  year_founded: number | null;
  hours: string;
  towns: string;
  service_list: string[];
  highlights: string[];
};

export const PHOTO_BUCKET = "pro-photos";
export const MAX_GALLERY = 8;

/** Public URL for a stored profile photo, or null when there is none. */
export function photoUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Whether a request from this profile can actually reach the company. */
export function receivesRequests(p: { status: string; leads_enabled: boolean }): boolean {
  return p.status === "approved" && p.leads_enabled;
}

export const PUBLIC_PRO_COLUMNS =
  "id, slug, company, trade, services, bio, website, radius_miles, service_zips, status, city, license_label, license_number, license_status, license_checked_at, verified_at, leads_enabled, logo_path, gallery_paths, year_founded, hours, towns, service_list, highlights";

/** The state's own lookup, linked beside every registration badge so anyone
 *  can check the record themselves. */
export const NJ_LICENSE_LOOKUP = "https://newjersey.mylicense.com/verification/";

/** "Checked Oct 24, 2026" style date for the registration badge. */
export function checkedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York",
  });
}

export function slugify(company: string): string {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** A listed provider (in the network, or unclaimed) by slug, or null. Unlisted pages 404. */
export async function listedProBySlug(slug: string): Promise<PublicPro | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const db = adminDb();
  if (!db) return null;
  const { data } = await db
    .from("roofers")
    .select(PUBLIC_PRO_COLUMNS)
    .eq("slug", slug)
    .in("status", ["approved", "unclaimed"])
    .eq("listed", true)
    .maybeSingle();
  return (data as PublicPro | null) ?? null;
}

/**
 * A daily, salted hash of the visitor's IP. Lets the dashboard count unique
 * visitors per day without storing anyone's address. The salt rotates with the
 * date, so hashes cannot be joined across days.
 */
export function visitorHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return "";
  const day = new Date().toISOString().slice(0, 10);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return crypto.createHash("sha256").update(`${secret}|${day}|${ip}`).digest("hex").slice(0, 32);
}

/** Obvious crawlers are not visitors and must not inflate a contractor's count. */
export function isBot(req: Request): boolean {
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  return !ua || /bot|crawl|spider|slurp|preview|fetch|monitor|headless|curl|wget|python/.test(ua);
}

export type ProEventKind = "view" | "request_click" | "website_click";

/** Best-effort. A failed count must never break the page or the redirect. */
export async function logProEvent(req: Request, rooferId: string, kind: ProEventKind): Promise<void> {
  if (isBot(req)) return;
  const db = adminDb();
  if (!db) return;
  try {
    const visitor = visitorHash(req);
    // One view per visitor per day: a refresh is not a second visit.
    if (kind === "view" && visitor) {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const { count } = await db
        .from("profile_events")
        .select("id", { count: "exact", head: true })
        .eq("roofer_id", rooferId)
        .eq("kind", "view")
        .eq("visitor", visitor)
        .gte("created_at", since.toISOString());
      if ((count ?? 0) > 0) return;
    }
    await db.from("profile_events").insert({ roofer_id: rooferId, kind, visitor });
  } catch (err) {
    console.error(`[pros] event log failed kind=${kind} error=${err instanceof Error ? err.message : err}`);
  }
}

/** Only http(s) links are ever rendered or redirected to. */
export function safeWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type ContractorRow = {
  license_number: string;
  license_checked_at: string | null;
  insurance_uploaded_at: string | null;
  verified_at: string | null;
  id: string;
  company: string;
  contact: string;
  email: string;
  trade: string;
  status: string;
  slug: string | null;
  listed: boolean;
  bio: string;
  website: string;
  services: string;
  service_zips: string[];
  radius_miles: number;
  leads_enabled: boolean;
  logo_path: string;
  gallery_paths: string[];
  year_founded: number | null;
  hours: string;
  towns: string;
  service_list: string[];
  highlights: string[];
};

/**
 * The provider row belonging to a signed-in contractor, from the bearer token.
 * Null for no token, a bad token, or a user linked to no provider.
 */
export async function requireContractor(req: Request): Promise<ContractorRow | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;

  const db = adminDb();
  if (!db) return null;
  const { data: row } = await db
    .from("roofers")
    .select("id, company, contact, email, trade, status, slug, listed, bio, website, services, service_zips, radius_miles, leads_enabled, logo_path, gallery_paths, year_founded, hours, towns, service_list, highlights, license_number, license_checked_at, insurance_uploaded_at, verified_at")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  return (row as ContractorRow | null) ?? null;
}

/** Setup tokens: the raw value goes in the email, only its hash is stored. */
export function newSetupToken(): { token: string; hash: string; expires: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    expires: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a fresh setup link for a provider and emails it. Replaces any earlier
 * unused link, so only the newest one works.
 */
export async function issueAccountLink(
  rooferId: string,
  kind: "invite" | "reset"
): Promise<SendResult & { to?: string }> {
  const db = adminDb();
  if (!db) return { ok: false, error: "db_not_connected" };
  const { data: row } = await db
    .from("roofers")
    .select("company, email, status")
    .eq("id", rooferId)
    .maybeSingle();
  if (!row?.email) return { ok: false, error: "provider_not_found" };
  if (row.status !== "approved") return { ok: false, error: "provider_not_approved" };

  const t = newSetupToken();
  const { error } = await db
    .from("roofers")
    .update({ setup_token_hash: t.hash, setup_token_expires: t.expires })
    .eq("id", rooferId);
  if (error) return { ok: false, error: "token_save_failed" };

  const link = `${SITE.url}/account/setup?token=${encodeURIComponent(t.token)}`;
  const out = await sendAccountLink(row.email, row.company, link, kind);
  return { ...out, to: row.email };
}
