import { NextResponse } from "next/server";
import { adminDb, adminEmails } from "../../../../lib/server";
import { hashToken } from "../../../../lib/pros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Road Pro account setup from the emailed one-time link (same pattern as the
 * contractor dashboard): token matched by hash, unexpired, cleared on use.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const token = String(body.token ?? ""), password = String(body.password ?? "");
  if (!token) return NextResponse.json({ error: "This link is missing its code." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const { data: row } = await db.from("road_pros")
    .select("id, email, active, auth_user_id, setup_token_expires")
    .eq("setup_token_hash", hashToken(token)).maybeSingle();
  if (!row || !row.setup_token_expires || new Date(row.setup_token_expires).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired or was already used. Ask Khalil for a new one." }, { status: 400 });
  }
  if (!row.active) return NextResponse.json({ error: "This account isn't active." }, { status: 403 });
  const email = String(row.email).trim().toLowerCase();
  // An admin address must never be turned into a rep login (or have its password set from here).
  if (adminEmails().includes(email)) return NextResponse.json({ error: "Use the admin sign-in for this address." }, { status: 400 });

  let userId: string | null = row.auth_user_id ?? null;
  if (userId) {
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) return NextResponse.json({ error: "Couldn't save that password. Try again." }, { status: 500 });
  } else {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.data.user) userId = created.data.user.id;
    else {
      for (let page = 1; page <= 10 && !userId; page++) {
        const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
        const hit = data?.users.find((u) => (u.email ?? "").toLowerCase() === email);
        if (hit) userId = hit.id;
        if (!data || data.users.length < 1000) break;
      }
      if (!userId) return NextResponse.json({ error: "Couldn't create the account. Try again." }, { status: 500 });
      const { error } = await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (error) return NextResponse.json({ error: "Couldn't save that password. Try again." }, { status: 500 });
    }
  }
  const { error: linkErr } = await db.from("road_pros")
    .update({ auth_user_id: userId, setup_token_hash: null, setup_token_expires: null }).eq("id", row.id);
  if (linkErr) return NextResponse.json({ error: "Couldn't finish setup. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, email });
}
