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

  const targetZips = zips ?? [];
  const published = publishedCount ?? 0;

  return (
    <main className="page">
      <div className="wrap">
        <section className="section" style={{ maxWidth: 680 }}>
          <h1>Find a verified real estate professional near you</h1>
          <p className="muted" style={{ fontSize: "0.95rem" }}>
            Every profile in this directory is reviewed by a person before it is
            published, and each fact on it carries a recorded source. We publish
            the criteria we order agents by, and we never invent sales figures
            or reviews.
          </p>

          <form action="/directory" method="get" style={{ marginTop: 18 }}>
            <div className="field">
              <label htmlFor="zip">ZIP code</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="zip"
                  name="zip"
                  type="search"
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  placeholder="e.g. 07030"
                  aria-describedby="zip-hint"
                  required
                />
                <button className="btn" type="submit">
                  Search
                </button>
              </div>
              <p className="hint" id="zip-hint">
                Five-digit US ZIP code.
              </p>
            </div>
          </form>
        </section>

        <section className="section">
          <h2>Covered areas</h2>
          {targetZips.length === 0 ? (
            <div className="notice notice-info">
              No areas have been published yet. Coverage is added one ZIP code at
              a time, after agent research has been reviewed and approved — we
              would rather publish a few accurate areas than many thin ones.
            </div>
          ) : (
            <div className="grid grid-4">
              {targetZips.map((z) => (
                <Link
                  key={z.zip as string}
                  href={`/directory/${z.zip}`}
                  className="stat"
                  style={{ textDecoration: "none", display: "block" }}
                >
                  <div className="label">{z.county ?? "New Jersey"}</div>
                  <div className="value" style={{ fontSize: "1.2rem" }}>
                    {z.primary_city as string}
                  </div>
                  <div className="note">{z.zip as string}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="grid grid-2">
            <div className="card">
              <h3>For agents</h3>
              <p className="muted">
                Claiming your profile is free. You can correct anything we have
                wrong, add your own professional details, and see exactly which
                sources we used.
              </p>
              <Link className="btn btn-secondary" href="/claim">
                Claim or correct your profile
              </Link>
            </div>
            <div className="card">
              <h3>How this directory is built</h3>
              <p className="muted">
                {published === 0
                  ? "No profiles are published yet. When they are, each one will show its sources, what has been verified, and what is self-reported."
                  : `${published} published profile${published === 1 ? "" : "s"}, each with recorded sources and a human approval on file.`}
              </p>
              <Link className="btn btn-secondary" href="/methodology">
                Read the methodology
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
