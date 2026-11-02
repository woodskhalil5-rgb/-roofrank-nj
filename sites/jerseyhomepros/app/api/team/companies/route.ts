import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/server";
import { requireTeamKey } from "../../../../lib/teamkeys";
import { SITE } from "../../../../lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  approved: "member",
  pending: "applied",
  unclaimed: "pre-listed (not a member yet)",
};

/** Every company already on JHP, so the team never pitches someone who's in. No phones, no homeowner data. */
export async function GET(req: Request) {
  if (!(await requireTeamKey(req, "companies"))) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const { data, error } = await db.from("roofers")
    .select("company, trade, city, website, status, slug, listed, license_number")
    .in("status", Object.keys(STATUS)).order("company");
  if (error) return NextResponse.json({ error: "Query failed." }, { status: 500 });
  const companies = (data ?? []).map((r) => ({
    company: r.company,
    trade: r.trade,
    city: r.city || null,
    website: r.website || null,
    hic_number: r.license_number || null,
    jhp_status: STATUS[r.status as string],
    // Pre-listed companies have a public profile they can claim: a strong outreach hook.
    profile_url: r.slug && (r.status === "unclaimed" || r.listed) ? `${SITE.url}/pros/${r.slug}` : null,
  }));
  return NextResponse.json({ count: companies.length, companies });
}
