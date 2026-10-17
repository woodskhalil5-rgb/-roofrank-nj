import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

/**
 * Request-scoped Supabase client that carries the signed-in user's session.
 *
 * Every query made with this client is subject to Row Level Security, so a
 * employee session cannot read or change anything an administrator session can.
 * Privileged work uses the service-role client instead, and only on the server.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = serverEnv();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies cannot be written.
          // Session refresh is handled by middleware instead.
        }
      },
    },
  });
}

/**
 * Read-only client for public pages. Uses the anon key with no user session,
 * so it can only ever see rows a public visitor is allowed to see.
 */
export function createSupabasePublicClient() {
  const env = serverEnv();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        /* no session to persist */
      },
    },
  });
}
