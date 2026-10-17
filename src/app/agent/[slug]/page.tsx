import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const revalidate = 300;

interface Params {
  params: Promise<{ slug: string }>;
}

const VERIFICATION_LABEL: Record<string, { text: string; cls: string }> = {
  verified: { text: "Verified", cls: "badge-ok" },
  self_reported: { text: "Self-reported", cls: "badge-neutral" },
  third_party: { text: "Third-party claim", cls: "badge-neutral" },
  ai_generated: { text: "AI-generated summary", cls: "badge-warn" },
  unverified: { text: "Unverified", cls: "badge-warn" },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createSupabasePublicClient();
  const { data } = await supabase
    .from("agent")
    .select("full_name, headline, service_zips")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!data) return { title: "Profile not available", robots: { index: false } };

  return {
    title: `${data.full_name} — real estate professional`,
    description:
      data.headline ??
      `Verified directory profile for ${data.full_name}, with recorded sources for each listed detail.`,
    alternates: { canonical: `/agent/${slug}` },
  };
}

export default async function AgentProfilePage({ params }: Params) {
  const { slug } = await params;
  const supabase = createSupabasePublicClient();

  const { data: agent } = await supabase
    .from("agent")
    .select(
      "id, full_name, slug, headline, bio, public_email, public_phone, website, profile_url, license_number, license_state, license_status, license_verified_at, specialties, service_zips, claim_verified_at, published_at, brokerage:brokerage_id (name, website, city, state)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!agent) notFound();

  const brokerage = agent.brokerage as unknown as {
    name: string;
    website: string | null;
    city: string | null;
    state: string | null;
  } | null;

  const [{ data: evidence }, { data: sponsored }] = await Promise.all([
    supabase
      .from("agent_public_evidence")
      .select("field_name, field_value, source_url, retrieved_at, verification, source_name")
      .eq("agent_id", agent.id)
      .order("field_name"),
    supabase
      .from("sponsored_placement")
      .select("id, label")
      .eq("agent_id", agent.id)
      .limit(1),
  ]);

  const citations = evidence ?? [];
  const isSponsored = (sponsored ?? []).length > 0;

  return (
    <main className="page">
      <div className="wrap">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          {isSponsored ? <span className="badge badge-sponsored">Sponsored placement</span> : null}
          {agent.license_verified_at ? (
            <span className="badge badge-ok">Licence verified</span>
          ) : (
            <span className="badge badge-neutral">Licence not verified</span>
          )}
          {agent.claim_verified_at ? (
            <span className="badge badge-ok">Claimed by this agent</span>
          ) : (
            <span className="badge badge-neutral">Not yet claimed</span>
          )}
        </div>

        <h1 style={{ marginBottom: 4 }}>{agent.full_name as string}</h1>
        <p className="muted" style={{ fontSize: "0.95rem" }}>
          {brokerage?.name ?? "Brokerage affiliation not confirmed"}
          {brokerage?.city ? ` — ${brokerage.city}, ${brokerage.state ?? "NJ"}` : ""}
        </p>

        {agent.headline ? <p style={{ fontSize: "1.02rem" }}>{agent.headline as string}</p> : null}

        <div className="grid grid-2" style={{ marginTop: 18 }}>
          <div className="card">
            <h3>Professional details</h3>
            <table>
              <tbody>
                <tr>
                  <td className="muted" style={{ width: "42%" }}>Licence number</td>
                  <td>{(agent.license_number as string) ?? <span className="muted">Not recorded</span>}</td>
                </tr>
                <tr>
                  <td className="muted">Licence status</td>
                  <td>
                    {agent.license_status ? (
                      <>
                        {agent.license_status as string}
                        {agent.license_verified_at ? (
                          <div className="muted mono">
                            checked {new Date(agent.license_verified_at as string).toLocaleDateString("en-US")}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">Not verified</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="muted">Service areas</td>
                  <td>
                    {(agent.service_zips as string[]).length > 0 ? (
                      (agent.service_zips as string[]).map((z) => (
                        <Link key={z} href={`/directory/${z}`} style={{ marginRight: 8 }}>
                          {z}
                        </Link>
                      ))
                    ) : (
                      <span className="muted">Not recorded</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="muted">Specialties</td>
                  <td>
                    {(agent.specialties as string[]).length > 0
                      ? (agent.specialties as string[]).join(", ")
                      : <span className="muted">Not recorded</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Contact</h3>
            <p className="muted" style={{ fontSize: "0.82rem" }}>
              Publicly listed business contact details only.
            </p>
            <table>
              <tbody>
                <tr>
                  <td className="muted" style={{ width: "32%" }}>Phone</td>
                  <td>{(agent.public_phone as string) ?? <span className="muted">Not listed</span>}</td>
                </tr>
                <tr>
                  <td className="muted">Email</td>
                  <td>{(agent.public_email as string) ?? <span className="muted">Not listed</span>}</td>
                </tr>
                <tr>
                  <td className="muted">Website</td>
                  <td>
                    {agent.website ? (
                      <a href={agent.website as string} rel="nofollow noopener noreferrer" target="_blank">
                        {agent.website as string}
                      </a>
                    ) : (
                      <span className="muted">Not listed</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {agent.bio ? (
          <section className="section" style={{ marginTop: 24 }}>
            <h2>About</h2>
            <p>{agent.bio as string}</p>
          </section>
        ) : null}

        <section className="section">
          <h2>Where this information came from</h2>
          {citations.length === 0 ? (
            <div className="notice notice-warn">
              No per-field sources have been recorded for this profile yet. Until
              they are, treat the details above as unverified.
            </div>
          ) : (
            <div className="table-wrap card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Retrieved</th>
                  </tr>
                </thead>
                <tbody>
                  {citations.map((c, i) => {
                    const label =
                      VERIFICATION_LABEL[c.verification as string] ??
                      VERIFICATION_LABEL.unverified;
                    return (
                      <tr key={`${c.field_name}-${i}`}>
                        <td>{c.field_name as string}</td>
                        <td>
                          <span className={`badge ${label.cls}`}>{label.text}</span>
                        </td>
                        <td>
                          {c.source_url ? (
                            <a href={c.source_url as string} rel="nofollow noopener noreferrer" target="_blank">
                              {(c.source_name as string) ?? "source"}
                            </a>
                          ) : (
                            ((c.source_name as string) ?? <span className="muted">Not recorded</span>)
                          )}
                        </td>
                        <td className="mono">
                          {new Date(c.retrieved_at as string).toLocaleDateString("en-US")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <hr className="rule" />
        <p className="muted">
          {agent.claim_verified_at
            ? "This agent has claimed this profile and their identity and brokerage affiliation were verified by an administrator."
            : "This profile was compiled from the sources listed above and has not been claimed."}{" "}
          <Link href={`/claim?agent=${agent.slug}`}>Claim this profile or request a correction</Link>
        </p>
      </div>
    </main>
  );
}
