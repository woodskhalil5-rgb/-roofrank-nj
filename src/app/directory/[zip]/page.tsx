import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const revalidate = 300;

interface Params {
  params: Promise<{ zip: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { zip } = await params;
  if (!/^[0-9]{5}$/.test(zip)) return { title: "Directory" };

  const supabase = createSupabasePublicClient();
  const { data: area } = await supabase
    .from("zip_area")
    .select("primary_city, county")
    .eq("zip", zip)
    .eq("is_target", true)
    .maybeSingle();

  const place = area?.primary_city ? `${area.primary_city}, NJ ${zip}` : zip;

  return {
    title: `Real estate agents serving ${place}`,
    description: `Verified real estate professionals serving ${place}, with recorded sources and a published ranking methodology.`,
    alternates: { canonical: `/directory/${zip}` },
  };
}

interface AgentRow {
  id: string;
  full_name: string;
  slug: string;
  headline: string | null;
  public_phone: string | null;
  website: string | null;
  license_number: string | null;
  license_status: string | null;
  license_verified_at: string | null;
  specialties: string[];
  claim_verified_at: string | null;
  brokerage: { name: string; slug: string } | null;
}

export default async function ZipDirectoryPage({ params }: Params) {
  const { zip } = await params;
  if (!/^[0-9]{5}$/.test(zip)) notFound();

  const supabase = createSupabasePublicClient();

  const { data: area } = await supabase
    .from("zip_area")
    .select("zip, primary_city, county")
    .eq("zip", zip)
    .eq("is_target", true)
    .maybeSingle();

  if (!area) {
    return (
      <main className="page">
        <div className="wrap-narrow">
          <h1>{zip}</h1>
          <div className="notice notice-info">
            This platform does not cover {zip} yet. Coverage is added one area at
            a time, once research has been reviewed and approved.
          </div>
          <Link className="btn btn-secondary" href="/directory">
            See covered areas
          </Link>
        </div>
      </main>
    );
  }

  const [{ data: agents }, { data: methodology }, { data: sponsored }] =
    await Promise.all([
      supabase
        .from("agent")
        .select(
          "id, full_name, slug, headline, public_phone, website, license_number, license_status, license_verified_at, specialties, claim_verified_at, brokerage:brokerage_id (name, slug)",
        )
        .eq("status", "published")
        .contains("service_zips", [zip])
        .order("full_name"),
      supabase
        .from("ranking_methodology")
        .select("version, summary")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("sponsored_placement")
        .select("id, label, agent_id, brokerage_id")
        .eq("zip", zip),
    ]);

  const rows = (agents ?? []) as unknown as AgentRow[];
  const sponsoredAgentIds = new Set(
    (sponsored ?? []).map((s) => s.agent_id as string).filter(Boolean),
  );

  // Editorial order comes from the methodology score. Sponsorship is rendered
  // as a visible label and is never mixed into the score.
  const scoresResult = rows.length
    ? await supabase
        .from("agent_zip_score")
        .select("agent_id, score")
        .eq("zip", zip)
        .in(
          "agent_id",
          rows.map((r) => r.id),
        )
    : null;

  const scoreById = new Map<string, number>(
    (scoresResult?.data ?? []).map((s) => [s.agent_id as string, Number(s.score)]),
  );
  const ordered = [...rows].sort((a, b) => {
    const diff = (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.full_name.localeCompare(b.full_name);
  });

  const place = `${area.primary_city as string}, NJ ${zip}`;

  return (
    <main className="page">
      <div className="wrap">
        <h1>Real estate agents serving {place}</h1>
        <p className="muted" style={{ maxWidth: 680 }}>
          This is a directory of local real estate professionals, not a ranking
          of top performers. Agents are ordered by how much of their
          professional record has been independently verified.{" "}
          <Link href="/methodology">
            Methodology {methodology?.version ?? ""}
          </Link>
        </p>

        {ordered.length === 0 ? (
          <div className="notice notice-info">
            No profiles for {place} have completed review and been published yet.
            Nothing is shown here until an administrator has approved it.
          </div>
        ) : (
          <div className="grid" style={{ marginTop: 20 }}>
            {ordered.map((agent, index) => {
              const verifiedLicence =
                agent.license_verified_at !== null &&
                agent.license_status !== null;

              return (
                <article key={agent.id} className="card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <h2 style={{ marginBottom: 2 }}>
                        <span className="muted" style={{ marginRight: 8 }}>
                          {index + 1}.
                        </span>
                        <Link href={`/agent/${agent.slug}`}>
                          {agent.full_name}
                        </Link>
                      </h2>
                      <p className="muted" style={{ margin: 0 }}>
                        {agent.brokerage?.name ?? "Brokerage not confirmed"}
                      </p>
                    </div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
                    >
                      {sponsoredAgentIds.has(agent.id) ? (
                        <span className="badge badge-sponsored">Sponsored</span>
                      ) : null}
                      {verifiedLicence ? (
                        <span className="badge badge-ok">Licence verified</span>
                      ) : (
                        <span className="badge badge-neutral">
                          Licence not verified
                        </span>
                      )}
                      {agent.claim_verified_at ? (
                        <span className="badge badge-ok">Claimed by agent</span>
                      ) : null}
                    </div>
                  </div>

                  {agent.headline ? (
                    <p style={{ marginTop: 10, marginBottom: 6 }}>
                      {agent.headline}
                    </p>
                  ) : null}

                  {agent.specialties.length > 0 ? (
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                      {agent.specialties.join(" · ")}
                    </p>
                  ) : null}

                  <div style={{ marginTop: 12 }}>
                    <Link className="btn btn-secondary" href={`/agent/${agent.slug}`}>
                      View profile and sources
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <hr className="rule" />
        <p className="muted">
          Is one of these profiles yours?{" "}
          <Link href="/claim">Claim it or request a correction</Link>. Agents are
          never charged to claim or correct a profile.
        </p>
      </div>
    </main>
  );
}
