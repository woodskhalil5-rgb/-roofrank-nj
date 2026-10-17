import { NextResponse } from "next/server";
import { adminDb, alertEmails, sendEmail, emailStatus } from "../../../../lib/server";
import { SITE } from "../../../../lib/site";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Proves the operator alert reaches a mailbox.
 *
 * This exists because `operator_notified_at` was being read as proof that an
 * alert arrived, and it never meant that. It means Resend returned 2xx. Mail
 * addressed to a domain with no mailbox behind it is also accepted with a
 * 2xx, and then bounces minutes later, with nothing on this side recording
 * it. Every lead in the database had that column null anyway, so the alert
 * path had never run in production at all.
 *
 * So this route runs the real path and then asks Resend what became of the
 * message. A send that is accepted and then bounced reports `bounced` here,
 * which is the failure that was previously invisible.
 *
 * GET /api/health/alerts
 *   ?token=<HEALTH_CHECK_TOKEN>   or  Authorization: Bearer <CRON_SECRET>
 *   &send=0                       report configuration and backlog only
 *   &id=<resend id>               look up one earlier message instead
 *
 * Nothing here exposes a homeowner's details or any API key. The alert
 * addresses are returned because they are the thing under test.
 */

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2000;
/** Resend events that will not change if we keep asking. */
const TERMINAL = new Set(["delivered", "bounced", "complained", "failed"]);
/** Resend's reply when the API key may send but not read. */
const SEND_ONLY = "restricted_api_key";

