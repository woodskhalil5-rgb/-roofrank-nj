import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Ranking methodology",
  description:
    "How this directory orders real estate professionals, which criteria are used, and what we deliberately do not claim.",
  alternates: { canonical: "/methodology" },
};

interface Criterion {
  key: string;
  label: string;
  weight: number;
  description: string;
  requires_evidence: boolean;
}

export default async function MethodologyPage() {
  const supabase = createSupabasePublicClient();

  const [{ data: methodology }, { data: sources }] = await Promise.all([
    supabase
      .from("ranking_methodology")
      .select("version, summary, criteria, published_at")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("research_source")
      .select("name, source_type, is_enabled, restrictions")
      .order("name"),
  ]);

  const criteria = (methodology?.criteria ?? []) as Criterion[];
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>How this directory is ordered</h1>

        {!methodology ? (
          <div className="notice notice-warn">
            No ranking methodology is currently active, so no ordered pages are
            published.
          </div>
        ) : (
          <>
            <p className="muted mono">
              Version {methodology.version as string}
              {methodology.published_at
                ? ` · published ${new Date(methodology.published_at as string).toLocaleDateString("en-US")}`
                : ""}
            </p>

            <p>{methodology.summary as string}</p>

            <h2 style={{ marginTop: 28 }}>Criteria</h2>
            <div className="table-wrap card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th style={{ width: 90 }}>Weight</th>
                    <th>What it means</th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c) => (
                    <tr key={c.key}>
                      <td>
                        <strong>{c.label}</strong>
                      </td>
                      <td className="mono">{c.weight}</td>
                      <td className="muted">{c.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              Weights total {totalWeight}. A criterion contributes nothing unless
              the underlying fact has a recorded source.
            </p>
          </>
        )}

        <h2 style={{ marginTop: 32 }}>What we do not claim</h2>
        <ul className="muted">
          <li>
            We do not publish sales volumes, transaction counts, review scores or
            performance statistics, because we hold no authorised, reliable
            source for them. We will not estimate them.
          </li>
          <li>
            We do not describe anyone as a definitive top performer. These pages
            are a directory of local professionals ordered by verification
            completeness.
          </li>
          <li>
            Paid placement never changes an editorial score. Sponsored entries
            carry a visible &ldquo;Sponsored&rdquo; label wherever they appear.
          </li>
          <li>
            Absence from this directory is not a judgement about an agent. It
            usually means their information has not been researched or approved
            yet.
          </li>
        </ul>

        <h2 style={{ marginTop: 32 }}>Sources</h2>
        <p className="muted">
          A source is only used once its terms of use have been reviewed and
          recorded. Sources listed as not in use are not queried.
        </p>
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th style={{ width: 110 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(sources ?? []).map((s) => (
                <tr key={s.name as string}>
                  <td>
                    {s.name as string}
                    {s.restrictions ? (
                      <div className="hint">{s.restrictions as string}</div>
                    ) : null}
                  </td>
                  <td>
                    {s.is_enabled ? (
                      <span className="badge badge-ok">In use</span>
                    ) : (
                      <span className="badge badge-neutral">Not in use</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 style={{ marginTop: 32 }}>Corrections and disputes</h2>
        <p className="muted">
          Any agent or brokerage can request a correction or removal through the
          claim form. Corrections are reviewed by a person, and the change
          history is retained.
        </p>
      </div>
    </main>
  );
}
