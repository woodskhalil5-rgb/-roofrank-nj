import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import Track from "@/components/Track";
import TrackedLink from "@/components/TrackedLink";

export const revalidate = 300;

interface Params {
  params: Promise<{ slug: string }>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createSupabasePublicClient();
  const { data } = await supabase
    .from("agent")
    .select("full_name, headline, service_zips")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!data) {
    return { title: "Listing not available", robots: { index: false } };
  }

  return {
    title: `${data.full_name} — real estate agent`,
    description:
      (data.headline as string | null) ??
      `${data.full_name}, a licensed New Jersey real estate agent. Licence checked against the state register.`,
    alternates: { canonical: `/agent/${slug}` },
  };
}

const VERIFICATION_LABEL: Record<string, { text: string; cls: string }> = {
  verified: { text: "Confirmed", cls: "chip chip-ok" },
  self_reported: { text: "Agent told us", cls: "chip" },
  third_party: { text: "Third-party", cls: "chip" },
  ai_generated: { text: "Summary", cls: "chip chip-warn" },
  unverified: { text: "Unconfirmed", cls: "chip chip-warn" },
};

const FIELD_LABEL: Record<string, string> = {
  brokerage: "Brokerage",
  license_status: "Licence status",
  public_phone: "Phone number",
  service_zips: "Service area",
  specialties: "Specialties",
  credentials: "Credentials",
  full_name: "Name",
  website: "Website",
};

