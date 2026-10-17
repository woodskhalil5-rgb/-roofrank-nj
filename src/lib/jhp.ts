import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jhpConfig } from "@/lib/env";

/**
 * Jersey Home Pros delivery.
 *
 * JHP is a separate application with its own database, authentication and
 * administrator dashboard. Nothing here touches it.
 *
 * IMPORTANT: no JHP endpoint, schema or authentication scheme has been
 * verified yet. Until JHP_API_BASE_URL / JHP_API_KEY are set and
 * JHP_INTEGRATION_ENABLED is "true", this module deliberately refuses to
 * transmit: requests stay queued and visible to administrators rather than
 * being posted to a guessed URL. The payload below is the minimum field set a
 * service lead needs; it must be confirmed against JHP's real contract before
 * the integration is switched on.
 */

export interface JhpDeliveryResult {
  delivered: boolean;
  status: "delivered" | "queued_not_configured" | "failed";
  reference?: string;
  error?: string;
  responseStatus?: number;
  responseBody?: string;
  payload: Record<string, unknown>;
  durationMs: number;
}

interface ServiceRequestRow {
  id: string;
  idempotency_key: string;
  requester_name: string;
  requester_email: string;
  requester_phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string;
  service_category: string;
  details: string | null;
  preferred_timing: string | null;
}

/** Only what a service lead requires. No CRM, agent or brokerage data. */
function buildPayload(row: ServiceRequestRow): Record<string, unknown> {
  return {
    external_id: row.idempotency_key,
    source: "destiny-marketing-group/real-estate-platform",
    customer: {
      name: row.requester_name,
      email: row.requester_email,
      phone: row.requester_phone,
    },
    service_address: {
      street: row.street_address,
      city: row.city,
      state: row.state ?? "NJ",
      postal_code: row.zip,
    },
    service: {
      category: row.service_category,
      details: row.details,
      preferred_timing: row.preferred_timing,
    },
    consent: {
      granted: true,
      purpose: "home_service_referral",
    },
  };
}

/**
 * Attempts one delivery and records the attempt. Idempotent from JHP's side
 * via external_id; our own uniqueness is enforced by service_request.idempotency_key.
 */
export async function deliverServiceRequest(
  serviceRequestId: string,
): Promise<JhpDeliveryResult> {
  const supabase = createSupabaseAdminClient();
  const config = jhpConfig();
  const startedAt = Date.now();

  const { data, error } = await supabase
    .from("service_request")
    .select(
      "id, idempotency_key, requester_name, requester_email, requester_phone, street_address, city, state, zip, service_category, details, preferred_timing, attempts, max_attempts",
    )
    .eq("id", serviceRequestId)
    .single();

  if (error || !data) {
    return {
      delivered: false,
      status: "failed",
      error: `Service request not found: ${error?.message ?? "no row"}`,
      payload: {},
      durationMs: Date.now() - startedAt,
    };
  }

  const row = data as unknown as ServiceRequestRow & {
    attempts: number;
    max_attempts: number;
  };
  const payload = buildPayload(row);
  const attemptNo = row.attempts + 1;

  if (!config.configured) {
    const reason =
      "Jersey Home Pros integration is not configured. The request is retained " +
      "in the queue; it has not been transmitted. Verify JHP's real endpoint, " +
      "authentication and request schema with its administrator, then set " +
      "JHP_API_BASE_URL, JHP_API_KEY and JHP_INTEGRATION_ENABLED=true.";

    await supabase
      .from("service_request")
      .update({ status: "queued", last_error: reason, next_attempt_at: null })
      .eq("id", row.id);

    await supabase.from("service_request_attempt").insert({
      service_request_id: row.id,
      attempt_no: attemptNo,
      endpoint: null,
      request_payload: payload,
      error: reason,
      duration_ms: Date.now() - startedAt,
    });

    return {
      delivered: false,
      status: "queued_not_configured",
      error: reason,
      payload,
      durationMs: Date.now() - startedAt,
    };
  }

  const endpoint = `${config.baseUrl!.replace(/\/$/, "")}/leads`;
  let responseStatus: number | undefined;
  let responseBody: string | undefined;
  let deliveryError: string | undefined;
  let reference: string | undefined;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Idempotency-Key": row.idempotency_key,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    responseStatus = response.status;
    responseBody = (await response.text()).slice(0, 2000);

    if (response.ok) {
      try {
        const parsed = JSON.parse(responseBody) as { id?: string; reference?: string };
        reference = parsed.reference ?? parsed.id;
      } catch {
        reference = undefined;
      }
    } else {
      deliveryError = `JHP returned ${response.status}`;
    }
  } catch (cause) {
    deliveryError = `Request failed: ${(cause as Error).message}`;
  }

  const durationMs = Date.now() - startedAt;
  const delivered = !deliveryError;

  await supabase.from("service_request_attempt").insert({
    service_request_id: row.id,
    attempt_no: attemptNo,
    endpoint,
    request_payload: payload,
    response_status: responseStatus ?? null,
    response_body: responseBody ?? null,
    error: deliveryError ?? null,
    duration_ms: durationMs,
  });

  if (delivered) {
    await supabase
      .from("service_request")
      .update({
        status: "delivered",
        attempts: attemptNo,
        delivered_at: new Date().toISOString(),
        jhp_reference: reference ?? null,
        last_error: null,
        next_attempt_at: null,
      })
      .eq("id", row.id);

    return {
      delivered: true,
      status: "delivered",
      reference,
      payload,
      responseStatus,
      responseBody,
      durationMs,
    };
  }

  const backoffMinutes = Math.min(2 ** attemptNo, 180);
  const exhausted = attemptNo >= row.max_attempts;

  await supabase
    .from("service_request")
    .update({
      status: "failed",
      attempts: attemptNo,
      last_error: deliveryError,
      next_attempt_at: exhausted
        ? null
        : new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString(),
    })
    .eq("id", row.id);

  return {
    delivered: false,
    status: "failed",
    error: deliveryError,
    payload,
    responseStatus,
    responseBody,
    durationMs,
  };
}

/** Retries everything that is due. Exposed to an authenticated job route. */
export async function retryDueServiceRequests(limit = 20): Promise<{
  attempted: number;
  delivered: number;
  stillFailing: number;
}> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("service_request")
    .select("id")
    .eq("status", "failed")
    .not("next_attempt_at", "is", null)
    .lte("next_attempt_at", new Date().toISOString())
    .limit(limit);

  let delivered = 0;
  let stillFailing = 0;

  for (const row of data ?? []) {
    const result = await deliverServiceRequest(row.id as string);
    if (result.delivered) delivered += 1;
    else stillFailing += 1;
  }

  return { attempted: data?.length ?? 0, delivered, stillFailing };
}
