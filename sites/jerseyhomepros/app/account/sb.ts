"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Browser Supabase client for sign-in only. It holds the anon key, which
 *  reaches no table: every read goes through /api/account with the token. */
let client: SupabaseClient | null = null;
export function sb(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}
