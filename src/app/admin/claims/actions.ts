"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { computeAndStoreScore } from "@/lib/ranking";

export interface ClaimDecisionState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/**
 * Verifies or rejects an ownership claim.
 *
 * Verification is a human decision recorded against an administrator. A claim
 * never grants control of a profile on its own, and the decision note explains
 * how identity and brokerage affiliation were confirmed.
 */
export async function decideOnClaim(
  _prev: ClaimDecisionState,
  formData: FormData,
): Promise<ClaimDecisionState> {
  const user = await requireAdmin("/admin/claims");
  const supabase = await createSupabaseServerClient();

  const claimId = String(formData.get("claimId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!claimId || !decision) {
    return { status: "error", message: "Missing claim or decision." };
  }
  if (notes.length < 5) {
    return {
      status: "error",
      message:
        "Record how you verified (or could not verify) this person. The note is kept with the claim.",
    };
  }

  const { data: claim } = await supabase
    .from("profile_claim")
    .select("id, agent_id, claimant_email, claimant_name, status")
    .eq("id", claimId)
    .maybeSingle();

  if (!claim) return { status: "error", message: "Claim not found." };
  if (claim.status !== "pending") {
    return { status: "error", message: "This claim has already been decided." };
  }

  const now = new Date().toISOString();
  const verified = decision === "verify";

  const { error: claimError } = await supabase
    .from("profile_claim")
    .update({
      status: verified ? "verified" : "rejected",
      reviewed_by: user.id,
      reviewed_at: now,
      review_notes: notes,
    })
    .eq("id", claimId);

  if (claimError) return { status: "error", message: claimError.message };

  if (verified) {
    const { error: agentError } = await supabase
      .from("agent")
      .update({ claim_verified_at: now })
      .eq("id", claim.agent_id as string);

    if (agentError) {
      return {
        status: "error",
        message: `Claim marked verified, but the profile could not be updated: ${agentError.message}`,
      };
    }
    try {
      await computeAndStoreScore(claim.agent_id as string);
    } catch {
      // Score recomputation is not allowed to undo a verification.
    }
  }

  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: verified ? "claim.verified" : "claim.rejected",
    entityType: "agent",
    entityId: claim.agent_id as string,
    after: { claim_id: claimId, claimant: claim.claimant_email, notes },
  });

  revalidatePath("/admin/claims");
  revalidatePath(`/admin/claims/${claimId}`);

  return {
    status: "ok",
    message: verified
      ? "Claim verified. The profile now shows as claimed by the agent."
      : "Claim rejected. The profile is unchanged.",
  };
}
