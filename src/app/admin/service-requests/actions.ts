"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { deliverServiceRequest, retryDueServiceRequests } from "@/lib/jhp";
import { jhpConfig } from "@/lib/env";

export interface RetryState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/** Retries one request, or everything that is due. */
export async function retryDelivery(
  _prev: RetryState,
  formData: FormData,
): Promise<RetryState> {
  const user = await requireAdmin("/admin/service-requests");
  const requestId = String(formData.get("requestId") ?? "");
  const config = jhpConfig();

  if (!config.configured) {
    return {
      status: "error",
      message:
        "Jersey Home Pros is not configured, so there is nothing to retry against. Verify JHP's endpoint, authentication and request schema with its administrator first, then set JHP_API_BASE_URL, JHP_API_KEY and JHP_INTEGRATION_ENABLED=true.",
    };
  }

  if (requestId) {
    const result = await deliverServiceRequest(requestId);
    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "service_request.retry",
      entityType: "service_request",
      entityId: requestId,
      after: { delivered: result.delivered, error: result.error ?? null },
    });

    revalidatePath("/admin/service-requests");
    return result.delivered
      ? { status: "ok", message: "Delivered to Jersey Home Pros." }
      : { status: "error", message: result.error ?? "Delivery failed." };
  }

  const summary = await retryDueServiceRequests();
  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "service_request.retry_batch",
    entityType: "service_request",
    after: summary,
  });

  revalidatePath("/admin/service-requests");
  return {
    status: "ok",
    message: `Attempted ${summary.attempted}: ${summary.delivered} delivered, ${summary.stillFailing} still failing.`,
  };
}
