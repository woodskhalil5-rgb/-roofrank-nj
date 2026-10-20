import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLiveOn, placementDay, STATEWIDE_SLOTS } from "@/lib/placements";
import PlacementForm, { type SellableAgent } from "./PlacementForm";
import { endPlacement } from "./actions";

export const dynamic = "force-dynamic";

interface PlacementRow {
  id: string;
  agent_id: string | null;
  zip: string | null;
  label: string | null;
  starts_on: string;
  ends_on: string | null;
  monthly_value: number | null;
  created_at: string;
}

function money(v: number | null): string {
  if (v === null) return "—";
  return `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PlacementsPage() {
  const user = await requireStaff("/admin/placements");
  const admin = isAdmin(user.role);
  const supabase = await createSupabaseServerClient();
  const today = placementDay();

  const [{ data: placements }, { data: publishedAgents }] = await Promise.all([
    supabase
      .from("sponsored_placement")
      .select(
        "id, agent_id, zip, label, starts_on, ends_on, monthly_value, created_at",
      )
      .order("starts_on", { ascending: false })
      .limit(200),
    supabase
      .from("agent")
      .select("id, full_name, brokerage_name_raw, brokerage:brokerage_id (name)")
      .eq("status", "published")
      .order("full_name"),
  ]);

  const rows = (placements ?? []) as PlacementRow[];

  const agentIds = [
    ...new Set(rows.map((r) => r.agent_id).filter((x): x is string => !!x)),
  ];
  let names = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data } = await supabase
      .from("agent")
      .select("id, full_name")
      .in("id", agentIds);
    names = new Map(
      (data ?? []).map((a) => [a.id as string, a.full_name as string]),
    );
  }

  const sellable: SellableAgent[] = (publishedAgents ?? []).map((a) => {
    const brokerage = a.brokerage as unknown as { name: string } | null;
    return {
      id: a.id as string,
      name: a.full_name as string,
      brokerage: brokerage?.name ?? (a.brokerage_name_raw as string | null),
    };
  });

  const live = rows.filter((r) => isLiveOn(r.starts_on, r.ends_on, today));
  const scheduled = rows.filter((r) => r.starts_on > today);
  const ended = rows.filter((r) => r.ends_on !== null && r.ends_on < today);

  const liveStatewide = live.filter((r) => r.zip === null);
  const monthlyRun = live.reduce((sum, r) => sum + Number(r.monthly_value ?? 0), 0);

  const section = (title: string, list: PlacementRow[], note: string) =>
    list.length === 0 ? null : (
      <section className="section">
        <h2>{title}</h2>
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Advertiser</th>
                <th>Position</th>
                <th>Where</th>
                <th>Dates</th>
                <th>Monthly</th>
                {admin ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.agent_id ? (
                      names.get(r.agent_id) ?? (
                        <span className="muted">unknown listing</span>
                      )
                    ) : (
                      <span className="muted">brokerage only</span>
                    )}
                  </td>
                  <td>{r.label ?? <span className="muted">—</span>}</td>
                  <td>
                    {r.zip === null ? (
                      <span className="badge badge-ok">statewide</span>
                    ) : (
                      <span className="mono">{r.zip}</span>
                    )}
                  </td>
                  <td className="mono">
                    {formatDate(r.starts_on)} →{" "}
                    {r.ends_on ? formatDate(r.ends_on) : "open"}
                  </td>
                  <td className="mono">{money(r.monthly_value)}</td>
                  {admin ? (
                    <td>
                      {r.ends_on === null || r.ends_on >= today ? (
                        <form action={endPlacement}>
                          <input type="hidden" name="placementId" value={r.id} />
                          <button
                            className="btn btn-secondary btn-small"
                            type="submit"
                          >
                            End
                          </button>
                        </form>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">{note}</p>
      </section>
    );

  return (
    <>
      <h1>Placements</h1>
      <p className="muted">
        Paid positions, their dates and what they cost. Ending a campaign clears
        the position and changes nothing on the listing itself.
      </p>

      <div className="metric-row">
        <div className="metric">
          <div className="metric-label">Statewide positions</div>
          <div className="metric-value">
            {liveStatewide.length}/{STATEWIDE_SLOTS}
          </div>
          <div className="metric-note">
            {liveStatewide.length < STATEWIDE_SLOTS
              ? `${STATEWIDE_SLOTS - liveStatewide.length} unsold, showing free listings`
              : "all sold"}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Town placements live</div>
          <div className="metric-value">
            {live.length - liveStatewide.length}
          </div>
          <div className="metric-note">across the open towns</div>
        </div>
        <div className="metric">
          <div className="metric-label">Monthly run rate</div>
          <div className="metric-value">{money(monthlyRun)}</div>
          <div className="metric-note">from live campaigns</div>
        </div>
        <div className="metric">
          <div className="metric-label">Scheduled</div>
          <div className="metric-value">{scheduled.length}</div>
          <div className="metric-note">not started yet</div>
        </div>
      </div>

      {liveStatewide.length > STATEWIDE_SLOTS ? (
        <div className="notice notice-bad">
          <strong>
            More statewide campaigns are running than there are positions.
          </strong>
          <p style={{ margin: "6px 0 0" }}>
            Only the {STATEWIDE_SLOTS} with the earliest start dates appear. The
            rest are paying for something nobody can see.
          </p>
        </div>
      ) : null}

      {admin ? (
        <section className="section">
          <h2>Sell a position</h2>
          <div className="card">
            <PlacementForm agents={sellable} today={today} />
          </div>
        </section>
      ) : (
        <div className="notice notice-info">
          Only an administrator can sell or end a placement.
        </div>
      )}

      {section(
        "Running now",
        live,
        "These are on the site today. The homepage shows the three statewide positions with the earliest start dates.",
      )}
      {section(
        "Scheduled",
        scheduled,
        "Recorded and paid for, not yet visible. They appear on their start date.",
      )}
      {section(
        "Ended",
        ended.slice(0, 40),
        "Kept as the record of what ran and when. The listings themselves were not touched when these ended.",
      )}

      {rows.length === 0 ? (
        <div className="notice notice-info">
          <strong>Nothing sold yet.</strong>
          <p style={{ margin: "6px 0 0" }}>
            Until a position is sold, the homepage shows published listings in
            those three slots at no charge and with no Sponsored label.{" "}
            <Link href="/admin/analytics">Measurement</Link> shows what that
            exposure is worth.
          </p>
        </div>
      ) : null}
    </>
  );
}
