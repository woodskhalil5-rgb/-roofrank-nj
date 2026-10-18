import Link from "next/link";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const revalidate = 300;

export default async function HomePage() {
  const supabase = createSupabasePublicClient();

  const [{ data: zips }, { count: publishedCount }] = await Promise.all([
    supabase
      .from("zip_area")
      .select("zip, primary_city, county")
      .eq("is_target", true)
      .order("zip"),
    supabase
      .from("agent")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
  ]);

  const areas = zips ?? [];
  const published = publishedCount ?? 0;

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <h1>Find a real estate agent in your town.</h1>
          <p className="lede">
            Search by ZIP code and see who actually works your area — with their
            licence checked against the New Jersey state register, not just their
            own say-so.
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
                  Find agents
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
              <span className="tick">✓</span> Sponsored listings always labelled
            </span>
          </div>
        </div>
      </section>

      <div className="wrap page">
        <section className="section">
          <h2>Towns we cover</h2>
          {areas.length === 0 ? (
            <div className="empty">
              <h3>We&apos;re checking our first town now</h3>
              <p>
                Every agent is verified by hand before their listing goes live,
                so areas open one at a time. Tell us where you&apos;re looking and
                we&apos;ll start there.
              </p>
              <Link className="btn btn-secondary" href="/methodology">
                See how we check agents
              </Link>
            </div>
          ) : (
            <div className="grid grid-4">
              {areas.map((z) => (
                <Link key={z.zip as string} href={`/directory/${z.zip}`} className="stat">
                  <div className="label">{z.county ?? "New Jersey"}</div>
                  <div className="value" style={{ fontSize: "1.25rem" }}>
                    {z.primary_city as string}
                  </div>
                  <div className="note">{z.zip as string}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <h2>How it works</h2>
          <div className="steps">
            <div className="step">
              <div className="num">1</div>
              <h3>Enter your ZIP code</h3>
              <p className="muted" style={{ margin: 0 }}>
                We show the agents who document working in your area, not whoever
                paid the most.
              </p>
            </div>
            <div className="step">
              <div className="num">2</div>
              <h3>See what we checked</h3>
              <p className="muted" style={{ margin: 0 }}>
                Each listing shows which details we confirmed, where we confirmed
                them, and the date. Anything unconfirmed says so.
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
          <div className="grid grid-2">
            <div className="card">
              <h3>Are you a real estate agent?</h3>
              <p className="muted">
                If we&apos;ve listed you, claiming your listing is free and always
                will be. Fix anything we got wrong, add your details, and see
                every source we used. Correcting your listing never costs money.
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
