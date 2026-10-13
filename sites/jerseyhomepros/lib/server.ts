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
 *
 * `to` takes one address or several. Several must be passed as an array:
 * Resend validates each entry in `to` as a single address, so a comma-joined
 * string arrives as one malformed address and the whole send fails with a 422.
 * That is not hypothetical — it is what the operator alert did on its first
 * deploy, and it failed silently for every lead because nothing read the
 * result. Hence the error text in the response below.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  if (!key || !from) return { ok: false, error: "email_not_configured" };

  const recipients = (Array.isArray(to) ? to : [to])
    .flatMap((t) => t.split(","))
    .map((t) => t.trim())
    .filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "no_recipients" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: recipients, subject, text }),
    });
    if (!res.ok) {
      // Resend's body says *why* a 4xx happened — which address was rejected,
      // which domain is unverified. Without it a 422 is unactionable.
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: `resend_http_${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      };
    }
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
  phoneConsent: boolean,
  otherRecipients: number
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

  // Computed from the real match count, never assumed. The exclusivity claim the
  // network is sold on is only ever made here when it is actually true, and the
  // number is stated either way so a contractor can hold us to it.
  const exclusivity =
    otherRecipients <= 0
      ? [
          `This request went to you alone. No other company in the network`,
          `received it, so there is no bidding war to win. Please respond today`,
          `— if we don't hear from you we may offer it to someone else.`,
        ]
      : [
          `This request also went to ${otherRecipients} other ${
            otherRecipients === 1 ? `company` : `companies`
          } serving this area.`,
          `Responding quickly materially improves your chance of winning the job.`,
        ];

  // Optional lines are spread in rather than emitted as "" and filtered out:
  // a blanket filter would also strip the deliberate blank lines that separate
  // paragraphs, collapsing the whole notice into one unreadable block.
  const lines = [
    `${company},`,
    ``,
    `A homeowner in ZIP ${lead.zip} has requested ${trade.work}.`,
    ...(distanceMiles !== null
      ? [`Approximately ${distanceMiles} miles from your service area.`]
      : []),
    ``,
    ...contactRule,
    ``,
    `Service needed: ${lead.service}`,
    `Property type:  ${lead.property_type}`,
    `Timing:         ${lead.timing}`,
    ...(lead.details ? [`Details:        ${lead.details}`] : []),
    ``,
    `Contact`,
    `Name:  ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    ``,
    ...exclusivity,
    ``,
    `— ${SITE.brand}`,
  ];

  return sendEmail(
    to,
    `New ${trade.label} lead in ${lead.zip} — ${lead.service}`,
    lines.join("\n")
  );
}

/**
 * Alerts the operator about a lead that has already been saved.
 *
 * This exists because matching is allowed to return zero. A trade with no
 * approved contractor — which is most of them most of the time — produced a
 * saved lead, no email to anyone, and a homeowner who had been told someone
 * would follow up. The lead was only discoverable by opening /admin and
 * noticing. That is the failure this closes: the operator is told about every
 * single lead, and told loudest when nobody else was.
 *
 * Never throws. The homeowner's submission has already succeeded by the time
 * this runs and must not be reported as failed.
 */
export async function notifyOperator(
  lead: LeadForEmail,
  trade: Trade,
  matched: number,
  leadId: string,
  phoneConsent: boolean
): Promise<{ ok: boolean; error?: string }> {
  const to = adminEmails();
  if (to.length === 0) return { ok: false, error: "no_admin_emails_configured" };

  // The subject line is the alert. It has to be readable on a phone lock
  // screen without opening anything, because when matched is 0 the operator
  // is the only person who knows this homeowner exists.
  const subject =
    matched > 0
      ? `New ${trade.label} lead — ${lead.zip} — sent to ${matched} ${matched === 1 ? "company" : "companies"}`
      : `ACTION REQUIRED: unmatched ${trade.label} lead — ${lead.zip} — nobody was notified`;

  const head =
    matched > 0
      ? [
          `A ${trade.label} request came in and went out to ${matched} ${
            matched === 1 ? "company" : "companies"
          }.`,
          `No action needed unless you want to follow it.`,
        ]
      : [
          `*** THIS LEAD WENT TO NO ONE. ***`,
          ``,
          `A homeowner submitted a ${trade.label} request and there is no`,
          `approved ${trade.company} covering ZIP ${lead.zip}. They were told`,
          `${SITE.brand} would review it and follow up by email, so that`,
          `follow-up is now yours to make.`,
          ``,
          `Either reply to this homeowner directly, or approve a ${trade.company}`,
          `for this area in /admin and press Rematch on the lead.`,
        ];

  const contactRule = phoneConsent
    ? `Phone and text contact: PERMITTED.`
    : `Phone and text contact: NOT permitted — email only.`;

  const lines = [
    ...head,
    ``,
    `Trade:          ${trade.label}`,
    `Service needed: ${lead.service}`,
    `Property type:  ${lead.property_type}`,
    `Timing:         ${lead.timing}`,
    `ZIP:            ${lead.zip}`,
    ...(lead.details ? [`Details:        ${lead.details}`] : []),
    ``,
    `Name:  ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    ``,
    contactRule,
    ``,
    `Lead ID: ${leadId}`,
    `Admin:   ${SITE.url}/admin`,
    ``,
    `— ${SITE.brand} (automatic operator alert)`,
  ];

  return sendEmail(to, subject, lines.join("\n"));
}

