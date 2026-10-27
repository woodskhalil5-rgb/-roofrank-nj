import { NextResponse } from "next/server";
import { clearSessionCookie, endSession } from "../../../../lib/homeowner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await endSession(req);
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
