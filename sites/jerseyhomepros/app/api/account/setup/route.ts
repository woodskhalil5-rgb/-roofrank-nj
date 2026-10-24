import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { hashToken } from "../../../../lib/pros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finishes account setup or a password reset from an emailed link.
 *
 * The token is matched by hash, must be unexpired, and is cleared on success
 * so the link works once. The first time, this creates the Supabase auth user
 * for the provider's email and links it; after that it only sets the password.
 */
export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!token) return NextResponse.json({ error: "This link is missing its code." }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  }

  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  const { data: row } = await db
    .from("roofers")
    .select("id, email, status, auth_user_id, setup_token_expires")
    .eq("setup_token_hash", hashToken(token))
    .maybeSingle();

  const expired = !row?.setup_token_expires || new Date(row.setup_token_expires).getTime() < Date.now();
  if (!row || expired) {
    return NextResponse.json(
      { error: "This link has expired or was already used. Ask for a new one from the sign-in page." },
      { status: 400 }
    );
  }
  if (row.status !== "approved") {
    return NextResponse.json({ error: "This account isn't active." }, { status: 403 });
  }

  const email = String(row.email).trim().toLowerCase();
  let userId: string | null = row.auth_user_id ?? null;

  if (userId) {
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) {
      console.error(`[account] password update failed provider=${row.id} error=${error.message}`);
      return NextResponse.json({ error: "Couldn't save that password. Try again." }, { status: 500 });
    }
  } else {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.data.user) {
      userId = created.data.user.id;
    } else {
      // The email may already have an auth user (for example the operator's
      // own address). Find it and link it rather than failing.
      for (let page = 1; page <= 10 && !userId; page++) {
        const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
        const hit = data?.users.find((u) => (u.email ?? "").toLowerCase() === email);
        if (hit) userId = hit.id;
        if (!data || data.users.length < 1000) break;
      }
      if (!userId) {
        console.error(`[account] create user failed provider=${row.id} error=${created.error?.message}`);
        return NextResponse.json({ error: "Couldn't create the account. Try again." }, { status: 500 });
      }
      const { error } = await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (error) {
        return NextResponse.json({ error: "Couldn't save that password. Try again." }, { status: 500 });
      }
    }
  }

  const { error: linkErr } = await db
    .from("roofers")
    .update({ auth_user_id: userId, setup_token_hash: null, setup_token_expires: null })
    .eq("id", row.id);
  if (linkErr) {
    console.error(`[account] link failed provider=${row.id} error=${linkErr.message}`);
    return NextResponse.json({ error: "Couldn't finish setup. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}