/**
 * Alerts the operator that a contractor applied. Applications had the same
 * silent-arrival problem as leads: nothing was sent, so an application only
 * surfaced if someone happened to open /admin. An applicant who hears nothing
 * assumes the network is dead, and supply is the constraint on this business.
 *
 * Never throws: the application is already saved.
 */
export async function notifyOperatorApplication(
  company: string,
  contact: string,
  email: string,
  phone: string,
  trade: Trade,
  zipCount: number,
  radiusMiles: number,
  services: string
): Promise<{ ok: boolean; error?: string }> {
  const to = adminEmails();
  if (to.length === 0) return { ok: false, error: "no_admin_emails_configured" };

  const lines = [
    `A ${trade.company} applied to join the network.`,
    ``,
    `They are pending and will receive no leads until you approve them in`,
    `/admin. Approving sends them the welcome email with the contact rules.`,
    ``,
    `Company:  ${company}`,
    `Contact:  ${contact}`,
    `Email:    ${email}`,
    `Phone:    ${phone}`,
    `Trade:    ${trade.label}`,
    `Services: ${services}`,
    `Coverage: ${zipCount} NJ ZIP ${zipCount === 1 ? "code" : "codes"}, ${radiusMiles}-mile radius`,
    ``,
    `Admin: ${SITE.url}/admin`,
    ``,
    `— ${SITE.brand} (automatic operator alert)`,
  ];

  return sendEmail(
    to,
    `New ${trade.label} contractor application — ${company}`,
    lines.join("\n")
  );
}

/**
 * Sent once, when an admin approves a provider. This is the moment they are
 * most engaged, and it is the only place the contact rules are stated to them
 * in writing before the first lead arrives.
 *
 * Transactional, not marketing: it is the direct result of their own
 * application, so it carries no unsubscribe. Never reuse it for promotion.
 */
export async function notifyProviderApproved(
  to: string,
  company: string,
  trade: Trade
): Promise<{ ok: boolean; error?: string }> {
  const lines = [
    `${company},`,
    ``,
    `You're approved. ${SITE.brand} will now send you homeowner ${trade.label.toLowerCase()} requests`,
    `in the ZIP codes you gave us, by email, as they come in.`,
    ``,
    `Two things to know before the first one lands.`,
    ``,
    `1. We match each request to the companies that actually fit it — the`,
    `   right trade, close enough to show up — not to a bidding pool. Every`,
    `   lead email states near the bottom exactly how many other companies`,
    `   received it, often none, so you are never quietly entered into an`,
    `   auction. Respond the same day regardless: homeowners hire fast.`,
    ``,
    `2. Read the CONTACT PERMISSION line at the top of each email.`,
    `   If it says EMAIL ONLY, that homeowner did not consent to calls or`,
    `   texts. Calling them anyway can expose you to TCPA penalties of`,
    `   $500 to $1,500 per call, and it ends your place in the network.`,
    `   Where calling is permitted, keep it between 8am and 8pm.`,
    ``,
    `We are a referral service. We do not perform, supervise or guarantee`,
    `any work, and we are not a party to anything you agree with a homeowner.`,
    ``,
    `To change your service area, pause requests, or leave the network, just`,
    `reply to this email.`,
    ``,
    `— ${SITE.brand}`,
    `${SITE.operator}`,
  ].join("\n");

  return sendEmail(to, `You're approved — ${SITE.brand}`, lines);
}
