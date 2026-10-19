import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_LABELS, EVENT_TYPES, type EventType } from "@/lib/analytics";
import {
  endsOnOrAfter,
  placementDay,
  STATEWIDE_SLOTS,
} from "@/lib/placements";

export const dynamic = "force-dynamic";

interface Row {
  day: string;
  event_type: EventType;
  agent_id: string | null;
  zip: string | null;
  is_paid: boolean;
  count: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireStaff("/admin/analytics");
  const { days } = await searchParams;
  const window = days === "7" || days === "90" ? Number(days) : 30;
  const since = daysAgo(window - 1);

  const supabase = await createSupabaseServerClient();

  const day = placementDay();

  const [{ data, error }, { count: liveStatewide }] = await Promise.all([
    supabase
      .from("analytics_daily")
      .select("day, event_type, agent_id, zip, is_paid, count")
      .gte("day", since)
      .order("day", { ascending: false }),
    supabase
      .from("sponsored_placement")
      .select("id", { count: "exact", head: true })
      .is("zip", null)
      .lte("starts_on", day)
      .or(endsOnOrAfter(day)),
  ]);

  const rows = (data ?? []) as Row[];
  const sold = liveStatewide ?? 0;

  const totals = new Map<EventType, { paid: number; free: number }>();
  for (const t of EVENT_TYPES) totals.set(t, { paid: 0, free: 0 });
  for (const r of rows) {
    const t = totals.get(r.event_type);
    if (!t) continue;
    if (r.is_paid) t.paid += Number(r.count);
    else t.free += Number(r.count);
  }

  const impressions = totals.get("placement_impression")!;
  const clicks = totals.get("placement_click")!;
  const totalImpressions = impressions.paid + impressions.free;
  const totalClicks = clicks.paid + clicks.free;
  const clickRate =
    totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(1)
      : null;
  const paidClickRate =
    impressions.paid > 0
      ? ((clicks.paid / impressions.paid) * 100).toFixed(1)
      : null;

