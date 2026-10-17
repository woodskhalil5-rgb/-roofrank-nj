import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

export interface QueuedNotification {
  kind: string;
  recipient: string;
  subject: string;
  bodyText: string;
  relatedType?: string;
  relatedId?: string;
}

/**
 * Puts a notification in the durable outbox.
 *
 * Queueing is deliberately separate from sending: an approval must never
 * depend on an email succeeding. If delivery fails the approval still sits in
 * the dashboard queue, and the failure is visible there too.
 */
export async function queueNotification(n: QueuedNotification): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notification_outbox")
    .insert({
      kind: n.kind,
      recipient: n.recipient,
      subject: n.subject,
      body_text: n.bodyText,
      related_type: n.relatedType ?? null,
      related_id: n.relatedId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not queue notification: ${error.message}`);
  }
  return data.id as string;
}

interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when the failure is configuration, not a delivery attempt. */
  notConfigured?: boolean;
}

async function sendOne(
  recipient: string,
  subject: string,
  bodyText: string,
): Promise<SendResult> {
  const env = serverEnv();

  if (env.emailProvider !== "resend" || !env.resendApiKey || !env.emailFrom) {
    return {
      ok: false,
      notConfigured: true,
      error:
        "No email provider configured (set EMAIL_PROVIDER=resend, RESEND_API_KEY and EMAIL_FROM).",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [recipient],
        subject,
        text: bodyText,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: `Provider returned ${response.status}: ${payload.message ?? "no detail"}`,
      };
    }
    return { ok: true, providerMessageId: payload.id };
  } catch (cause) {
    return { ok: false, error: `Request failed: ${(cause as Error).message}` };
  }
}

export interface DrainSummary {
  considered: number;
  sent: number;
  failed: number;
  heldUnconfigured: number;
}

/**
 * Attempts delivery for everything due in the outbox, with exponential backoff.
 *
 * When no provider is configured nothing is counted as a failed attempt — the
 * message stays queued with an explanatory error rather than burning through
 * its retry budget and being abandoned.
 */
export async function drainOutbox(limit = 25): Promise<DrainSummary> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("notification_outbox")
    .select("id, recipient, subject, body_text, attempts, max_attempts")
    .in("status", ["queued", "failed"])
    .lte("next_attempt_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Could not read outbox: ${error.message}`);

  const summary: DrainSummary = {
    considered: due?.length ?? 0,
    sent: 0,
    failed: 0,
    heldUnconfigured: 0,
  };

  for (const row of due ?? []) {
    const result = await sendOne(
      row.recipient as string,
      row.subject as string,
      row.body_text as string,
    );

    if (result.ok) {
      await supabase
        .from("notification_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: "resend",
          provider_message_id: result.providerMessageId ?? null,
          last_error: null,
        })
        .eq("id", row.id);
      summary.sent += 1;
      continue;
    }

    if (result.notConfigured) {
      await supabase
        .from("notification_outbox")
        .update({
          status: "queued",
          last_error: result.error,
          next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .eq("id", row.id);
      summary.heldUnconfigured += 1;
      continue;
    }

    const attempts = (row.attempts as number) + 1;
    const maxAttempts = row.max_attempts as number;
    const backoffMinutes = Math.min(2 ** attempts, 240);

    await supabase
      .from("notification_outbox")
      .update({
        status: attempts >= maxAttempts ? "abandoned" : "failed",
        attempts,
        last_error: result.error,
        next_attempt_at: new Date(
          Date.now() + backoffMinutes * 60 * 1000,
        ).toISOString(),
      })
      .eq("id", row.id);
    summary.failed += 1;
  }

  return summary;
}
