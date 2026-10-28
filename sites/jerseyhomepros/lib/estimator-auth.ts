import { createClient } from "@supabase/supabase-js";
import { adminDb, adminEmails } from "./server";

export type RoadPro = {
  id: string; name: string; email: string; phone: string; active: boolean;
  bg_status: "pending" | "clear" | "not_clear"; commission_pct: number | null;
};

/** Who is using the estimator: the operator (admin list) or an active Road Pro. */
export type EstimatorUser =
  | { role: "admin"; email: string }
  | { role: "rep"; email: string; rep: RoadPro };

export async function requireEstimator(req: Request): Promise<EstimatorUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const email = data.user.email.toLowerCase();
  if (adminEmails().includes(email)) return { role: "admin", email };

  const db = adminDb();
  if (!db) return null;
  const { data: rep } = await db
    .from("road_pros")
    .select("id, name, email, phone, active, bg_status, commission_pct")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!rep || !rep.active) return null;
  return { role: "rep", email, rep: rep as RoadPro };
}
