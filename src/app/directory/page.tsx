import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Find a real estate agent in New Jersey",
  description:
    "Find local real estate agents by town or ZIP code. Every listing is checked by a person against the state licence register before it goes live.",
  alternates: { canonical: "/directory" },
};

interface Area {
  zip: string;
  primary_city: string;
  county: string | null;
}

export default async function DirectoryIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ zip?: string }>;
}) {
  const { zip } = await searchParams;
  if (zip && /^[0-9]{5}$/.test(zip.trim())) {
    redirect(`/directory/${zip.trim()}`);
  }

  const supabase = createSupabasePublicClient();

  const [{ data: areas }, { data: published }] = await Promise.all([
    supabase
      .from("zip_area")
      .select("zip, primary_city, county")
      .eq("is_target", true)
      .order("primary_city"),
    supabase
      .from("agent")
      .select("service_zips")
      .eq("status", "published"),
  ]);

  const rows = (areas ?? []) as Area[];

  // Count published agents per ZIP so a town card can say what is actually there.
  const countByZip = new Map<string, number>();
  for (const a of published ?? []) {
    for (const z of ((a.service_zips as string[]) ?? [])) {
      countByZip.set(z, (countByZip.get(z) ?? 0) + 1);
    }
  }

  const byCounty = new Map<string, Area[]>();
  for (const area of rows) {
    const key = area.county ?? "Elsewhere in New Jersey";
    const list = byCounty.get(key) ?? [];
    list.push(area);
    byCounty.set(key, list);
  }
  const counties = [...byCounty.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const totalListed = [...countByZip.values()].reduce((a, b) => a + b, 0);

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <h1>Find a real estate agent near you</h1>
          <p className="lede">
            Pick your town, or type your ZIP code. Every agent here was checked
            by a person against the New Jersey licence register before the
            listing went live.
          </p>

          <div className="searchbox" style={{ marginTop: 22 }}>
            <form action="/directory" method="get">
              <label htmlFor="zip">Your ZIP code</label>
              <div className="searchbox-row">
                <input
                  id="zip"
                  name="zip"
                  type="search"
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  placeholder="e.g. 07042"
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
        {rows.length === 0 ? (
          <div className="empty">
            <h3>No towns are open yet</h3>
            <p>
              We check every agent by hand before listing them, so towns open
              one at a time. Nothing is listed until that work is done.
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h2 style={{ margin: 0 }}>Towns we cover</h2>
              <p className="muted" style={{ margin: 0 }}>
                {rows.length} town{rows.length === 1 ? "" : "s"}
                {totalListed > 0
                  ? ` · ${totalListed} listing${totalListed === 1 ? "" : "s"} live`
                  : ""}
              </p>
            </div>

            {counties.map(([county, towns]) => (
              <section key={county} style={{ marginTop: 26 }}>
                <h3
                  style={{
                    fontSize: "0.82rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    marginBottom: 12,
                  }}
                >
                  {county} County
                </h3>
                <div className="grid grid-4">
                  {towns.map((area) => {
                    const n = countByZip.get(area.zip) ?? 0;
                    return (
                      <Link
                        className="town-card"
                        key={area.zip}
                        href={`/directory/${area.zip}`}
                      >
                        <span className="town-name">{area.primary_city}</span>
                        <span className="town-zip">{area.zip}</span>
                        <span className={n > 0 ? "chip chip-ok" : "chip"}>
                          {n > 0
                            ? `${n} agent${n === 1 ? "" : "s"}`
                            : "Checking agents"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}

        <hr className="rule" />

        <h2>How this directory works</h2>
        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <h3>A person does the looking</h3>
            <p className="muted" style={{ margin: 0 }}>
              We find agents working in a town and record where each detail came
              from — the licence register, the brokerage&apos;s own site, or the
              agent themselves.
            </p>
          </div>
          <div className="step">
            <div className="num">2</div>
            <h3>Nothing publishes itself</h3>
            <p className="muted" style={{ margin: 0 }}>
              A listing only goes live after a named person approves it. If a
              fact has no source, it does not appear.
            </p>
          </div>
          <div className="step">
            <div className="num">3</div>
            <h3>The agent can correct it</h3>
            <p className="muted" style={{ margin: 0 }}>
              Claiming a listing and fixing it is free, and it stays free.
            </p>
          </div>
        </div>

        <div className="card card-warm" style={{ marginTop: 28 }}>
          <h3>Don&apos;t see your town?</h3>
          <p className="muted">
            We open towns as we finish checking the agents who work in them.
            Agents and brokerages can ask to be listed at no charge.
          </p>
          <div className="btn-row">
            <Link className="btn" href="/claim">
              Claim or request a listing
            </Link>
            <Link className="btn btn-secondary" href="/methodology">
              How we check agents
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
