import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser, isStaff, type SessionUser } from "@/lib/auth";

export interface ClientContext {
  user: SessionUser;
  /** Every listing this client may see. Empty means access exists but is bare. */
  agentIds: string[];
  /** True when the access table has not been created yet. */
  notConfigured: boolean;
}

/**
 * Who this signed-in client is allowed to see.
 *
 * The answer comes from the database, not from here: current_client_agent_ids()
 * reads client_access as the signed-in user, and the row-level policy on the
 * tallies applies the same test again. This function decides what to render;
 * it is not what keeps one brokerage out of another's numbers.
 */
export async function getClientContext(): Promise<ClientContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("current_client_agent_ids");

  if (error) {
    // The table and function may not exist yet in this environment.
    const missing =
      error.message.includes("client_access") ||
      error.message.includes("current_client_agent_ids") ||
      error.code === "42883" ||
      error.code === "42P01";
    if (missing) {
      return { user, agentIds: [], notConfigured: true };
    }
    return { user, agentIds: [], notConfigured: false };
  }

  return {
    user,
    agentIds: (data as string[] | null) ?? [],
    notConfigured: false,
  };
}

/**
 * Guard for the client portal.
 *
 * Staff are sent to their own dashboard rather than shown a client's view, so
 * nobody ends up reading a brokerage's numbers through the wrong door.
 */
export async function requireClient(
  nextPath = "/portal",
): Promise<ClientContext> {
  const context = await getClientContext();

  if (!context) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (isStaff(context.user.role)) {
    redirect("/admin");
  }
  if (context.notConfigured || context.agentIds.length === 0) {
    redirect("/no-access");
  }

  return context;
}
