import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SITE } from "./site";
import type { Trade } from "./trades";

/**
 * Service-role Supabase client. Server-only: this key bypasses RLS,
 * so it must never be imported into a "use client" module.
 * Returns null when the key is absent so routes can degrade gracefully.
 */
export function adminDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Allowlisted admin addresses, normalised to lowercase. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies the caller is a signed-in, allowlisted admin.
 * Returns the email on success, null otherwise.
 */
export async function requireAdmin(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user?.email) return null;

  const email = data.user.email.toLowerCase();
  return adminEmails().includes(email) ? email : null;
}

export type LeadForEmail = {
  name: string;
  phone: string;
  email: string;
  zip: string;
  property_type: string;
  service: string;
  timing: string;
  details: string;
};

/**
 * Low-level sender. Never throws — callers decide what a failure means.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "email_not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) return { ok: false, error: `resend_http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

/**
 * Emails a matched provider about a new lead.
 * Never throws: a failed send must not fail the homeowner's submission.
 */
export async function notifyProvider(
  to: string,
  company: string,
  lead: LeadForEmail,
  trade: Trade,
  distanceMiles: number | null,
  phoneConsent: boolean
): Promise<{ ok: boolean; error?: string }> {
  // The contractor, not the operator, places the call. They must be told in the
  // notification itself whether calling or texting this homeowner is permitted.
  const contactRule = phoneConsent
    ? [
        `CONTACT PERMISSION: This homeowner consented to calls and texts,`,
        `including automated or prerecorded calls, at ${lead.phone}.`,
        `Call only between 8am and 8pm local time, no more than 3 attempts`,
        `in 24 hours, and stop immediately on any opt-out request.`,
      ]
    : [
        `CONTACT PERMISSION: *** EMAIL ONLY — DO NOT CALL OR TEXT ***`,
        `This homeowner did NOT consent to phone or text contact.`,
        `Respond by email at ${lead.email}. Calling or texting this number`,
        `may expose you to TCPA liability and breaches your network agreement.`,
      ];

  const lines = [
    `${company},`,
    ``,
    `A homeowner in ZIP ${lead.zip} has requested ${trade.work}.`,
    distanceMiles !== null ? `Approximately ${distanceMiles} miles from your service area.` : ``,
    ``,
    ...contactRule,
    ``,
    `Service needed: ${lead.service}`,
    `Property type:  ${lead.property_type}`,
    `Timing:         ${lead.timing}`,
    lead.details ? `Details:        ${lead.details}` : ``,
    ``,
    `Contact`,
    `Name:  ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    ``,
    `This homeowner was also shared with other participating companies in their area.`,
    `Responding quickly materially improves your chance of winning the job.`,
    ``,
    `— ${SITE.brand}`,
  ].filter((l) => l !== ``);

  return sendEmail(
    to,
    `New ${trade.label} lead in ${lead.zip} — ${lead.service}`,
    lines.join("\n")
  );
}
