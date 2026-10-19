import Link from "next/link";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import Track from "@/components/Track";
import TrackedLink from "@/components/TrackedLink";

export const revalidate = 300;

interface FeaturedCard {
  id: string;
  fullName: string;
  slug: string;
  brokerage: string | null;
  brokeragePhone: string | null;
  brokerageLogoUrl: string | null;
  headshotUrl: string | null;
  licenceVerified: boolean;
  claimed: boolean;
  /** The purchased promotional category, shown only on a paid placement. */
  category: string | null;
  sponsored: boolean;
}

function initials(name: string, max = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

interface AgentRow {
  id: string;
  full_name: string;
  slug: string;
  license_status: string | null;
  license_verified_at: string | null;
  headshot_url: string | null;
  claim_verified_at: string | null;
  brokerage_name_raw: string | null;
  brokerage: {
    name: string;
    phone: string | null;
    logo_url: string | null;
  } | null;
}

function toCard(
  row: AgentRow,
  category: string | null,
  sponsored: boolean,
): FeaturedCard {
  return {
    id: row.id,
    fullName: row.full_name,
    slug: row.slug,
    brokerage: row.brokerage?.name ?? row.brokerage_name_raw ?? null,
    brokeragePhone: row.brokerage?.phone ?? null,
    brokerageLogoUrl: row.brokerage?.logo_url ?? null,
    headshotUrl: row.headshot_url,
    licenceVerified:
      row.license_verified_at !== null && row.license_status !== null,
    claimed: row.claim_verified_at !== null,
    category,
    sponsored,
  };
}

const AGENT_COLUMNS =
  "id, full_name, slug, license_status, license_verified_at, headshot_url, claim_verified_at, brokerage_name_raw, brokerage:brokerage_id (name, phone, logo_url)";

/**
 * The three promotional positions in the hero.
 *
 * A sold position shows that advertiser with its purchased category and a
 * Sponsored label. An unsold position shows a published agent at no charge,
 * with no category and no label, because nothing about it is sponsored.
 * Either way a card states only what we hold a source for — who they are,
 * who they work for, and what we verified. Never a rating, a ranking or a
 * sales figure.
 */
async function getFeatured(): Promise<FeaturedCard[]> {
  const supabase = createSupabasePublicClient();
  const today = new Date().toISOString().slice(0, 10);

  // Statewide placements carry no ZIP; ZIP-scoped rows belong to town pages.
  const { data: placements } = await supabase
    .from("sponsored_placement")
    .select("agent_id, label, starts_on, ends_on")
    .is("zip", null)
    .lte("starts_on", today)
    .order("starts_on", { ascending: true })
    .limit(3);

  const live = (placements ?? []).filter(
    (p) => !p.ends_on || (p.ends_on as string) >= today,
  );

  const cards: FeaturedCard[] = [];
  const takenIds: string[] = [];

  const paidIds = live
    .map((p) => p.agent_id as string | null)
    .filter((id): id is string => Boolean(id));

  if (paidIds.length > 0) {
    const { data: paidAgents } = await supabase
      .from("agent")
      .select(AGENT_COLUMNS)
      .eq("status", "published")
      .in("id", paidIds);

    for (const placement of live) {
      const row = (paidAgents ?? []).find(
        (a) => a.id === placement.agent_id,
      ) as unknown as AgentRow | undefined;
      if (!row) continue;
      cards.push(toCard(row, (placement.label as string | null) ?? null, true));
      takenIds.push(row.id);
    }
  }

  // Fill any unsold position with a published listing, free of charge.
  if (cards.length < 3) {
    let fill = supabase
      .from("agent")
      .select(AGENT_COLUMNS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3 - cards.length);

    if (takenIds.length > 0) {
      fill = fill.not("id", "in", `(${takenIds.join(",")})`);
    }

    const { data: filler } = await fill;
    for (const row of (filler ?? []) as unknown as AgentRow[]) {
      cards.push(toCard(row, null, false));
    }
  }

  return cards;
}

/**
 * A paid placement is the agent's own advertising, and N.J.A.C. 11:5-6.1(b)
 * requires it to carry the brokerage name displayed more prominently than the
 * agent's, plus the office telephone number wherever the agent's own contact
 * details appear. The logo leads the card to satisfy that without setting the
 * brokerage name in outsized type.
 */
function SponsoredCard({ card }: { card: FeaturedCard }) {
  return (
    <TrackedLink
      className="feature-card brokerage-led is-sponsored"
      href={`/agent/${card.slug}`}
      track={{
        event: "placement_click",
        agentId: card.id,
        paid: true,
      }}
    >
      {card.brokerageLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="brand-logo"
          src={card.brokerageLogoUrl}
          alt={card.brokerage ?? "Brokerage"}
        />
      ) : (
        <span className="brand-logo" aria-hidden="true">
          {initials(card.brokerage ?? "Brokerage", 3)}
        </span>
      )}

      <span className="feature-body">
        {card.category ? (
          <span className="feature-eyebrow">{card.category}</span>
        ) : null}
        <span className="firm-lead">
          {card.brokerage ?? "Brokerage not confirmed"}
        </span>
        <span className="agent-row">
          {card.headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar" src={card.headshotUrl} alt={card.fullName} />
          ) : (
            <span className="avatar" aria-hidden="true">
              {initials(card.fullName)}
            </span>
          )}
          <span className="agent-sub">{card.fullName}</span>
        </span>
        {card.brokeragePhone ? (
          <span className="office-line">Office {card.brokeragePhone}</span>
        ) : null}
        <span className="chips">
          {card.licenceVerified ? (
            <span className="chip chip-ok">Licence verified</span>
          ) : null}
          <span className="chip chip-gold">Sponsored</span>
        </span>
      </span>
    </TrackedLink>
  );
}

