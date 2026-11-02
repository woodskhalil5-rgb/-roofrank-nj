import { createHash } from "node:crypto";
import { adminDb } from "./server";

/**
 * Keys for the DMG AI team room (dmg-team-room / Supabase "destiny-realty-intel").
 * Read-only, scoped: "companies" = who is already on JHP; "stats" = counts only.
 * Neither scope ever returns homeowner details, phone numbers, or billing.
 * Only the SHA-256 of each key is stored; Khalil can switch a key off in /admin.
 */
export type TeamScope = "companies" | "stats";

export async function requireTeamKey(req: Request, scope: TeamScope): Promise<string | null> {
  const raw = (req.headers.get("x-jhp-team-key") ?? "").trim();
  if (raw.length < 32) return null;
  const db = adminDb();
  if (!db) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const { data } = await db.from("team_keys").select("id, name, scopes, active").eq("key_hash", hash).maybeSingle();
  if (!data || !data.active || !(data.scopes as string[]).includes(scope)) return null;
  await db.from("team_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return String(data.name);
}
