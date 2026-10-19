import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import Track from "@/components/Track";

export const revalidate = 300;

interface Params {
  params: Promise<{ zip: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { zip } = await params;
  if (!/^[0-9]{5}$/.test(zip)) return { title: "Find an agent" };

  const supabase = createSupabasePublicClient();
  const { data: area } = await supabase
    .from("zip_area")
    .select("primary_city")
    .eq("zip", zip)
    .eq("is_target", true)
    .maybeSingle();

  const place = area?.primary_city ? `${area.primary_city}, NJ ${zip}` : zip;

  return {
    title: `Real estate agents in ${place}`,
    description: `Local real estate agents serving ${place}, with licences checked against the New Jersey state register.`,
    alternates: { canonical: `/directory/${zip}` },
  };
}

interface AgentRow {
  id: string;
  full_name: string;
  slug: string;
  headline: string | null;
  public_phone: string | null;
  license_status: string | null;
  license_verified_at: string | null;
  headshot_url: string | null;
  specialties: string[];
  claim_verified_at: string | null;
  brokerage: { name: string } | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
      <main className="wrap-narrow page">
        <Track event="zip_search" zip={zip} />
        <h1 style={{ maxWidth: "none" }}>We don&apos;t cover {zip} yet</h1>
        <p className="lede">
          We verify every agent by hand before listing them, so towns open one at
          a time. Nothing is listed here until that work is done.
        </p>
        <div className="btn-row">
          <Link className="btn" href="/directory">
            See which towns are open
          </Link>
          <Link className="btn btn-secondary" href="/methodology">
            How we check agents
          </Link>
        </div>
      </main>
    );
  }

  const [{ data: agents }, { data: sponsored }] = await Promise.all([
    supabase
      .from("agent")
      .select(
        "id, full_name, slug, headline, public_phone, license_status, license_verified_at, headshot_url, specialties, claim_verified_at, brokerage:brokerage_id (name)",
      )
      .eq("status", "published")
      .contains("service_zips", [zip])
      .order("full_name"),
    supabase.from("sponsored_placement").select("agent_id").eq("zip", zip),
  ]);

  const rows = (agents ?? []) as unknown as AgentRow[];
  const sponsoredIds = new Set(
    (sponsored ?? []).map((s) => s.agent_id as string).filter(Boolean),
  );

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

  const town = area.primary_city as string;

  return (
    <main>
      <Track event="zip_search" zip={zip} />
      <section className="hero">
        <div className="wrap">
          <h1 style={{ maxWidth: "18ch" }}>Real estate agents in {town}</h1>
          <p className="lede">
            {ordered.length > 0
              ? `${ordered.length} agent${ordered.length === 1 ? "" : "s"} serving ${zip}. Licences checked against the state register.`
              : `We're still checking agents for ${zip}.`}
          </p>
          <div className="searchbox" style={{ marginTop: 20 }}>
            <form action="/directory" method="get">
              <label htmlFor="zip">Try another ZIP code</label>
              <div className="searchbox-row">
                <input
                  id="zip"
                  name="zip"
                  type="search"
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  placeholder="ZIP code"
                  required
                />
                <button className="btn" type="submit">
                  Find agents
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <div className="wrap page">
        {ordered.length === 0 ? (
          <div className="empty">
            <h3>No agents listed in {town} yet</h3>
            <p>
              Every listing is checked by a person before it goes live, and none
              have finished review for this area. We would rather show you nothing
              than show you agents we haven&apos;t verified.
            </p>
            <Link className="btn btn-secondary" href="/directory">
              See which towns are open
            </Link>
          </div>
        ) : (
          <>
            {ordered.map((agent, index) => {
              const licenceOk =
                agent.license_verified_at !== null && agent.license_status !== null;
              const isSponsored = sponsoredIds.has(agent.id);

              return (
                <article
                  key={agent.id}
                  className={isSponsored ? "agent-card is-sponsored" : "agent-card"}
                >
                  <div className="avatar" aria-hidden="true">
                    {initials(agent.full_name)}
                  </div>

                  <div className="agent-body">
                    <h2 className="agent-name">
                      <span className="rank-no">{index + 1}</span>
                      <Link href={`/agent/${agent.slug}`}>{agent.full_name}</Link>
                    </h2>
                    <p className="agent-firm">
                      {agent.brokerage?.name ?? "Brokerage not confirmed"}
                    </p>

                    {agent.headline ? (
                      <p style={{ marginTop: 10 }}>{agent.headline}</p>
                    ) : null}

                    <div className="chips">
                      {licenceOk ? (
                        <span className="chip chip-ok">Licence verified</span>
                      ) : (
                        <span className="chip chip-warn">Licence not verified</span>
                      )}
                      {agent.claim_verified_at ? (
                        <span className="chip chip-ok">Claimed by agent</span>
                      ) : null}
                      {isSponsored ? (
                        <span className="chip chip-gold">Sponsored</span>
                      ) : null}
                      {agent.specialties.slice(0, 3).map((s) => (
                        <span className="chip" key={s}>
                          {s}
                        </span>
                      ))}
                    </div>

                    <div className="agent-actions">
                      <Link className="btn btn-small" href={`/agent/${agent.slug}`}>
                        View listing
                      </Link>
                      {agent.public_phone ? (
                        <a
                          className="btn btn-secondary btn-small"
                          href={`tel:${agent.public_phone}`}
                        >
                          {agent.public_phone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}

            <p className="muted" style={{ marginTop: 24 }}>
              Ordered by how much of each agent&apos;s record we verified, never by
              payment. <Link href="/methodology">How we check agents</Link>
            </p>
          </>
        )}

        <hr className="rule" />
        <div className="card card-warm">
          <h3>Is one of these you?</h3>
          <p className="muted">
            Claiming your listing is free, and so is correcting it. You will never
            be charged to fix your own details.
          </p>
          <Link className="btn" href="/claim">
            Claim your listing
          </Link>
        </div>
      </div>
    </main>
  );
}
