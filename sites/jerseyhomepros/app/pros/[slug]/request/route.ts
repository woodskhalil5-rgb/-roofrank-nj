import { NextResponse } from "next/server";
import { listedProBySlug, logProEvent } from "../../../../lib/pros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Request a Free Estimate" on a profile. Counted here, then sent to the
 * trade's normal request form carrying the profile it came from. A plain link
 * plus a redirect means the click is counted with or without JavaScript.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await listedProBySlug(slug);
  const origin = new URL(req.url).origin;
  if (!pro) return NextResponse.redirect(`${origin}/pros`, 302);
  await logProEvent(req, pro.id, "request_click");
  const q = new URLSearchParams({ pro: pro.slug, pro_name: pro.company });
  return NextResponse.redirect(`${origin}/${pro.trade}?${q.toString()}#estimate`, 302);
}
