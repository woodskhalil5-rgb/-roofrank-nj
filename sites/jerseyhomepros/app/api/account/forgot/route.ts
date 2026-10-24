import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { issueAccountLink } from "../../../../lib/pros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Escapes ILIKE wildcards so an email is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

/**
 * Emails a setup / reset link to an approved provider's address on file.
 *
 * Always answers the same way, whether or not the email belongs to anyone,
 * so this cannot be used to learn which companies are in the network. A new
 * link is not issued if one was issued in the last five minutes.
 */
export async function POST(req: Request) {
  const same = NextResponse.json({
    ok: true,
    message: "If that email belongs to an approved company in the network, a link is on its way. It expires in 72 hours.",
  });

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = String(body.email ?? "").trim();
  } catch {
    return same;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return same;

  const db = adminDb();
  if (!db) return same;

  const { data: row } = await db
    .from("roofers")
    .select("id, auth_user_id, setup_token_expires")
    .ilike("email", escapeLike(email))
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  if (!row) return same;

  const issuedRecently =
    row.setup_token_expires &&
    new Date(row.setup_token_expires).getTime() > Date.now() + (72 * 60 - 5) * 60 * 1000;
  if (issuedRecently) return same;

  const out = await issueAccountLink(row.id, row.auth_user_id ? "reset" : "invite");
  if (!out.ok) console.error(`[account] link send failed provider=${row.id} error=${out.error}`);
  return same;
}
