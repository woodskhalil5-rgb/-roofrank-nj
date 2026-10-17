import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProspectForm from "./ProspectForm";

export const dynamic = "force-dynamic";

const STAGES = [
  "researching",
  "contacted",
  "meeting_set",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "dormant",
] as const;

export default async function CrmPage() {
  const user = await requireStaff("/admin/crm");
  const admin = isAdmin(user.role);
  const supabase = await createSupabaseServerClient();

  const [{ data: accounts }, { data: proposals }] = await Promise.all([
    supabase
      .from("crm_account")
      .select("id, name, stage, next_follow_up_at, last_contact_at, research_summary")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("proposal")
      .select("id, title, status, monthly_value, account_id, approved_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const contractsResult = admin
    ? await supabase
        .from("contract")
        .select("id, package_name, mrr, status, renewal_date, account_id")
    : null;

  const rows = accounts ?? [];
  const byStage = new Map<string, number>();
  for (const a of rows) {
    byStage.set(a.stage as string, (byStage.get(a.stage as string) ?? 0) + 1);
  }

  const contracts = contractsResult?.data ?? [];
  const activeMrr = contracts
    .filter((c) => c.status === "active")
    .reduce((sum: number, c) => sum + Number(c.mrr), 0);

  const overdue = rows.filter(
    (a) =>
      a.next_follow_up_at &&
      new Date(a.next_follow_up_at as string) < new Date() &&
      !["won", "lost"].includes(a.stage as string),
  );

  return (
    <>
      <h1>Brokerage pipeline</h1>
      <p className="muted">
        Recurring marketing contracts with brokerages. Outreach, contractual
        commitments and advertising spend all require explicit human approval
        before anything is sent or spent.
      </p>

      <section className="section">
        <div className="grid grid-4">
          {STAGES.slice(0, 4).map((stage) => (
            <div className="stat" key={stage}>
              <div className="label">{stage.replace("_", " ")}</div>
              <div className="value">{byStage.get(stage) ?? 0}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-4" style={{ marginTop: 16 }}>
          <div className="stat">
            <div className="label">Won</div>
            <div className="value">{byStage.get("won") ?? 0}</div>
          </div>
          <div className="stat">
            <div className="label">Proposals</div>
            <div className="value">{proposals?.length ?? 0}</div>
            <div className="note">
              {(proposals ?? []).filter((p) => p.status === "sent").length} sent
            </div>
          </div>
          <div className="stat">
            <div className="label">Active contracts</div>
            <div className="value">
              {admin ? contracts.filter((c) => c.status === "active").length : "—"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Recurring revenue</div>
            <div className="value">
              {admin ? `$${activeMrr.toLocaleString("en-US")}` : "—"}
            </div>
            <div className="note">{admin ? "sum of active MRR" : "administrators only"}</div>
          </div>
        </div>
      </section>

      {overdue.length > 0 ? (
        <div className="notice notice-warn">
          <strong>{overdue.length} follow-up(s) overdue:</strong>{" "}
          {overdue.map((a) => a.name as string).join(", ")}
        </div>
      ) : null}

      <section className="section">
        <h2>Add a prospect</h2>
        <div className="card">
          <ProspectForm />
        </div>
      </section>

      <section className="section">
        <h2>Pipeline ({rows.length})</h2>
        {rows.length === 0 ? (
          <div className="notice notice-info">
            No brokerage prospects yet. Add the first one above.
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Brokerage</th>
                  <th>Stage</th>
                  <th>Next follow-up</th>
                  <th>Last contact</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id as string}>
                    <td>{a.name as string}</td>
                    <td>
                      <span className="badge badge-neutral">
                        {String(a.stage).replace("_", " ")}
                      </span>
                    </td>
                    <td className="mono">
                      {(a.next_follow_up_at as string) ?? "—"}
                    </td>
                    <td className="mono">
                      {a.last_contact_at
                        ? new Date(a.last_contact_at as string).toLocaleDateString("en-US")
                        : "—"}
                    </td>
                    <td className="muted" style={{ maxWidth: 340 }}>
                      {(a.research_summary as string) ?? "—"}
                    </td>
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
