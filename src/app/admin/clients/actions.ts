"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export interface GrantState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/**
 * Gives an advertiser's account sight of their own numbers.
 *
 * Access is granted per listing or per brokerage, never in bulk, and it grants
 * reading only: a client can see tallies for their own listings and nothing
 * else, cannot see another advertiser's, and cannot change any part of the
 * directory. The database enforces that, not this form.
 */
export async function grantClientAccess(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const admin = await requireAdmin("/admin/clients");
  const supabase = await createSupabaseServerClient();

  const userId = String(formData.get("userId") ?? "").trim();
  const agentId = String(formData.get("agentId") ?? "").trim();
  const brokerageId = String(formData.get("brokerageId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!userId) {
    return { status: "error", message: "Choose the account to give access to." };
  }
  if (!agentId && !brokerageId) {
    return {
      status: "error",
      message:
        "Choose a listing or a brokerage. Access is never granted to everything.",
    };
  }

  const { error } = await supabase.from("client_access").insert({
    user_id: userId,
    agent_id: agentId || null,
    brokerage_id: brokerageId || null,
    granted_by: admin.id,
    note: note || null,
  });

  if (error) {
    if (
      error.message.includes("client_access") &&
      (error.code === "42P01" || error.message.includes("does not exist"))
    ) {
      return {
        status: "error",
        message:
          "Client access is not set up in the database yet. The migration in supabase/migrations needs applying first.",
      };
    }
    return { status: "error", message: `Could not grant access. ${error.message}` };
  }

  await recordAudit({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: "client_access.granted",
    entityType: "client_access",
    entityId: userId,
    after: {
      agent_id: agentId || null,
      brokerage_id: brokerageId || null,
      note: note || null,
    },
  });

  revalidatePath("/admin/clients");
  return { status: "ok", message: "Access granted." };
}

/** Withdraws access. The listing and everything on it is untouched. */
export async function revokeClientAccess(formData: FormData): Promise<void> {
  const admin = await requireAdmin("/admin/clients");
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("accessId") ?? "");
  if (!id) return;

  const { error } = await supabase
    .from("client_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return;

  await recordAudit({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: "client_access.revoked",
    entityType: "client_access",
    entityId: id,
    after: { revoked: true, listing_unchanged: true },
  });

  revalidatePath("/admin/clients");
}