function authorised(req: Request, url: URL): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const healthToken = process.env.HEALTH_CHECK_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (healthToken && url.searchParams.get("token") === healthToken) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plain-English reading of a Resend event, so the JSON needs no decoding. */
function explain(event: string | undefined): string {
  switch (event) {
    case "delivered":
      return "DELIVERED — the receiving mail server accepted it for this mailbox.";
    case "bounced":
      return "BOUNCED — rejected by the receiving server. This address cannot receive alerts.";
    case "complained":
      return "MARKED AS SPAM by the recipient.";
    case "delivery_delayed":
      return "DELAYED — the receiving server deferred it. May still arrive.";
    case "sent":
      return "SENT — handed to the receiving server, no delivery confirmation yet.";
    case undefined:
      return "UNKNOWN — Resend returned no event for this message.";
    default:
      return `${event} — see Resend for detail.`;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authorised(req, url)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const from = process.env.LEAD_FROM_EMAIL ?? null;
  const explicit = (process.env.LEAD_ALERT_EMAILS ?? "").trim();
  const recipients = alertEmails();

  const config = {
    from,
    alertRecipients: recipients,
    alertSource: explicit
      ? "LEAD_ALERT_EMAILS"
      : "ADMIN_EMAILS (LEAD_ALERT_EMAILS is not set, so alerts fall back to the admin sign-in list)",
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    fromDomainMatchesRecipient: recipients.some(
      (r) => from && r.split("@")[1] === from.split("@")[1]
    ),
  };

  // Backlog is deliberately independent of email: it is what tells you a lead
  // was lost even when no alert ever left the building.
  const db = adminDb();
  let backlog: Record<string, number | string> = { error: "database not connected" };
  if (db) {
    // Spam leads and rejected applications are excluded: they are already
    // triaged, and counting them would leave a permanent false alarm that
    // trains everyone to ignore the real one.
    const [neverLeads, errLeads, neverApps, errApps] = await Promise.all([
      db.from("leads").select("id", { count: "exact", head: true })
        .neq("status", "spam").is("operator_notified_at", null),
      db.from("leads").select("id", { count: "exact", head: true })
        .neq("status", "spam").not("operator_notify_error", "is", null),
      db.from("roofers").select("id", { count: "exact", head: true })
        .neq("status", "rejected").is("operator_notified_at", null),
      db.from("roofers").select("id", { count: "exact", head: true })
        .neq("status", "rejected").not("operator_notify_error", "is", null),
    ]);
    backlog = {
      leadsNeverAlerted: neverLeads.count ?? 0,
      leadsWithAlertError: errLeads.count ?? 0,
      applicationsNeverAlerted: neverApps.count ?? 0,
      applicationsWithAlertError: errApps.count ?? 0,
    };
  }

  // Look up an earlier message rather than sending a new one.
  const lookupId = url.searchParams.get("id");
  if (lookupId) {
    const s = await emailStatus(lookupId);
    // With a send-only key the API read is refused, so fall back to what the
    // webhook recorded. Reporting only the 401 would say nothing about the
    // message, which is the question actually being asked.
    let lastEvent = s.lastEvent;
    let to = s.to;
    let source = "resend api";
    if (!s.ok && db) {
      const { data } = await db
        .from("email_events")
        .select("event, recipient, occurred_at")
        .eq("message_id", lookupId)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        lastEvent = data.event as string;
        to = data.recipient ? [data.recipient as string] : undefined;
        source = "webhook";
      }
    }
    return NextResponse.json({
      ok: lastEvent === "delivered",
      mode: "lookup",
      config: { ...config, webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET) },
      backlog,
      message: {
        id: lookupId,
        to,
        lastEvent: lastEvent ?? null,
        source,
        reading: explain(lastEvent),
        error: lastEvent ? null : s.error,
      },
    });
  }

  if (url.searchParams.get("send") === "0") {
    return NextResponse.json({ ok: true, mode: "inspect", config, backlog });
  }

  const stamp = new Date().toISOString();
  const subject = `ALERT PATH TEST — ${SITE.brand} — ${stamp}`;
  const text = [
    `This is the operator alert self-test, not a real lead.`,
    ``,
    `If you are reading this in your inbox, the alert path works end to end:`,
    `a real homeowner request would reach you the same way, with the subject`,
    `line "ACTION REQUIRED: unmatched <trade> lead" when nobody is signed up`,
    `to receive it.`,
    ``,
    `Sent from:  ${from}`,
    `Sent to:    ${recipients.join(", ")}`,
    `Alert list: ${config.alertSource}`,
    `Time:       ${stamp}`,
    ``,
    `Run again any time at ${SITE.url}/api/health/alerts`,
    ``,
    `— ${SITE.brand} (automatic alert self-test)`,
  ].join("\n");

  const sent = await sendEmail(recipients, subject, text);

  // Resend reports delivery asynchronously, so poll until every message has a
  // settled outcome or the budget runs out. Reporting "sent" after one glance
  // would repeat exactly the mistake this route exists to catch.
  const ids = sent.ids ?? [];
  const statuses = new Map<string, { lastEvent?: string; to?: string[]; error?: string }>();
  let sendOnlyKey = false;

  for (let attempt = 0; attempt < POLL_ATTEMPTS && ids.length > 0; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    await Promise.all(
      ids.map(async (id) => {
        const current = statuses.get(id);
        if (current && TERMINAL.has(current.lastEvent ?? "")) return;

        // Preferred source: ask Resend directly.
        const s = await emailStatus(id);
        if (s.error?.includes(SEND_ONLY)) {
          sendOnlyKey = true;
        } else if (s.ok) {
          statuses.set(id, { lastEvent: s.lastEvent, to: s.to, error: s.error });
          return;
        }

        // Fallback: whatever the webhook has already recorded. With a
        // send-only key this is the ONLY way delivery can ever be known,
        // which is why /api/webhooks/resend exists.
        if (db) {
          const { data } = await db
            .from("email_events")
            .select("event, recipient, occurred_at")
            .eq("message_id", id)
            .order("occurred_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            statuses.set(id, {
              lastEvent: data.event as string,
              to: data.recipient ? [data.recipient as string] : undefined,
            });
            return;
          }
        }
        statuses.set(id, { lastEvent: undefined, error: s.error });
      })
    );
    if (ids.every((id) => TERMINAL.has(statuses.get(id)?.lastEvent ?? ""))) break;
  }

  const webhookConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET);

  const delivery = (sent.perRecipient ?? []).map((r) => {
    const s = r.id ? statuses.get(r.id) : undefined;
    return {
      to: r.to,
      accepted: r.ok,
      id: r.id ?? null,
      acceptError: r.error ?? null,
      lastEvent: s?.lastEvent ?? null,
      reading: r.ok ? explain(s?.lastEvent) : `NOT ACCEPTED — ${r.error ?? "unknown"}`,
    };
  });

  const delivered = delivery.filter((d) => d.lastEvent === "delivered").map((d) => d.to);
  const bounced = delivery.filter((d) => d.lastEvent === "bounced").map((d) => d.to);
  const rejected = delivery.filter((d) => !d.accepted).map((d) => d.to);
  const pending = delivery
    .filter((d) => d.accepted && !TERMINAL.has(d.lastEvent ?? ""))
    .map((d) => d.to);

  const blind = sendOnlyKey && !webhookConfigured;
  const verdict =
    delivered.length > 0
      ? `PASS — delivered to ${delivered.join(", ")}.${
          bounced.length ? ` Bounced for ${bounced.join(", ")}; remove that address.` : ""
        }`
      : bounced.length > 0 || rejected.length > 0
      ? `FAIL — nothing was delivered. ${
          rejected.length ? `Rejected outright: ${rejected.join(", ")}. ` : ""
        }${bounced.length ? `Bounced: ${bounced.join(", ")}.` : ""}`
      : blind
      ? `ACCEPTED, DELIVERY UNVERIFIABLE — Resend took the message for ${pending.join(
          ", "
        )} and the sending domain is verified, but this API key may only send, not read, so nothing here can confirm arrival. Set RESEND_WEBHOOK_SECRET and point a Resend webhook at /api/webhooks/resend; delivery then becomes a recorded fact instead of an assumption.`
      : `UNCONFIRMED — accepted but no delivery event yet for ${pending.join(
          ", "
        )}. Re-check with ?id=<id> once the webhook has had a moment.`;

  return NextResponse.json({
    ok: delivered.length > 0,
    mode: "send",
    verdict,
    sentAt: stamp,
    subject,
    config: {
      ...config,
      // A 2xx with a message id means Resend accepted mail from this domain.
      // An unverified sending domain is refused outright, so acceptance is
      // itself proof the domain is verified.
      sendingDomainVerified: sent.ok,
      apiKeyCanReadDeliveryStatus: !sendOnlyKey,
      webhookConfigured,
    },
    delivery,
    backlog,
  });
}
