import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "owner" | "admin" | "employee" | "readonly";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
}

/** Returns the signed-in user with their application role, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("app_user")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.is_active === false) return null;

  return {
    id: profile.id as string,
    email: profile.email as string,
    fullName: (profile.full_name as string | null) ?? null,
    role: profile.role as AppRole,
  };
}

const STAFF: AppRole[] = ["owner", "admin", "employee"];
const ADMIN: AppRole[] = ["owner", "admin"];

export function isStaff(role: AppRole): boolean {
  return STAFF.includes(role);
}

export function isAdmin(role: AppRole): boolean {
  return ADMIN.includes(role);
}

/**
 * Guard for any internal page. Redirects to sign-in when there is no session,
 * and to a no-access page when the account exists but has no staff role.
 *
 * This is a server-side check. It is layered on top of RLS, not instead of it.
 */
export async function requireStaff(nextPath = "/admin"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (!isStaff(user.role)) {
    redirect("/no-access");
  }
  return user;
}

/** Guard for approval, publication, contract and permission changes. */
export async function requireAdmin(nextPath = "/admin"): Promise<SessionUser> {
  const user = await requireStaff(nextPath);
  if (!isAdmin(user.role)) {
    redirect("/no-access");
  }
  return user;
}