  // Which towns people are actually searching.
  const byZip = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type !== "zip_search" || !r.zip) continue;
    byZip.set(r.zip, (byZip.get(r.zip) ?? 0) + Number(r.count));
  }
  const topZips = [...byZip.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  // Per-agent performance, for the advertiser's own report.
  const byAgent = new Map<
    string,
    { impressions: number; clicks: number; views: number; contacts: number }
  >();
  for (const r of rows) {
    if (!r.agent_id) continue;
    const entry = byAgent.get(r.agent_id) ?? {
      impressions: 0,
      clicks: 0,
      views: 0,
      contacts: 0,
    };
    const n = Number(r.count);
    if (r.event_type === "placement_impression") entry.impressions += n;
    if (r.event_type === "placement_click") entry.clicks += n;
    if (r.event_type === "profile_view") entry.views += n;
    if (r.event_type === "contact_click") entry.contacts += n;
    byAgent.set(r.agent_id, entry);
  }

  let agentNames = new Map<string, { name: string; slug: string }>();
  if (byAgent.size > 0) {
    const { data: agents } = await supabase
      .from("agent")
      .select("id, full_name, slug")
      .in("id", [...byAgent.keys()]);
    agentNames = new Map(
      (agents ?? []).map((a) => [
        a.id as string,
        { name: a.full_name as string, slug: a.slug as string },
      ]),
    );
  }

  const agentRows = [...byAgent.entries()]
    .map(([id, v]) => ({ id, ...v, ...(agentNames.get(id) ?? {}) }))
    .sort((a, b) => b.impressions + b.views - (a.impressions + a.views));

  const zipLookup = new Map<string, string>();
  if (topZips.length > 0) {
    const { data: areas } = await supabase
      .from("zip_area")
      .select("zip, primary_city")
      .in(
        "zip",
        topZips.map(([z]) => z),
      );
    for (const a of areas ?? []) {
      zipLookup.set(a.zip as string, a.primary_city as string);
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <h1>Measurement</h1>
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
        Counts since {since}, in whole numbers. Nothing here identifies a
        visitor: no cookies, no addresses, no per-person records — only daily
        tallies.
      </p>

      {error ? (
        <div className="notice notice-bad">
          Could not read the tallies: {error.message}
        </div>
      ) : null}

      {sold > STATEWIDE_SLOTS ? (
        <div className="notice notice-bad">
          <strong>
            {sold} statewide placements are running and there are only{" "}
            {STATEWIDE_SLOTS} positions.
          </strong>
          <p style={{ margin: "6px 0 0" }}>
            The {STATEWIDE_SLOTS} with the earliest start dates are on the
            homepage. The rest are paying for a position nobody can see. End a
            campaign or move one to a town page.
          </p>
        </div>
      ) : (
        <p className="muted">
          {sold} of {STATEWIDE_SLOTS} homepage positions sold.
          {sold < STATEWIDE_SLOTS
            ? " Unsold positions show a published listing at no charge, with no Sponsored label."
            : ""}
        </p>
      )}

      <div className="metric-row">
        {EVENT_TYPES.map((t) => {
          const v = totals.get(t)!;
          const total = v.paid + v.free;
          return (
            <div className="metric" key={t}>
              <div className="metric-label">{EVENT_LABELS[t]}</div>
              <div className="metric-value">{total.toLocaleString()}</div>
              <div className="metric-note">
                {v.paid > 0 || v.free > 0
                  ? `${v.paid.toLocaleString()} paid · ${v.free.toLocaleString()} unpaid`
                  : "nothing yet"}
              </div>
            </div>
          );
        })}
        <div className="metric">
          <div className="metric-label">Click rate</div>
          <div className="metric-value">{clickRate ? `${clickRate}%` : "—"}</div>
          <div className="metric-note">
            {paidClickRate ? `${paidClickRate}% on paid placements` : "no data"}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="notice notice-info">
          <strong>No activity recorded yet.</strong>
          <p style={{ margin: "6px 0 0" }}>
            Counting starts the moment the site has visitors. Until a listing is
            published there are no placements to measure, so the homepage shows
            no cards and nothing is counted for them.
          </p>
        </div>
      ) : null}

      {topZips.length > 0 ? (
        <section className="section">
          <h2>What people searched</h2>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Town</th>
                  <th>ZIP</th>
                  <th>Searches</th>
                  <th>Covered</th>
                </tr>
              </thead>
              <tbody>
                {topZips.map(([zip, n]) => (
                  <tr key={zip}>
                    <td>{zipLookup.get(zip) ?? <span className="muted">—</span>}</td>
                    <td className="mono">{zip}</td>
                    <td className="mono">{n.toLocaleString()}</td>
                    <td>
                      {zipLookup.has(zip) ? (
                        "yes"
                      ) : (
                        <span className="badge badge-warn">not open</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            A ZIP with searches but no coverage is the clearest signal of which
            town to open next.
          </p>
        </section>
      ) : null}

      {agentRows.length > 0 ? (
        <section className="section">
          <h2>By listing</h2>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Impressions</th>
                  <th>Placement clicks</th>
                  <th>Profile visits</th>
                  <th>Contact clicks</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.slug ? (
                        <Link href={`/agent/${r.slug}`} target="_blank">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="muted">removed listing</span>
                      )}
                    </td>
                    <td className="mono">{r.impressions.toLocaleString()}</td>
                    <td className="mono">{r.clicks.toLocaleString()}</td>
                    <td className="mono">{r.views.toLocaleString()}</td>
                    <td className="mono">{r.contacts.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            This table is the advertiser report. When a brokerage asks what
            their placement did, these are the numbers — and they are the
            numbers you can show without claiming anything you cannot prove.
          </p>
        </section>
      ) : null}
    </>
  );
}
