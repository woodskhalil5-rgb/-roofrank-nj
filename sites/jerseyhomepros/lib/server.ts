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

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Addresses permitted to sign in to /admin. This is an authorisation list,
 * not a mailing list — see alertEmails().
 */
export function adminEmails(): string[] {
  return splitList(process.env.ADMIN_EMAILS);
}

/**
 * Where operator alerts are sent.
 *
 * Deliberately separate from ADMIN_EMAILS. Sharing one variable meant that
 * adding somebody to the alert list also granted them admin access to every
 * lead's contact details and consent record, and that the alert could only be
 * sent to addresses that happened to be admins. They are different questions.
 *
 * Falls back to adminEmails() so an unset variable degrades to the old
 * behaviour rather than to sending nowhere.
 */
export function alertEmails(): string[] {
  const explicit = splitList(process.env.LEAD_ALERT_EMAILS);
  return explicit.length > 0 ? explicit : adminEmails();
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

export type SendResult = {
  /** True when at least one recipient was accepted by Resend. */
  ok: boolean;
  /** Set whenever ANY recipient failed, even if another succeeded. */
  error?: string;
  /** Resend message ids, for asking later whether they were delivered. */
  ids?: string[];
  perRecipient?: { to: string; ok: boolean; id?: string; error?: string }[];
};

/** One Resend request, one recipient. Never throws. */
async function sendOne(
  key: string,
  from: string,
  to: string,
  subject: string,
  text: string,
  replyTo?: string
): Promise<{ to: string; ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) {
      // Resend's body says *why* a 4xx happened — which address was rejected,
      // which domain is unverified. Without it a 422 is unactionable.
      const detail = await res.text().catch(() => "");
      return {
        to,
        ok: false,
        error: `resend_http_${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { to, ok: true, id: body.id };
  } catch (err) {
    return { to, ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

/**
 * Low-level sender. Never throws — callers decide what a failure means.
 *
 * Each recipient gets its OWN Resend request. Batching them into one `to`
 * array meant a single bad address failed the send for everybody on the list:
 * Resend validates the whole request, so one unroutable address silently took
 * down the alert to the address that worked. The operator alert list contained
 * exactly that — an address on a domain with no mailbox behind it — so the one
 * email that matters was the one most likely to be lost.
 *
 * `ok` is true if ANY recipient was accepted, because an alert that reached
 * one of two inboxes still reached the operator. `error` is set whenever any
 * recipient failed, so a partial failure is recorded rather than rounded up
 * to success.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  text: string,
  /** Where replies go. Defaults to the operator, because the From address
   *  (leads@) has no inbox. */
  replyTo?: string
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const rawFrom = process.env.LEAD_FROM_EMAIL;
  if (!key || !rawFrom) return { ok: false, error: "email_not_configured" };
  // A bare address shows in inboxes as its first part ("leads"). Give it the
  // brand as the display name unless the env var already sets one.
  const from = rawFrom.includes("<") ? rawFrom : `${SITE.brand} <${rawFrom.trim()}>`;
  // The From address has no inbox: any reply would vanish. Unless the caller
  // chose somewhere else, replies go to the operator.
  const reply = replyTo ?? alertEmails()[0];

  const recipients = Array.from(
    new Set(
      (Array.isArray(to) ? to : [to])
        .flatMap((t) => t.split(","))
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
  if (recipients.length === 0) return { ok: false, error: "no_recipients" };

  const perRecipient = await Promise.all(
    recipients.map((r) => sendOne(key, from, r, subject, text, reply))
  );

  const failed = perRecipient.filter((r) => !r.ok);
  const ids = perRecipient.flatMap((r) => (r.id ? [r.id] : []));
  return {
    ok: perRecipient.some((r) => r.ok),
    error:
      failed.length > 0
        ? failed.map((f) => `${f.to}: ${f.error ?? "unknown"}`).join(" | ").slice(0, 600)
        : undefined,
    ids: ids.length > 0 ? ids : undefined,
    perRecipient,
  };
}

/**
 * Asks Resend what actually happened to a message.
 *
 * This is the only way to tell a delivered alert from an accepted one.
 * `last_event` is Resend's own term: sent, delivered, delivery_delayed,
 * bounced, complained. A bounce here is the signal that an alert address is
 * dead, which is invisible from the send call alone.
 */
export async function emailStatus(
  id: string
): Promise<{ ok: boolean; lastEvent?: string; to?: string[]; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "email_not_configured" };
  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `resend_http_${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}` };
    }
    const body = (await res.json()) as { last_event?: string; to?: string[] };
    return { ok: true, lastEvent: body.last_event, to: body.to };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "status_failed" };
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
  otherRecipients: number,
  emailVerified = false
): Promise<SendResult> {
  // The contractor, not the operator, places the call. They must be told in the
  // notification itself whether calling or texting this homeowner is permitted.
  const contactRule = phoneConsent
    ? [
        `CONTACT PERMISSION: This homeowner consented to calls and texts,`,
        `including automated or prerecorded calls, at ${lead.phone}.`,
        `Call only between 8am and 8pm local time, no more than 3 attempts`,
        `in 24 hours, and stop immediately on any opt-out request.`,
      ]
    : lead.phone
    ? [
        `CONTACT PERMISSION: *** EMAIL ONLY — DO NOT CALL OR TEXT ***`,
        `This homeowner did NOT consent to phone or text contact.`,
        `Respond by email at ${lead.email}. Calling or texting this number`,
        `may expose you to TCPA liability and breaches your network agreement.`,
      ]
    : [
        `CONTACT PERMISSION: *** EMAIL ONLY ***`,
        `This homeowner did NOT consent to phone or text contact and gave`,
        `no phone number. Respond by email at ${lead.email}. Do not attempt`,
        `to look up a number for them.`,
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
    ...(emailVerified
      ? [`✓ Email verified: this homeowner signed in to a ${SITE.brand} account with this address.`]
      : []),
    `Name:  ${lead.name}`,
    // Omitted entirely when blank. A homeowner who declined calls may leave no
    // number at all, and an empty "Phone:" line reads as a broken email.
    ...(lead.phone ? [`Phone: ${lead.phone}`] : []),
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
): Promise<SendResult> {
  const to = alertEmails();
  if (to.length === 0) return { ok: false, error: "no_alert_emails_configured" };

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
    ...(lead.phone ? [`Phone: ${lead.phone}`] : [`Phone: not given`]),
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
): Promise<SendResult> {
  const to = alertEmails();
  if (to.length === 0) return { ok: false, error: "no_alert_emails_configured" };

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
): Promise<SendResult> {
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

/**
 * Contractor dashboard setup or password reset. Sent through Resend rather
 * than Supabase's own mailer, so it does not depend on the auth Site URL or on
 * the built-in mailer's couple-an-hour limit. The link carries a one-time
 * token that expires in 72 hours.
 */
export async function sendAccountLink(
  to: string,
  company: string,
  link: string,
  kind: "invite" | "reset"
): Promise<SendResult> {
  const lines =
    kind === "invite"
      ? [
          `${company},`,
          ``,
          `Your ${SITE.brand} dashboard is ready. It shows the requests we've sent`,
          `you, how many homeowners viewed your directory profile and clicked to`,
          `contact you, and lets you edit your profile or ask us for more.`,
          ``,
          `Choose a password to finish setting it up:`,
          link,
          ``,
          `The link works once and expires in 72 hours. After that, sign in any`,
          `time at ${SITE.url}/account.`,
          ``,
          `— ${SITE.brand}`,
        ]
      : [
          `${company},`,
          ``,
          `Someone asked to reset the password for your ${SITE.brand} dashboard.`,
          `If that was you, choose a new one here:`,
          link,
          ``,
          `The link works once and expires in 72 hours. If you didn't ask for this,`,
          `ignore this email and nothing changes.`,
          ``,
          `— ${SITE.brand}`,
        ];
  return sendEmail(
    to,
    kind === "invite" ? `Your ${SITE.brand} dashboard is ready` : `Reset your ${SITE.brand} password`,
    lines.join("\n")
  );
}

/**
 * A contractor asked Destiny Marketing Group for more leads or for marketing
 * work. Sent to the operator, because nobody else acts on it.
 */
export async function notifyOperatorServiceRequest(
  company: string,
  contact: string,
  email: string,
  phone: string,
  trade: Trade,
  kind: "more_leads" | "marketing",
  items: string[],
  details: string
): Promise<SendResult> {
  const to = alertEmails();
  if (to.length === 0) return { ok: false, error: "no_alert_emails_configured" };
  const what = kind === "more_leads" ? "more leads" : "marketing services";
  const lines = [
    `${company} asked for ${what} from their dashboard.`,
    ``,
    ...(items.length > 0 ? [`Asked about: ${items.join(", ")}`] : []),
    ...(details ? [`Notes: ${details}`] : []),
    ``,
    `Company: ${company}`,
    `Contact: ${contact}`,
    `Email:   ${email}`,
    `Phone:   ${phone}`,
    `Trade:   ${trade.label}`,
    ``,
    `Admin: ${SITE.url}/admin`,
    ``,
    `— ${SITE.brand} (automatic operator alert)`,
  ];
  return sendEmail(to, `${company} wants ${what}`, lines.join("\n"));
}

/**
 * Someone asked to claim an unclaimed directory listing. Nothing is handed
 * over automatically: the operator checks the claimant against the company's
 * public details first, because a claim grants control of the page.
 */
export async function notifyOperatorClaim(
  company: string,
  trade: Trade,
  city: string,
  contact: string,
  email: string,
  phone: string,
  role: string,
  demand30: number
): Promise<SendResult> {
  const to = alertEmails();
  if (to.length === 0) return { ok: false, error: "no_alert_emails_configured" };
  const lines = [
    `Someone wants to claim ${company}'s directory page.`,
    ``,
    `Check they really work there before approving — call the number on the`,
    `company's state registration or website, not the one below.`,
    ``,
    `Company:  ${company} (${trade.label}${city ? `, ${city}` : ""})`,
    `Claimant: ${contact}${role ? `, ${role}` : ""}`,
    `Email:    ${email}`,
    `Phone:    ${phone}`,
    ``,
    `Requests in their trade and area, last 30 days: ${demand30}`,
    ``,
    `Approve or reject in the Claims tab: ${SITE.url}/admin`,
    ``,
    `— ${SITE.brand} (automatic operator alert)`,
  ];
  return sendEmail(to, `Claim request — ${company}`, lines.join("\n"));
}
