import { NextResponse } from "next/server";
import { listedProBySlug, logProEvent } from "../../../../lib/pros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Records one profile view. Always 204: the page never waits on or reacts to this. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { slug?: unknown };
    const pro = await listedProBySlug(String(body.slug ?? ""));
    if (pro) await logProEvent(req, pro.id, "view");
  } catch {
    /* ignore */
  }
  return new NextResponse(null, { status: 204 });
}
