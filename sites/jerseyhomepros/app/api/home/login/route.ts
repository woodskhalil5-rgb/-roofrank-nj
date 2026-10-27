import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { normEmail, sendSignInLink } from "../../../../lib/homeowner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Emails a one-time Home Board sign-in link. Always answers the same way
 * whether or not the address has an account, so the form can't be used to
 * find out who uses the site.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = normEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 120);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: perEmail } = await db
    .from("homeowner_login_tokens")
    .select("token_hash", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", hourAgo);
  let perIp = 0;
  if (ip) {
    const { count } = await db
      .from("homeowner_login_tokens")
      .select("token_hash", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", hourAgo);
    perIp = count ?? 0;
  }
  if ((perEmail ?? 0) >= 4 || (perIp ?? 0) >= 15) {
    return NextResponse.json({ error: "Too many sign-in emails. Check your inbox, or try again in an hour." }, { status: 429 });
  }

  const sent = await sendSignInLink(email, ip);
  if (!sent.ok) {
    console.error(`[home-login] send failed: ${"error" in sent ? sent.error : "unknown"}`);
    return NextResponse.json({ error: "We couldn't send the email. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
