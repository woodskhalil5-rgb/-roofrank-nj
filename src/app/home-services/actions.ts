"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { deliverServiceRequest } from "@/lib/jhp";
import {
  JHP_CONSENT_TEXT,
  JHP_CONSENT_VERSION,
  fieldErrors,
  serviceRequestSchema,
} from "@/lib/validation";

export interface ServiceRequestState {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string>;
  /** True when the request is recorded but not yet transmitted to JHP. */
  queuedOnly?: boolean;
}

export async function submitServiceRequest(
  _prev: ServiceRequestState,
  formData: FormData,
): Promise<ServiceRequestState> {
  const parsed = serviceRequestSchema.safeParse({
    requesterName: formData.get("requesterName"),
    requesterEmail: formData.get("requesterEmail"),
    requesterPhone: formData.get("requesterPhone"),
    streetAddress: formData.get("streetAddress") ?? "",
    city: formData.get("city") ?? "",
    zip: formData.get("zip"),
    serviceCategory: formData.get("serviceCategory"),
    details: formData.get("details") ?? "",
    preferredTiming: formData.get("preferredTiming") ?? "",
    consent: formData.get("consent") === "on" ? true : undefined,
    sourcePage: formData.get("sourcePage") ?? "/home-services",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  if (!hasServiceRole()) {
    return {
      status: "error",
      message:
        "This form is not accepting submissions yet because the server is missing its database credentials. No information was recorded.",
    };
  }

  const input = parsed.data;
  const supabase = createSupabaseAdminClient();

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : null;
  const userAgent = requestHeaders.get("user-agent");

  // Same person, same service, same day counts as one request.
  const idempotencyKey = createHash("sha256")
    .update(
      [
        input.requesterEmail.toLowerCase(),
        input.zip,
        input.serviceCategory,
        new Date().toISOString().slice(0, 10),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 48);

  const { data: existing } = await supabase
    .from("service_request")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    return {
      status: "success",
      message:
        "We already have this request on file and it has not been duplicated.",
      queuedOnly: existing.status !== "delivered",
    };
  }

  // 1. Record exactly what the visitor agreed to, before anything else.
  const { data: consent, error: consentError } = await supabase
    .from("consent_record")
    .insert({
      subject_email: input.requesterEmail,
      subject_phone: input.requesterPhone,
      purpose: "home_service_referral_to_jersey_home_pros",
      disclosure_text: JHP_CONSENT_TEXT,
      text_version: JHP_CONSENT_VERSION,
      granted: true,
      ip_address: ip,
      user_agent: userAgent,
      source_page: input.sourcePage || "/home-services",
    })
    .select("id")
    .single();

  if (consentError || !consent) {
    return {
      status: "error",
      message: `We could not record your consent, so nothing was submitted. ${consentError?.message ?? ""}`,
    };
  }

  // 2. Record the request itself. The database rejects any request whose
  //    consent record is missing or not granted.
  const { data: request, error: requestError } = await supabase
    .from("service_request")
    .insert({
      idempotency_key: idempotencyKey,
      requester_name: input.requesterName,
      requester_email: input.requesterEmail,
      requester_phone: input.requesterPhone,
      street_address: input.streetAddress || null,
      city: input.city || null,
      zip: input.zip,
      service_category: input.serviceCategory,
      details: input.details || null,
      preferred_timing: input.preferredTiming || null,
      consent_record_id: consent.id,
      source_page: input.sourcePage || "/home-services",
      status: "validated",
    })
    .select("id")
    .single();

  if (requestError || !request) {
    return {
      status: "error",
      message: `We could not record your request. ${requestError?.message ?? ""}`,
    };
  }

  await supabase.from("site_event").insert({
    event_name: "home_service_request_submitted",
    path: input.sourcePage || "/home-services",
    zip: input.zip,
    metadata: { service_category: input.serviceCategory },
  });

  // 3. Attempt transmission. When JHP is not configured this records the
  //    attempt and leaves the request queued rather than sending anything.
  const delivery = await deliverServiceRequest(request.id as string);

  if (delivery.status === "delivered") {
    return {
      status: "success",
      message:
        "Your request has been sent to Jersey Home Pros. They will contact you directly about this service.",
    };
  }

  return {
    status: "success",
    queuedOnly: true,
    message:
      "Your request has been recorded and is waiting to be passed to Jersey Home Pros. Nothing has been shared with them yet, and our team can see it in the queue.",
  };
}