export default async function AgentListingPage({ params }: Params) {
  const { slug } = await params;
  const supabase = createSupabasePublicClient();

  const { data: agent } = await supabase
    .from("agent")
    .select(
      "id, full_name, slug, headline, bio, public_email, public_phone, website, license_number, license_state, license_status, license_verified_at, headshot_url, specialties, service_zips, claim_verified_at, published_at, brokerage:brokerage_id (name, website, city, state)",
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

  const [{ data: evidence }, { data: sponsored }, { data: areas }] =
    await Promise.all([
      supabase
        .from("agent_public_evidence")
        .select("field_name, field_value, source_url, retrieved_at, verification, source_name")
        .eq("agent_id", agent.id)
        .order("field_name"),
      supabase
        .from("sponsored_placement")
        .select("id")
        .eq("agent_id", agent.id)
        .limit(1),
      (agent.service_zips as string[]).length > 0
        ? supabase
            .from("zip_area")
            .select("zip, primary_city")
            .in("zip", agent.service_zips as string[])
            .eq("is_target", true)
        : Promise.resolve({ data: [] as { zip: string; primary_city: string }[] }),
    ]);

  const citations = evidence ?? [];
  const isSponsored = (sponsored ?? []).length > 0;
  const licenceOk =
    agent.license_verified_at !== null && agent.license_status !== null;
  const coveredAreas = (areas ?? []) as { zip: string; primary_city: string }[];

  const name = agent.full_name as string;

  return (
    <main>
      <Track event="profile_view" agentId={agent.id as string} paid={isSponsored} />
      <section className="hero">
        <div className="wrap">
          <div
            style={{
              display: "flex",
              gap: 22,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {agent.headshot_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="avatar"
                src={agent.headshot_url as string}
                alt={name}
                style={{ width: 104, height: 104 }}
              />
            ) : (
              <div
                className="avatar"
                aria-hidden="true"
                style={{ width: 104, height: 104, fontSize: "2rem" }}
              >
                {initials(name)}
              </div>
            )}

            <div>
              <h1 style={{ maxWidth: "none", marginBottom: 4 }}>{name}</h1>
              <p className="agent-firm" style={{ fontSize: "1.05rem" }}>
                {brokerage?.name ?? "Brokerage not confirmed"}
                {brokerage?.city ? ` · ${brokerage.city}, ${brokerage.state ?? "NJ"}` : ""}
              </p>

              <div className="chips" style={{ marginTop: 12 }}>
                {licenceOk ? (
                  <span className="chip chip-ok">Licence verified</span>
                ) : (
                  <span className="chip chip-warn">Licence not verified</span>
                )}
                {agent.claim_verified_at ? (
                  <span className="chip chip-ok">Claimed by this agent</span>
                ) : null}
                {isSponsored ? <span className="chip chip-gold">Sponsored</span> : null}
              </div>
            </div>
          </div>

          {agent.headline ? (
            <p className="lede" style={{ marginTop: 20 }}>
              {agent.headline as string}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: 24,
            }}
          >
            {agent.public_phone ? (
              <TrackedLink
                className="btn"
                href={`tel:${agent.public_phone}`}
                external
                track={{
                  event: "contact_click",
                  agentId: agent.id as string,
                  paid: isSponsored,
                }}
              >
                Call {agent.public_phone as string}
              </TrackedLink>
            ) : null}
            {agent.public_email ? (
              <TrackedLink
                className="btn btn-secondary"
                href={`mailto:${agent.public_email}`}
                external
                track={{
                  event: "contact_click",
                  agentId: agent.id as string,
                  paid: isSponsored,
                }}
              >
                Email {name.split(" ")[0]}
              </TrackedLink>
            ) : null}
            {agent.website ? (
              <TrackedLink
                className="btn btn-secondary"
                href={agent.website as string}
                external
                rel="nofollow noopener noreferrer"
                target="_blank"
                track={{
                  event: "contact_click",
                  agentId: agent.id as string,
                  paid: isSponsored,
                }}
              >
                Their website
              </TrackedLink>
            ) : null}
            {!agent.public_phone && !agent.public_email && !agent.website ? (
              <p className="muted" style={{ margin: 0 }}>
                No public contact details are listed for this agent yet.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="wrap page">
        <div
          style={{
            display: "grid",
            gap: 32,
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            alignItems: "start",
          }}
        >
          <div>
            {agent.bio ? (
              <section className="section">
                <h2>About {name.split(" ")[0]}</h2>
                <p>{agent.bio as string}</p>
              </section>
            ) : null}

            <section className="section">
              <h2>What we checked</h2>
              {citations.length === 0 ? (
                <div className="notice notice-warn">
                  <p style={{ margin: 0 }}>
                    No sources have been recorded for this listing yet, so treat
                    the details above as unconfirmed.
                  </p>
                </div>
              ) : (
                <div className="table-wrap card" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Detail</th>
                        <th>Status</th>
                        <th>Checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {citations.map((c, i) => {
                        const label =
                          VERIFICATION_LABEL[c.verification as string] ??
                          VERIFICATION_LABEL.unverified;
                        return (
                          <tr key={`${c.field_name}-${i}`}>
                            <td>
                              <strong>
                                {FIELD_LABEL[c.field_name as string] ??
                                  (c.field_name as string)}
                              </strong>
                              {c.field_value ? (
                                <div className="muted">{c.field_value as string}</div>
                              ) : null}
                            </td>
                            <td>
                              <span className={label.cls}>{label.text}</span>
                              {c.source_url ? (
                                <div style={{ marginTop: 4 }}>
                                  <a
                                    href={c.source_url as string}
                                    rel="nofollow noopener noreferrer"
                                    target="_blank"
                                    style={{ fontSize: "0.85rem" }}
                                  >
                                    source
                                  </a>
                                </div>
                              ) : null}
                            </td>
                            <td className="muted">
                              {new Date(c.retrieved_at as string).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric", year: "numeric" },
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="hint">
                We publish what we could confirm and say plainly what we could
                not. <Link href="/methodology">How we check agents</Link>
              </p>
            </section>
          </div>

          <aside>
            <div className="card" style={{ marginBottom: 18 }}>
              <h3>Licence</h3>
              <table>
                <tbody>
                  <tr>
                    <td className="muted">Number</td>
                    <td>
                      {(agent.license_number as string) ?? (
                        <span className="muted">Not recorded</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="muted">Status</td>
                    <td>
                      {agent.license_status ? (
                        <>
                          {agent.license_status as string}
                          {agent.license_verified_at ? (
                            <div className="muted" style={{ fontSize: "0.85rem" }}>
                              checked{" "}
                              {new Date(
                                agent.license_verified_at as string,
                              ).toLocaleDateString("en-US")}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">Not verified</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="muted">State</td>
                    <td>{(agent.license_state as string) ?? "NJ"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {(agent.specialties as string[]).length > 0 ? (
              <div className="card" style={{ marginBottom: 18 }}>
                <h3>Works with</h3>
                <div className="chips">
                  {(agent.specialties as string[]).map((s) => (
                    <span className="chip" key={s}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="card" style={{ marginBottom: 18 }}>
              <h3>Areas served</h3>
              {(agent.service_zips as string[]).length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  Not recorded.
                </p>
              ) : (
                <div className="chips">
                  {(agent.service_zips as string[]).map((z) => {
                    const match = coveredAreas.find((a) => a.zip === z);
                    return match ? (
                      <Link className="chip" key={z} href={`/directory/${z}`}>
                        {match.primary_city} {z}
                      </Link>
                    ) : (
                      <span className="chip" key={z}>
                        {z}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card card-warm">
              <h3>Is this you?</h3>
              <p className="muted" style={{ marginBottom: 14 }}>
                Claim this listing to correct anything that is wrong. It is free,
                and it stays free.
              </p>
              <Link className="btn" href={`/claim?agent=${agent.slug}`}>
                Claim this listing
              </Link>
            </div>
          </aside>
        </div>

        <hr className="rule" />
        <p className="muted">
          {agent.claim_verified_at
            ? "This agent has claimed this listing and an administrator confirmed their identity and brokerage."
            : "This listing was compiled from the sources shown above and has not been claimed yet."}{" "}
          Destiny Marketing Group is not affiliated with this agent or their
          brokerage unless stated.
        </p>
      </div>
    </main>
  );
}