function FreeCard({ card }: { card: FeaturedCard }) {
  return (
    <TrackedLink
      className="feature-card"
      href={`/agent/${card.slug}`}
      track={{ event: "placement_click", agentId: card.id, paid: false }}
    >
      {card.headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar" src={card.headshotUrl} alt={card.fullName} />
      ) : (
        <span className="avatar" aria-hidden="true">
          {initials(card.fullName)}
        </span>
      )}
      <span className="feature-body">
        <span className="feature-name">{card.fullName}</span>
        <span className="feature-firm">
          {card.brokerage ?? "Brokerage not confirmed"}
        </span>
        <span className="chips">
          {card.licenceVerified ? (
            <span className="chip chip-ok">Licence verified</span>
          ) : null}
          {card.claimed ? <span className="chip chip-ok">Claimed</span> : null}
        </span>
      </span>
    </TrackedLink>
  );
}

export default async function HomePage() {
  const supabase = createSupabasePublicClient();

  const [{ data: zips }, { count: publishedCount }, featured] =
    await Promise.all([
      supabase
        .from("zip_area")
        .select("zip, primary_city, county")
        .eq("is_target", true)
        .order("primary_city"),
      supabase
        .from("agent")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      getFeatured(),
    ]);

  const areas = zips ?? [];
  const published = publishedCount ?? 0;

  return (
    <main>
      <section className="hero hero-photo">
        <div className="wrap hero-split">
          <div className="hero-copy">
            <h1>Find your trusted real estate agent.</h1>
            <p className="lede">
              Search by ZIP code and see who actually works your area — with
              their licence checked against the New Jersey state register, not
              just their own say-so.
            </p>

            <div className="searchbox">
              <form action="/directory" method="get">
                <label htmlFor="zip">Where are you buying or selling?</label>
                <div className="searchbox-row">
                  <input
                    id="zip"
                    name="zip"
                    type="search"
                    inputMode="numeric"
                    pattern="[0-9]{5}"
                    maxLength={5}
                    placeholder="ZIP code"
                    autoComplete="postal-code"
                    required
                  />
                  <button className="btn" type="submit">
                    Find an agent
                  </button>
                </div>
              </form>
            </div>

            <div className="trust-line">
              <span>
                <span className="tick">✓</span> Licences checked with the state
              </span>
              <span>
                <span className="tick">✓</span> Free for agents to claim
              </span>
              <span>
                <span className="tick">✓</span> Sponsored listings always
                labelled
              </span>
            </div>
          </div>

          {featured.length > 0 ? (
            <aside className="hero-featured" aria-label="Featured agents">
              {featured.map((card) => (
                <div key={card.id}>
                  <Track
                    event="placement_impression"
                    agentId={card.id}
                    paid={card.sponsored}
                  />
                  {card.sponsored ? (
                    <SponsoredCard card={card} />
                  ) : (
                    <FreeCard card={card} />
                  )}
                </div>
              ))}
            </aside>
          ) : null}
        </div>
      </section>

      <div className="wrap page">
        <section className="section">
          <h2 className="section-title">
            A better way to find an agent starts here
          </h2>
          <div className="steps">
            <div className="step">
              <div className="num">1</div>
              <h3>Enter your ZIP code</h3>
              <p className="muted" style={{ margin: 0 }}>
                We show the agents who document working in your area, not
                whoever paid the most.
              </p>
            </div>
            <div className="step">
              <div className="num">2</div>
              <h3>See what we checked</h3>
              <p className="muted" style={{ margin: 0 }}>
                Each listing shows which details we confirmed, where we
                confirmed them, and the date. Anything unconfirmed says so.
              </p>
            </div>
            <div className="step">
              <div className="num">3</div>
              <h3>Reach out directly</h3>
              <p className="muted" style={{ margin: 0 }}>
                Contact the agent yourself using their listed business details.
                We don&apos;t sell your information to anyone.
              </p>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Towns we cover</h2>
          {areas.length === 0 ? (
            <div className="empty">
              <h3>We&apos;re checking our first town now</h3>
              <p>
                Every agent is verified by hand before their listing goes live,
                so areas open one at a time. Tell us where you&apos;re looking
                and we&apos;ll start there.
              </p>
              <Link className="btn btn-secondary" href="/methodology">
                See how we check agents
              </Link>
            </div>
          ) : (
            <div className="grid grid-4">
              {areas.map((z) => (
                <Link
                  className="town-card"
                  key={z.zip as string}
                  href={`/directory/${z.zip}`}
                >
                  <span className="town-name">{z.primary_city as string}</span>
                  <span className="town-zip">{z.zip as string}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="grid grid-2">
            <div className="card">
              <h3>Are you a real estate agent?</h3>
              <p className="muted">
                If we&apos;ve listed you, claiming your listing is free and
                always will be. Fix anything we got wrong, add your details, and
                see every source we used. Correcting your listing never costs
                money.
              </p>
              <Link className="btn" href="/claim">
                Claim your listing
              </Link>
            </div>
            <div className="card card-warm">
              <h3>Do you run a brokerage?</h3>
              <p className="muted">
                We list your agents from your own roster, with your permission,
                so their details are right from day one — and new agents get a
                verified listing the week they join you.
              </p>
              <Link className="btn btn-secondary" href="/methodology">
                How listings are built
              </Link>
            </div>
          </div>
        </section>

        {published === 0 ? (
          <p className="muted" style={{ textAlign: "center" }}>
            No listings are published yet. We would rather show you nothing than
            show you agents we haven&apos;t checked.
          </p>
        ) : null}
      </div>
    </main>
  );
}
