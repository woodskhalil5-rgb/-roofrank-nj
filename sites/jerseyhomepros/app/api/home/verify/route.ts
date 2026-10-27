import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { hashToken } from "../../../../lib/pros";
import { createSession, linkPastRequests, sessionCookie, type Homeowner } from "../../../../lib/homeowner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchanges a one-time sign-in link for a session. A POST (from a button on
 * /home/verify), never the email link's GET itself: mail scanners open links
 * before people do, and a GET that spent the token would lock people out.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const token = String(body.t ?? "");
  if (token.length < 20) return NextResponse.json({ error: "This link isn't valid." }, { status: 400 });

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });

  // Spend the token atomically: only an unused, unexpired row is updated.
  const { data: spent } = await db
    .from("homeowner_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("email")
    .maybeSingle();
  if (!spent) {
    return NextResponse.json({ error: "This link has expired or was already used. Request a new one." }, { status: 400 });
  }
  const email = (spent as { email: string }).email;

  const { data: row, error } = await db
    .from("homeowners")
    .upsert({ email, last_login_at: new Date().toISOString() }, { onConflict: "email" })
    .select("id, email, zip, reminders")
    .single();
  if (error || !row) return NextResponse.json({ error: "Couldn't sign you in. Try again." }, { status: 500 });
  const h = row as Homeowner;

  await linkPastRequests(h);
  const session = await createSession(h.id);
  if (!session) return NextResponse.json({ error: "Couldn't sign you in. Try again." }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie(session));
  return res;
}
