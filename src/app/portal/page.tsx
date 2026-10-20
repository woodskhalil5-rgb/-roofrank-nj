import Link from "next/link";
import { requireClient } from "@/lib/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_LABELS, EVENT_TYPES, type EventType } from "@/lib/analytics";
import { isLiveOn, placementDay } from "@/lib/placements";

export const dynamic = "force-dynamic";

interface Row {
  day: string;
  event_type: EventType;
  agent_id: string | null;
  is_paid: boolean;
  count: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { agentIds } = await requireClient();
  const { days } = await searchParams;
  const window = days === "7" || days === "90" ? Number(days) : 30;
  const since = daysAgo(window - 1);
  const today = placementDay();

  const supabase = await createSupabaseServerClient();

  // Row-level security limits both of these to this client's own listings.
  // The agent id filter is belt and braces, not the thing doing the work.
  const [{ data: events }, { data: campaigns }, { data: listings }] =
    await Promise.all([
      supabase
        .from("analytics_daily")
        .select("day, event_type, agent_id, is_paid, count")
        .gte("day", since)
        .in("agent_id", agentIds),
      supabase
        .from("sponsored_placement")
        .select("id, label, zip, starts_on, ends_on, agent_id")
        .in("agent_id", agentIds)
        .order("starts_on", { ascending: false }),
      supabase
        .from("agent")
        .select("id, full_name, slug, status")
        .in("id", agentIds)
        .order("full_name"),
    ]);

  const rows = (events ?? []) as Row[];
  const nameOf = new Map(
    (listings ?? []).map((l) => [l.id as string, l.full_name as string]),
  );

  const totals = new Map<EventType, number>();
  for (const t of EVENT_TYPES) totals.set(t, 0);
  for (const r of rows) {
    totals.set(r.event_type, (totals.get(r.event_type) ?? 0) + Number(r.count));
  }

  const impressions = totals.get("placement_impression") ?? 0;
  const clicks = totals.get("placement_click") ?? 0;
  const clickRate =
    impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : null;

  const perListing = new Map<
    string,
    { impressions: number; clicks: number; views: number; contacts: number }
  >();
  for (const r of rows) {
    if (!r.agent_id) continue;
    const e = perListing.get(r.agent_id) ?? {
      impressions: 0,
      clicks: 0,
      views: 0,
      contacts: 0,
    };
    const n = Number(r.count);
    if (r.event_type === "placement_impression") e.impressions += n;
    if (r.event_type === "placement_click") e.clicks += n;
    if (r.event_type === "profile_view") e.views += n;
    if (r.event_type === "contact_click") e.contacts += n;
    perListing.set(r.agent_id, e);
  }

  const liveCampaigns = (campaigns ?? []).filter((c) =>
    isLiveOn(c.starts_on as string, c.ends_on as string | null, today),
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Last {window} days</h1>
        <div className="btn-row">
          <Link className="btn btn-secondary btn-small" href="?days=7">
            7 days
          </Link>
          <Link className="btn btn-secondary btn-small" href="?days=30">
            30 days
          </Link>
          <Link className="btn btn-secondary btn-small" href="?days=90">
            90 days
          </Link>
        </div>
      </div>

      <p className="muted">
        Counts since {formatDate(since)}. We count page views and clicks, not
        people: no cookies, no tracking across sites, nothing that identifies a
        visitor.
      </p>

      <div className="metric-row">
        <div className="metric">
          <div className="metric-label">Homepage impressions</div>
          <div className="metric-value">{impressions.toLocaleString()}</div>
          <div className="metric-note">times your card was shown</div>
        </div>
        <div className="metric">
          <div className="metric-label">Card clicks</div>
          <div className="metric-value">{clicks.toLocaleString()}</div>
          <div className="metric-note">
            {clickRate ? `${clickRate}% of impressions` : "no impressions yet"}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">{EVENT_LABELS.profile_view}</div>
          <div className="metric-value">
            {(totals.get("profile_view") ?? 0).toLocaleString()}
          </div>
          <div className="metric-note">your page opened</div>
        </div>
        <div className="metric">
          <div className="metric-label">{EVENT_LABELS.contact_click}</div>
          <div className="metric-value">
            {(totals.get("contact_click") ?? 0).toLocaleString()}
          </div>
          <div className="metric-note">phone, email or website tapped</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="notice notice-info">
          <strong>Nothing counted in this period yet.</strong>
          <p style={{ margin: "6px 0 0" }}>
            Counting runs continuously. If your listing went live recently, or
            the site saw no visitors looking for your towns, this stays at zero
            until it does.
          </p>
        </div>
      ) : null}

      {perListing.size > 1 ? (
        <section className="section">
          <h2>By listing</h2>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>Page views</th>
                  <th>Contacts</th>
                </tr>
              </thead>
              <tbody>
                {[...perListing.entries()].map(([id, v]) => (
                  <tr key={id}>
                    <td>{nameOf.get(id) ?? <span className="muted">—</span>}</td>
                    <td className="mono">{v.impressions.toLocaleString()}</td>
                    <td className="mono">{v.clicks.toLocaleString()}</td>
                    <td className="mono">{v.views.toLocaleString()}</td>
                    <td className="mono">{v.contacts.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2>Your campaigns</h2>
        {(campaigns ?? []).length === 0 ? (
          <p className="muted">
            No paid placements on record. Your listing is in the directory either
            way, free of charge.
          </p>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Where</th>
                  <th>Dates</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(campaigns ?? []).map((c) => {
                  const live = isLiveOn(
                    c.starts_on as string,
                    c.ends_on as string | null,
                    today,
                  );
                  const future = (c.starts_on as string) > today;
                  return (
                    <tr key={c.id as string}>
                      <td>{(c.label as string) ?? "Placement"}</td>
                      <td>
                        {c.zip === null ? (
                          "Homepage, statewide"
                        ) : (
                          <span className="mono">{c.zip as string}</span>
                        )}
                      </td>
                      <td className="mono">
                        {formatDate(c.starts_on as string)} →{" "}
                        {c.ends_on ? formatDate(c.ends_on as string) : "open"}
                      </td>
                      <td>
                        {live ? (
                          <span className="badge badge-ok">running</span>
                        ) : future ? (
                          <span className="badge badge-warn">scheduled</span>
                        ) : (
                          <span className="badge badge-neutral">ended</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {liveCampaigns.length === 0 && (campaigns ?? []).length > 0 ? (
          <p className="hint">
            Nothing is running right now. Your listing is unchanged and still in
            the directory — ending a campaign never alters it.
          </p>
        ) : null}
      </section>

      <section className="section">
        <h2>Your listings</h2>
        <div className="btn-row">
          {(listings ?? []).map((l) => (
            <Link
              className="btn btn-secondary btn-small"
              key={l.id as string}
              href={`/agent/${l.slug}`}
              target="_blank"
            >
              {l.full_name as string}
            </Link>
          ))}
        </div>
        <p className="hint">
          Something wrong on a page? Tell us and we will fix it — corrections
          are free and are not conditional on advertising.
        </p>
      </section>
    </>
  );
}
