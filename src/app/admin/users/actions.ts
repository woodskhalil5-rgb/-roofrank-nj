"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export interface RoleState {
  status: "idle" | "ok" | "error";
  message?: string;
}

const ROLES = ["owner", "admin", "employee", "readonly"] as const;

/** Changes a user's role. Administrators only, and always audited. */
export async function changeRole(
  _prev: RoleState,
  formData: FormData,
): Promise<RoleState> {
  const actor = await requireAdmin("/admin/users");
  const supabase = await createSupabaseServerClient();

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId || !ROLES.includes(role as (typeof ROLES)[number])) {
    return { status: "error", message: "Choose a valid role." };
  }

  if (userId === actor.id) {
    return {
      status: "error",
      message:
        "You cannot change your own role. Ask another administrator, so the platform is never left without one.",
    };
  }

  const { data: before } = await supabase
    .from("app_user")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (!before) return { status: "error", message: "User not found." };

  const { error } = await supabase
    .from("app_user")
    .update({ role })
    .eq("id", userId);

  if (error) return { status: "error", message: error.message };

  await recordAudit({
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: "user.role_changed",
    entityType: "app_user",
    entityId: userId,
    before: { role: before.role },
    after: { role },
  });

  revalidatePath("/admin/users");
  return {
    status: "ok",
    message: `${before.email} is now "${role}".`,
  };
}
