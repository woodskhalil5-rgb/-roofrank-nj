import "server-only";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuditEntry {
  actorUserId: string;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Appends to the audit log using the acting user's own session.
 *
 * The insert policy requires actor_user_id to equal auth.uid(), so an entry
 * cannot be written on somebody else's behalf, and there is no update or
 * delete policy for any client role — the log is append-only.
 *
 * Throws on failure. Callers in consequential paths (approval, publication,
 * permission changes) must not swallow the error: an action that cannot be
 * recorded should not be reported as done.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const supabase = await createSupabaseServerClient();

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    ip = forwarded ? forwarded.split(",")[0].trim() : null;
    userAgent = h.get("user-agent");
  } catch {
    // Outside a request context.
  }

  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: entry.actorUserId,
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
