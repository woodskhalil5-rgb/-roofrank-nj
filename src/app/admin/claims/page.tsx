import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ClaimDecision from "./ClaimDecision";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  const user = await requireStaff("/admin/claims");
  const supabase = await createSupabaseServerClient();

  const { data: claims } = await supabase
    .from("profile_claim")
    .select(
      "id, agent_id, claimant_name, claimant_email, claimant_phone, stated_license_number, stated_brokerage, evidence_url, requested_changes, status, created_at, review_notes, reviewed_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = claims ?? [];
  const agentIds = [...new Set(rows.map((c) => c.agent_id as string))];

  const agentsResult = agentIds.length
    ? await supabase.from("agent").select("id, full_name, slug").in("id", agentIds)
    : null;

  const agentById = new Map<string, Record<string, unknown>>(
    (agentsResult?.data ?? []).map((a) => [a.id as string, a as Record<string, unknown>]),
  );
  const pending = rows.filter((c) => c.status === "pending");
  const decided = rows.filter((c) => c.status !== "pending");

  return (
    <>
      <h1>Agent claims</h1>
      <p className="muted">
        Verify identity and brokerage affiliation before granting anyone control
        of a profile. Claiming is free for agents.
      </p>

      <section className="section">
        <h2>Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="notice notice-info">No claims are waiting.</div>
        ) : (
          pending.map((claim) => {
            const agent = agentById.get(claim.agent_id as string);
            const changes = claim.requested_changes as { note?: string } | null;
            return (
              <div className="card" key={claim.id as string} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <h3 style={{ margin: 0 }}>
                    {(agent?.full_name as string) ?? "Unknown profile"}
                  </h3>
                  <span className="muted mono">
                    {new Date(claim.created_at as string).toLocaleString("en-US")}
                  </span>
                </div>

                <table style={{ marginTop: 10 }}>
                  <tbody>
                    <tr>
                      <td className="muted" style={{ width: "26%" }}>Claimant</td>
                      <td>
                        {claim.claimant_name as string} &lt;{claim.claimant_email as string}&gt;
                        {claim.claimant_phone ? ` · ${claim.claimant_phone as string}` : ""}
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Stated licence</td>
                      <td className="mono">{(claim.stated_license_number as string) ?? "—"}</td>
                    </tr>
                    <tr>
                      <td className="muted">Stated brokerage</td>
                      <td>{(claim.stated_brokerage as string) ?? "—"}</td>
                    </tr>
                    <tr>
                      <td className="muted">Evidence</td>
                      <td>
                        {claim.evidence_url ? (
                          <a href={claim.evidence_url as string} target="_blank" rel="noopener noreferrer">
                            {claim.evidence_url as string}
                          </a>
                        ) : (
                          <span className="muted">none provided</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Requested changes</td>
                      <td>{changes?.note ?? <span className="muted">none</span>}</td>
                    </tr>
                    <tr>
                      <td className="muted">Profile</td>
                      <td>
                        {agent ? (
                          <Link href={`/agent/${agent.slug}`} target="_blank">
                            view published profile
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <hr className="rule" style={{ margin: "14px 0" }} />
                {isAdmin(user.role) ? (
                  <ClaimDecision claimId={claim.id as string} />
                ) : (
                  <p className="muted">
                    Only an administrator can decide on a claim.
                  </p>
                )}
              </div>
            );
          })
        )}
      </section>

      {decided.length > 0 ? (
        <section className="section">
          <h2>Decided</h2>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Claimant</th>
                  <th>Outcome</th>
                  <th>Note</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((c) => (
                  <tr key={c.id as string}>
                    <td>{(agentById.get(c.agent_id as string)?.full_name as string) ?? "—"}</td>
                    <td className="muted">{c.claimant_email as string}</td>
                    <td>
                      <span className={c.status === "verified" ? "badge badge-ok" : "badge badge-bad"}>
                        {c.status as string}
                      </span>
                    </td>
                    <td className="muted">{(c.review_notes as string) ?? "—"}</td>
                    <td className="mono">
                      {c.reviewed_at
                        ? new Date(c.reviewed_at as string).toLocaleDateString("en-US")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
