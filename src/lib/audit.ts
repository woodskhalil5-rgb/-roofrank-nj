import "server-only";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Appends to the audit log. The table has no insert policy for any client
 * role, so this always runs with the service role on the server.
 *
 * Throws on failure. Callers in consequential paths (approval, publication,
 * permission changes) must not swallow the error: an action that cannot be
 * recorded should not be reported as done.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const supabase = createSupabaseAdminClient();

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    ip = forwarded ? forwarded.split(",")[0].trim() : null;
    userAgent = h.get("user-agent");
  } catch {
    // Outside a request context (for example a scheduled job).
  }

  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: entry.actorUserId ?? null,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    before_state: entry.before ?? null,
    after_state: entry.after ?? null,
    ip_address: ip,
    user_agent: userAgent,
  });

  if (error) {
    throw new Error(`Audit write failed (${entry.action}): ${error.message}`);
  }
}
