import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses Row Level Security.
 *
 * Only for work that genuinely has no user session: writing the consent record
 * and service request behind the public form, draining the notification outbox,
 * and recording analytics events. Never import this into a client component,
 * and never use it to perform an action a signed-in user asked for — that must
 * go through their own session so their permissions apply.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const env = serverEnv();
  if (!env.serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Server-side writes that " +
        "require it (public form submissions, notification delivery) are " +
        "unavailable until it is set.",
    );
  }

  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application": "destiny-realty-intel" } },
  });
}

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
