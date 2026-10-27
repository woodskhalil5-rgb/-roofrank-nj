import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { SITE } from "../../../../lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-click unsubscribe from Home Board reminder emails (CAN-SPAM). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const db = adminDb();
  let ok = false;
  if (db && /^[0-9a-f]{20,}$/.test(t)) {
    const { data } = await db.from("homeowners").update({ reminders: false }).eq("unsub_token", t).select("id");
    ok = (data ?? []).length > 0;
  }
  const msg = ok
    ? "You're unsubscribed from Home Board reminder emails. Your board and to-dos are unchanged."
    : "That unsubscribe link isn't valid. You can turn reminders off on your Home Board.";
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${SITE.brand}</title>` +
      `<body style="font-family:Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.6">` +
      `<h1 style="font-family:Georgia,serif;font-weight:400">${SITE.brand}</h1><p>${msg}</p><p><a href="${SITE.url}/home">Go to your Home Board</a></p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
