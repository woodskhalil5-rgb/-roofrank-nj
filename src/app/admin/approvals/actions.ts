"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { computeAndStoreScore } from "@/lib/ranking";

export interface DecisionState {
  status: "idle" | "ok" | "error";
  message?: string;
}

type Decision = "approve_and_publish" | "approve_only" | "reject" | "request_changes" | "flag";

/**
 * Records an administrator decision on a draft profile.
 *
 * Authorization is checked three times over: this action requires an admin
 * session, RLS restricts who may update the row, and a database trigger
 * refuses any approval or publication that does not come from an
 * administrator or that skips the approved state.
 */
export async function decideOnApproval(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const user = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const approvalId = String(formData.get("approvalId") ?? "");
  const decision = String(formData.get("decision") ?? "") as Decision;
  const notes = String(formData.get("notes") ?? "").trim();

  if (!approvalId || !decision) {
    return { status: "error", message: "Missing approval or decision." };
  }

  if ((decision === "reject" || decision === "request_changes") && notes.length < 5) {
    return {
      status: "error",
      message:
        "Add a short note explaining the decision — it is sent to whoever prepared the draft and kept in the audit history.",
    };
  }

  const { data: approval, error: approvalError } = await supabase
    .from("approval_request")
    .select("id, subject, subject_id, status")
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalError || !approval) {
    return { status: "error", message: "That approval request could not be found." };
  }
  if (approval.status !== "pending") {
    return { status: "error", message: "A decision has already been recorded for this request." };
  }

  const agentId = approval.subject_id as string;
  const { data: before } = await supabase
    .from("agent")
    .select("id, full_name, slug, status, approved_by, approved_at, published_at")
    .eq("id", agentId)
    .maybeSingle();

  if (!before) {
    return { status: "error", message: "The profile for this request no longer exists." };
  }

  const now = new Date().toISOString();

  // ---- Flag for extra verification: no status change, stays pending. -------
  if (decision === "flag") {
    const { error } = await supabase
      .from("approval_request")
      .update({ flagged_for_verification: true, decision_notes: notes || null })
      .eq("id", approvalId);

    if (error) return { status: "error", message: error.message };

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "approval.flagged_for_verification",
      entityType: "agent",
      entityId: agentId,
      after: { notes },
    });

    revalidatePath("/admin/approvals");
    revalidatePath(`/admin/approvals/${approvalId}`);
    return { status: "ok", message: "Flagged for additional verification. It stays in the queue." };
  }

  // ---- Reject / request corrections ----------------------------------------
  if (decision === "reject" || decision === "request_changes") {
    const newStatus = decision === "reject" ? "rejected" : "changes_requested";

    const { error: agentError } = await supabase
      .from("agent")
      .update({ status: newStatus, status_reason: notes })
      .eq("id", agentId);

    if (agentError) return { status: "error", message: agentError.message };

    const { error: reqError } = await supabase
      .from("approval_request")
      .update({
        status: decision === "reject" ? "rejected" : "changes_requested",
        decided_by: user.id,
        decided_at: now,
        decision_notes: notes,
      })
      .eq("id", approvalId);

    if (reqError) return { status: "error", message: reqError.message };

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: decision === "reject" ? "agent.rejected" : "agent.changes_requested",
      entityType: "agent",
      entityId: agentId,
      before: { status: before.status },
      after: { status: newStatus, notes },
    });

    revalidatePath("/admin/approvals");
    revalidatePath("/admin/agents");
    return {
      status: "ok",
      message:
        decision === "reject"
          ? "Rejected. The profile will not be published."
          : "Returned for corrections.",
    };
  }

  // ---- Approve (and optionally publish) -------------------------------------
  // Step 1: approval must be recorded before publication is even possible.
  const { error: approveError } = await supabase
    .from("agent")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: now,
      status_reason: notes || null,
    })
    .eq("id", agentId);

  if (approveError) {
    return {
      status: "error",
      message: `Approval was refused: ${approveError.message}`,
    };
  }

  let published = false;
  if (decision === "approve_and_publish") {
    const { error: publishError } = await supabase
      .from("agent")
      .update({ status: "published", published_at: now })
      .eq("id", agentId);

    if (publishError) {
      // The approval stands; publication did not happen. Say so plainly.
      await recordAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "agent.publish_failed",
        entityType: "agent",
        entityId: agentId,
        after: { error: publishError.message },
      });
      return {
        status: "error",
        message: `Approved, but publishing failed: ${publishError.message}`,
      };
    }
    published = true;
  }

  const { error: reqError } = await supabase
    .from("approval_request")
    .update({
      status: "approved",
      decided_by: user.id,
      decided_at: now,
      decision_notes: notes || null,
    })
    .eq("id", approvalId);

  if (reqError) return { status: "error", message: reqError.message };

  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: published ? "agent.approved_and_published" : "agent.approved",
    entityType: "agent",
    entityId: agentId,
    before: { status: before.status },
    after: { status: published ? "published" : "approved", approved_by: user.id },
  });

  // Scores are recomputed from recorded evidence only.
  try {
    await computeAndStoreScore(agentId);
  } catch {
    // A scoring failure must not undo an approval; it is visible in the
    // profile page as a missing score.
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/agents");
  revalidatePath(`/agent/${before.slug}`);
  revalidatePath("/");

  return {
    status: "ok",
    message: published
      ? "Approved and published. It is now live on the public site."
      : "Approved. It is not published yet.",
  };
}
