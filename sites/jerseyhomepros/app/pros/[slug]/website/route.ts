import { NextResponse } from "next/server";
import { listedProBySlug, logProEvent, safeWebsite } from "../../../../lib/pros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Visit website" on a profile: counted, then sent on. Only http(s) targets. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await listedProBySlug(slug);
  const origin = new URL(req.url).origin;
  const target = pro ? safeWebsite(pro.website) : null;
  if (!pro || !target) return NextResponse.redirect(`${origin}/pros/${pro?.slug ?? ""}`, 302);
  await logProEvent(req, pro.id, "website_click");
  return NextResponse.redirect(target, 302);
}
