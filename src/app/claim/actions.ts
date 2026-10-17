"use server";

import { headers } from "next/headers";
import { createSupabaseAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { queueNotification } from "@/lib/notify";
import { serverEnv } from "@/lib/env";
import { claimSchema, fieldErrors } from "@/lib/validation";

export interface ClaimState {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string>;
}

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

  if (!hasServiceRole()) {
    return {
      status: "error",
      message:
        "Claims cannot be accepted yet because the server is missing its database credentials. Nothing was recorded.",
    };
  }

  const input = parsed.data;
  const supabase = createSupabaseAdminClient();

  const { data: agent } = await supabase
    .from("agent")
    .select("id, full_name, slug")
    .eq("slug", input.agentSlug)
    .eq("status", "published")
    .maybeSingle();

  if (!agent) {
    return {
      status: "error",
      message:
        "We could not find a published profile with that address. Check the link, or search the directory for your profile.",
    };
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");

  const { data: claim, error } = await supabase
    .from("profile_claim")
    .insert({
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
    })
    .select("id")
    .single();

  if (error || !claim) {
    return {
      status: "error",
      message: `We could not record your claim. ${error?.message ?? ""}`,
    };
  }

  await supabase.from("site_event").insert({
    event_name: "profile_claim_submitted",
    path: `/claim`,
    agent_id: agent.id,
    metadata: { agent_slug: agent.slug },
  });

  const env = serverEnv();
  try {
    await queueNotification({
      kind: "profile_claim_submitted",
      recipient: env.adminEmail,
      subject: `Profile claim: ${agent.full_name}`,
      bodyText: [
        `A claim has been submitted for ${agent.full_name}.`,
        ``,
        `Claimant: ${input.claimantName} <${input.claimantEmail}>`,
        `Stated licence: ${input.licenseNumber || "not provided"}`,
        `Stated brokerage: ${input.brokerage || "not provided"}`,
        `Evidence: ${input.evidenceUrl || "not provided"}`,
        ``,
        `Review it (sign-in required): ${env.siteUrl}/admin/claims/${claim.id}`,
        ``,
        `No profile changes have been made. Verify identity and brokerage`,
        `affiliation before granting control of this profile.`,
      ].join("\n"),
      relatedType: "profile_claim",
      relatedId: claim.id as string,
    });
  } catch {
    // The claim is recorded and visible in the dashboard regardless of email.
  }

  return {
    status: "success",
    message:
      "Thank you. Your claim has been recorded and a person will review it. We verify identity and brokerage affiliation before changing any profile, so nothing on your profile has changed yet.",
  };
}
