import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { adminDb } from "../../../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receives Resend delivery events.
 *
 * The Resend API key in this project is restricted to sending — the correct
 * setting for a key living in a web app, but it means nothing here can ask
 * Resend whether a message arrived. So Resend pushes the answer here instead,
 * and this is what turns "accepted" into "delivered" or "bounced".
 *
 * A bounce is written back onto the lead as operator_notify_error, which is
 * what lights the red banner in /admin. That matters because a bounced alert
 * is indistinguishable from a successful one at send time: mail to a domain
 * with no mailbox is accepted with a 2xx and rejected minutes later.
 *
 * Setup, once, in the Resend dashboard:
 *   Webhooks -> Add endpoint
 *   URL:    https://jerseyhomepros.com/api/webhooks/resend
 *   Events: email.delivered, email.bounced, email.complained,
 *           email.delivery_delayed
 *   Then copy the signing secret (whsec_...) into RESEND_WEBHOOK_SECRET.
 *
 * Until that secret is set this route rejects everything, deliberately: an
 * unauthenticated endpoint that writes to the database on request is worse
 * than no endpoint.
 */

/** Reject replays. Resend signs a timestamp; anything old is not live traffic. */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Svix signature check, which is the scheme Resend uses.
 *
 * The signed payload is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the
 * secret's base64 half, and the header may carry several space-separated
 * versioned signatures during a secret rotation — so any one matching is a
 * pass. Compared with timingSafeEqual rather than ===, because a plain
 * comparison leaks the signature a byte at a time.
 */
function verify(secret: string, id: string, timestamp: string, body: string, header: string): boolean {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  return header
    .split(" ")
    .map((part) => (part.includes(",") ? part.split(",")[1] : part))
    .filter(Boolean)
    .some((candidate) => {
      const buf = Buffer.from(candidate);
      return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
    });
}

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[]; subject?: string };
};

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set; rejecting");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  // The raw text, not the parsed object: the signature covers the exact bytes,
  // and re-serialising JSON will not reproduce them.
  const body = await req.text();
  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signature = req.headers.get("svix-signature") ?? "";

  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "Missing signature headers." }, { status: 400 });
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return NextResponse.json({ error: "Stale signature." }, { status: 400 });
  }
  if (!verify(secret, id, timestamp, body, signature)) {
    console.error("[resend-webhook] bad signature");
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const messageId = event.data?.email_id;
  const type = (event.type ?? "").replace(/^email\./, "");
  if (!messageId || !type) {
    // 200 so Resend does not retry something we will never accept.
    return NextResponse.json({ ok: true, ignored: "no message id or type" });
  }

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const recipient = event.data?.to?.[0] ?? null;
  await db.from("email_events").upsert(
    {
      message_id: messageId,
      event: type,
      recipient,
      subject: event.data?.subject ?? null,
      occurred_at: event.created_at ?? new Date().toISOString(),
      payload: event as unknown as Record<string, unknown>,
    },
    { onConflict: "message_id,event,recipient", ignoreDuplicates: true }
  );

  // A bounced or rejected operator alert is a lost lead, so it is pushed back
  // onto the row itself where /admin will show it. Delivery clears the error
  // rather than only setting a timestamp, so a retried alert that succeeds
  // stops the banner complaining about it.
  const bad = type === "bounced" || type === "complained" || type === "failed";
  const good = type === "delivered";
  if (bad || good) {
    const patch = bad
      ? { operator_notify_error: `${type} for ${recipient ?? "recipient"} (resend ${messageId})` }
      : { operator_notified_at: new Date().toISOString(), operator_notify_error: null };

    for (const table of ["leads", "roofers"] as const) {
      const { error } = await db.from(table).update(patch).contains("operator_notify_ids", [messageId]);
      if (error) {
        console.error(`[resend-webhook] ${table} update failed id=${messageId}: ${error.message}`);
      }
    }
    if (bad) {
      console.error(`[resend-webhook] ALERT ${type.toUpperCase()} recipient=${recipient} id=${messageId}`);
    }
  }

  return NextResponse.json({ ok: true, event: type, messageId });
}
