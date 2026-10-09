import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
 * Emails a matched roofer about a new lead.
 * Never throws: a failed send must not fail the homeowner's submission.
 */
export async function notifyRoofer(
  to: string,
  company: string,
  lead: LeadForEmail,
  distanceMiles: number | null
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "email_not_configured" };

  const lines = [
    `${company},`,
    ``,
    `A homeowner in ZIP ${lead.zip} has requested roofing help.`,
    distanceMiles !== null ? `Approximately ${distanceMiles} miles from your service area.` : ``,
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
    `— RoofRank NJ`,
  ].filter((l) => l !== ``);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `New roofing lead in ${lead.zip} — ${lead.service}`,
        text: lines.join("\n"),
      }),
    });
    if (!res.ok) return { ok: false, error: `resend_http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}
