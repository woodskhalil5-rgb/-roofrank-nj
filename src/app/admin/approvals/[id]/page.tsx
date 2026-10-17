import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeScore } from "@/lib/ranking";
import DecisionPanel from "./DecisionPanel";

export const dynamic = "force-dynamic";

const VERIFICATION_BADGE: Record<string, string> = {
  verified: "badge badge-ok",
  self_reported: "badge badge-neutral",
  third_party: "badge badge-neutral",
  ai_generated: "badge badge-warn",
  unverified: "badge badge-warn",
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireStaff(`/admin/approvals/${id}`);
  const supabase = await createSupabaseServerClient();

  const { data: approval } = await supabase
    .from("approval_request")
    .select("id, subject, subject_id, status, requested_at, decided_at, decision_notes, flagged_for_verification")
    .eq("id", id)
    .maybeSingle();

  if (!approval) notFound();

  const { data: agent } = await supabase
    .from("agent")
    .select("*")
    .eq("id", approval.subject_id as string)
    .maybeSingle();

  if (!agent) notFound();

  const [{ data: evidence }, { data: auditRows }] = await Promise.all([
    supabase
      .from("evidence")
      .select("field_name, field_value, source_url, retrieved_at, method, verification, confidence, notes")
      .eq("subject", "agent")
      .eq("subject_id", agent.id as string)
      .order("field_name"),
    supabase
      .from("audit_log")
      .select("action, actor_email, created_at, after_state")
      .eq("entity_type", "agent")
      .eq("entity_id", agent.id as string)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const runResult = agent.research_run_id
    ? await supabase
        .from("research_run")
        .select("id, kind, target_zip, started_at, status, sources_used, source_errors")
        .eq("id", agent.research_run_id as string)
        .maybeSingle()
    : null;
  const run = runResult?.data ?? null;

  const breakdown = await computeScore(agent.id as string).catch(() => null);
  const citations = evidence ?? [];
  const unsourced = citations.length === 0;

  return (
    <>
      <p className="muted" style={{ marginBottom: 4 }}>
        <Link href="/admin/approvals">← Review queue</Link>
      </p>
      <h1 style={{ marginBottom: 2 }}>{agent.full_name as string}</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span className="badge badge-neutral">{String(agent.status).replace("_", " ")}</span>
        {approval.flagged_for_verification ? (
          <span className="badge badge-warn">Flagged for verification</span>
        ) : null}
        {approval.status !== "pending" ? (
          <span className="badge badge-neutral">
            decision: {String(approval.status).replace("_", " ")}
          </span>
        ) : null}
      </div>

      {unsourced ? (
        <div className="notice notice-bad">
          <strong>No sources recorded for this profile.</strong> Approving it
          would publish facts that cannot be traced to a source. Return it for
          corrections unless you are adding the sources yourself.
        </div>
      ) : null}

      <section className="section">
        <h2>Draft profile</h2>
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <tbody>
              {[
                ["Full name", agent.full_name],
                ["Brokerage (as researched)", agent.brokerage_name_raw],
                ["Licence number", agent.license_number],
                ["Licence status", agent.license_status],
                ["Licence checked", agent.license_verified_at
                  ? new Date(agent.license_verified_at as string).toLocaleString("en-US")
                  : null],
                ["Public phone", agent.public_phone],
                ["Public email", agent.public_email],
                ["Website", agent.website],
                ["Source profile", agent.profile_url],
                ["Service ZIPs", ((agent.service_zips as string[]) ?? []).join(", ")],
                ["Specialties", ((agent.specialties as string[]) ?? []).join(", ")],
                ["Headline", agent.headline],
                ["Bio", agent.bio],
              ].map(([label, value]) => (
                <tr key={String(label)}>
                  <td className="muted" style={{ width: "28%" }}>{label as string}</td>
                  <td>
                    {value ? (
                      String(value)
                    ) : (
                      <span className="muted">Not recorded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Sources and evidence ({citations.length})</h2>
        {unsourced ? (
          <p className="muted">Nothing recorded.</p>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Source</th>
                  <th>Retrieved</th>
                </tr>
              </thead>
              <tbody>
                {citations.map((c, i) => (
                  <tr key={`${c.field_name}-${i}`}>
                    <td className="mono">{c.field_name as string}</td>
                    <td>{(c.field_value as string) ?? <span className="muted">—</span>}</td>
                    <td>
                      <span className={VERIFICATION_BADGE[c.verification as string] ?? "badge badge-neutral"}>
                        {String(c.verification).replace("_", " ")}
                      </span>
                    </td>
                    <td className="muted">{String(c.method).replace("_", " ")}</td>
                    <td>
                      {c.source_url ? (
                        <a href={c.source_url as string} target="_blank" rel="noopener noreferrer">
                          open
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {c.notes ? <div className="hint">{c.notes as string}</div> : null}
                    </td>
                    <td className="mono">
                      {new Date(c.retrieved_at as string).toLocaleDateString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Ranking rationale</h2>
        {!breakdown ? (
          <p className="muted">
            No active ranking methodology, so no score has been computed.
          </p>
        ) : (
          <>
            <p className="muted">
              Score <strong>{breakdown.score}</strong> of 100 · evidence
              completeness {Math.round(breakdown.evidenceCompleteness * 100)}%.
              Sponsorship is not an input.
            </p>
            <div className="table-wrap card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th style={{ width: 90 }}>Earned</th>
                    <th>Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(breakdown.components).map(([key, c]) => (
                    <tr key={key}>
                      <td className="mono">{key}</td>
                      <td className="mono">
                        {c.earned} / {c.weight}
                      </td>
                      <td className="muted">{c.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {run ? (
        <section className="section">
          <h2>Research run</h2>
          <p className="muted mono">
            {String(run.kind)} · {String(run.target_zip ?? "")} ·{" "}
            {new Date(run.started_at as string).toLocaleString("en-US")} ·{" "}
            {String(run.status)}
          </p>
          {Array.isArray(run.source_errors) && run.source_errors.length > 0 ? (
            <div className="notice notice-warn">
              <strong>Source errors during this run:</strong>
              <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>
                {JSON.stringify(run.source_errors, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="section">
        <h2>Decision</h2>
        {approval.status === "pending" ? (
          <div className="card">
            <DecisionPanel approvalId={approval.id as string} canDecide={isAdmin(user.role)} />
          </div>
        ) : (
          <div className="notice notice-info">
            A decision was already recorded
            {approval.decided_at
              ? ` on ${new Date(approval.decided_at as string).toLocaleString("en-US")}`
              : ""}
            : <strong>{String(approval.status).replace("_", " ")}</strong>
            {approval.decision_notes ? ` — ${approval.decision_notes as string}` : ""}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Audit history</h2>
        {(auditRows?.length ?? 0) === 0 ? (
          <p className="muted">No recorded actions for this profile yet.</p>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Who</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {(auditRows ?? []).map((a, i) => (
                  <tr key={i}>
                    <td className="mono">{a.action as string}</td>
                    <td className="muted">{(a.actor_email as string) ?? "system"}</td>
                    <td className="mono">
                      {new Date(a.created_at as string).toLocaleString("en-US")}
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
