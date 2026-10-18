"use server";

import { headers } from "next/headers";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { claimSchema, fieldErrors } from "@/lib/validation";

export interface ClaimState {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string>;
}

/**
 * Records an agent's claim on their listing.
 *
 * Runs with the public (anon) key. Row Level Security allows an insert into
 * profile_claim from anyone, and allows reading nothing back, so a claim can be
 * submitted without an account and without a service-role key. Nothing about
 * the listing changes here: an administrator verifies identity and brokerage
 * affiliation before any profile is altered.
 */
export async function submitClaim(
  _prev: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const parsed = claimSchema.safeParse({
    agentSlug: formData.get("agentSlug"),
    claimantName: formData.get("claimantName"),
    claimantEmail: formData.get("claimantEmail"),
    claimantPhone: formData.get("claimantPhone") ?? "",
    licenseNumber: formData.get("licenseNumber") ?? "",
    brokerage: formData.get("brokerage") ?? "",
    evidenceUrl: formData.get("evidenceUrl") ?? "",
    requestedChanges: formData.get("requestedChanges") ?? "",
    attestation: formData.get("attestation") === "on" ? true : undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  const input = parsed.data;
  const supabase = createSupabasePublicClient();

  const { data: agent } = await supabase
    .from("agent")
    .select("id, full_name")
    .eq("slug", input.agentSlug)
    .eq("status", "published")
    .maybeSingle();

  if (!agent) {
    return {
      status: "error",
      message:
        "We could not find a published listing at that address. Check the link, or search the directory for your listing.",
    };
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");

  const { error } = await supabase.from("profile_claim").insert({
    agent_id: agent.id,
    claimant_name: input.claimantName,
    claimant_email: input.claimantEmail,
    claimant_phone: input.claimantPhone || null,
    stated_license_number: input.licenseNumber || null,
    stated_brokerage: input.brokerage || null,
    evidence_url: input.evidenceUrl || null,
    verification_method: "manual_review",
    requested_changes: input.requestedChanges
      ? { note: input.requestedChanges }
      : null,
    ip_address: forwarded ? forwarded.split(",")[0].trim() : null,
    user_agent: requestHeaders.get("user-agent"),
  });

  if (error) {
    return {
      status: "error",
      message: `We could not record your claim. ${error.message}`,
    };
  }

  return {
    status: "success",
    message:
      "Thank you. A person will review this and may contact you or your brokerage to confirm it is really you. Nothing on your listing has changed yet.",
  };
}
