import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ApprovalsQueue() {
  const user = await requireStaff("/admin/approvals");
  const supabase = await createSupabaseServerClient();

  const { data: pending } = await supabase
    .from("approval_request")
    .select("id, subject_id, requested_at, flagged_for_verification, requested_by")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  const agentIds = (pending ?? []).map((r) => r.subject_id as string);

  const agentsResult = agentIds.length
    ? await supabase
        .from("agent")
        .select("id, full_name, slug, status, brokerage_name_raw, service_zips, license_number")
        .in("id", agentIds)
    : null;

  const agentById = new Map<string, Record<string, unknown>>(
    (agentsResult?.data ?? []).map((a) => [a.id as string, a as Record<string, unknown>]),
  );

  const { data: recent } = await supabase
    .from("approval_request")
    .select("id, subject_id, status, decided_at, decision_notes")
    .neq("status", "pending")
    .order("decided_at", { ascending: false })
    .limit(10);

  return (
    <>
      <h1>Profile approvals</h1>
      <p className="muted">
        No profile reaches the public site without an approval recorded here.
        {!isAdmin(user.role)
          ? " Your role can review drafts but cannot approve or publish them."
          : ""}
      </p>

      <section className="section">
        <h2>Waiting for a decision ({pending?.length ?? 0})</h2>
        {(pending?.length ?? 0) === 0 ? (
          <div className="notice notice-info">
            Nothing is waiting for approval. New drafts appear here as soon as
            research submits them.
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Brokerage</th>
                  <th>ZIPs</th>
                  <th>Licence</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(pending ?? []).map((req) => {
                  const agent = agentById.get(req.subject_id as string);
                  return (
                    <tr key={req.id as string}>
                      <td>
                        <strong>{(agent?.full_name as string) ?? "Unknown profile"}</strong>
                        {req.flagged_for_verification ? (
                          <div>
                            <span className="badge badge-warn">Flagged</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="muted">
                        {(agent?.brokerage_name_raw as string) ?? "—"}
                      </td>
                      <td className="mono">
                        {((agent?.service_zips as string[]) ?? []).join(", ") || "—"}
                      </td>
                      <td className="mono">
                        {(agent?.license_number as string) ?? "—"}
                      </td>
                      <td className="mono">
                        {new Date(req.requested_at as string).toLocaleDateString("en-US")}
                      </td>
                      <td>
                        <Link className="btn btn-secondary" href={`/admin/approvals/${req.id}`}>
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Recent decisions</h2>
        {(recent?.length ?? 0) === 0 ? (
          <p className="muted">No decisions recorded yet.</p>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>When</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(recent ?? []).map((r) => (
                  <tr key={r.id as string}>
                    <td>
                      <span
                        className={
                          r.status === "approved"
                            ? "badge badge-ok"
                            : r.status === "rejected"
                              ? "badge badge-bad"
                              : "badge badge-warn"
                        }
                      >
                        {String(r.status).replace("_", " ")}
                      </span>
                    </td>
                    <td className="mono">
                      {r.decided_at
                        ? new Date(r.decided_at as string).toLocaleString("en-US")
                        : "—"}
                    </td>
                    <td className="muted">{(r.decision_notes as string) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
