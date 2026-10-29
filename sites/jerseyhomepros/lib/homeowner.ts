import crypto from "node:crypto";
import { adminDb, sendEmail, type SendResult } from "./server";
import { hashToken } from "./pros";
import { SITE } from "./site";
import { TRADES, isTradeSlug } from "./trades";

/**
 * Server-only helpers for homeowner accounts and the Home Board.
 *
 * Sign-in is an emailed one-time link (no password). Only SHA-256 hashes of
 * link tokens and session tokens are stored. Signing in proves the person
 * controls the email address, which is what lets a lead sent while signed in
 * be marked "email verified" to the contractor — and nothing more than that.
 */

export const SESSION_COOKIE = "jhp_home";
const SESSION_DAYS = 60;
const LINK_MINUTES = 30;

export type Homeowner = {
  id: string;
  email: string;
  zip: string | null;
  reminders: boolean;
};

export function normEmail(e: unknown): string | null {
  const s = String(e ?? "").trim().toLowerCase().slice(0, 320);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The signed-in homeowner for this request, or null. */
export async function currentHomeowner(req: Request): Promise<Homeowner | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length < 20) return null;
  const db = adminDb();
  if (!db) return null;
  const { data } = await db
    .from("homeowner_sessions")
    .select("expires_at, homeowners(id, email, zip, reminders)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const row = data as unknown as { expires_at: string; homeowners: Homeowner | null } | null;
  if (!row?.homeowners || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.homeowners;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${
    SESSION_DAYS * 24 * 60 * 60
  }`;
}
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createSession(homeownerId: string): Promise<string | null> {
  const db = adminDb();
  if (!db) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await db.from("homeowner_sessions").insert({
    token_hash: hashToken(token),
    homeowner_id: homeownerId,
    expires_at: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  return error ? null : token;
}

export async function endSession(req: Request): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  const db = adminDb();
  if (token && db) await db.from("homeowner_sessions").delete().eq("token_hash", hashToken(token));
}

/** Creates and emails a one-time sign-in link. */
export async function sendSignInLink(email: string, ip: string): Promise<SendResult | { ok: false; error: string }> {
  const db = adminDb();
  if (!db) return { ok: false, error: "db" };
  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await db.from("homeowner_login_tokens").insert({
    token_hash: hashToken(token),
    email,
    expires_at: new Date(Date.now() + LINK_MINUTES * 60 * 1000).toISOString(),
    ip: ip || null,
  });
  if (error) return { ok: false, error: error.message };
  const link = `${SITE.url}/home/verify?t=${token}`;
  return sendEmail(
    email,
    `Your ${SITE.brand} Home Board sign-in link`,
    [
      `Here's your link to sign in to your ${SITE.brand} Home Board:`,
      ``,
      link,
      ``,
      `It works once and expires in ${LINK_MINUTES} minutes. No password needed.`,
      ``,
      `If you didn't ask for this, ignore this email and nothing happens.`,
      ``,
      `— ${SITE.brand}`,
    ].join("\n"),
    undefined,
    "homeowner"
  );
}

/**
 * Attaches the homeowner's past requests (same email, sent before they had an
 * account) to their board, as "request" items. Matching is by the address the
 * sign-in link just proved they control.
 */
export async function linkPastRequests(h: Homeowner): Promise<void> {
  const db = adminDb();
  if (!db) return;
  const { data: leads } = await db
    .from("leads")
    .select("id, trade, zip, created_at, homeowner_id")
    .ilike("email", h.email.replace(/[%_\\]/g, (c) => `\\${c}`))
    .neq("status", "spam")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const l of (leads ?? []) as { id: string; trade: string; zip: string; homeowner_id: string | null }[]) {
    if (!l.homeowner_id) await db.from("leads").update({ homeowner_id: h.id }).eq("id", l.id);
    await addRequestItem(h.id, l.id, l.trade);
  }
  if (!h.zip && leads && leads.length > 0) {
    await db.from("homeowners").update({ zip: (leads[0] as { zip: string }).zip }).eq("id", h.id);
  }
}

/** One board item per request; safe to call twice (unique on homeowner+lead). */
export async function addRequestItem(homeownerId: string, leadId: string, trade: string): Promise<void> {
  const db = adminDb();
  if (!db) return;
  const label = isTradeSlug(trade) ? TRADES[trade].label : "Home";
  await db.from("home_todos").upsert(
    {
      homeowner_id: homeownerId,
      lead_id: leadId,
      title: `${label} request`,
      trade: isTradeSlug(trade) ? trade : null,
      source: "request",
      status: "open",
    },
    { onConflict: "homeowner_id,lead_id", ignoreDuplicates: true }
  );
}
