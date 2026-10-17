import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ResearchForm from "./ResearchForm";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  await requireStaff("/admin/research");
  const supabase = await createSupabaseServerClient();

  const [{ data: runs }, { data: sources }] = await Promise.all([
    supabase
      .from("research_run")
      .select("id, kind, target_zip, status, candidates_found, drafts_created, error_message, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(25),
    supabase
      .from("research_source")
      .select("name, source_type, is_enabled, terms_reviewed_at, restrictions")
      .order("name"),
  ]);

  const enabled = (sources ?? []).filter((s) => s.is_enabled);

  return (
    <>
      <h1>Research runs</h1>
      <p className="muted">
        Research only queries sources whose terms of use have been reviewed and
        recorded. A run that cannot reach an authorised source fails visibly
        rather than producing plausible-looking agents.
      </p>

      {enabled.length <= 1 ? (
        <div className="notice notice-warn">
          <strong>Automated research is not available yet.</strong>
          <p style={{ margin: "6px 0 0" }}>
            No automated source has been authorised. Review the terms of the
            licence register and brokerage sites, record the outcome, and enable
            the sources you may lawfully use. Meanwhile, build the first
            profiles through the{" "}
            <Link href="/admin/agents/new">manual draft form</Link> — they carry
            real sources and pass through the same approval gate.
          </p>
        </div>
      ) : null}

      <section className="section">
        <div className="card">
          <ResearchForm />
        </div>
      </section>

      <section className="section">
        <h2>Source registry</h2>
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Status</th>
                <th>Terms reviewed</th>
              </tr>
            </thead>
            <tbody>
              {(sources ?? []).map((s) => (
                <tr key={s.name as string}>
                  <td>
                    {s.name as string}
                    {s.restrictions ? <div className="hint">{s.restrictions as string}</div> : null}
                  </td>
                  <td className="mono">{s.source_type as string}</td>
                  <td>
                    {s.is_enabled ? (
                      <span className="badge badge-ok">enabled</span>
                    ) : (
                      <span className="badge badge-neutral">not enabled</span>
                    )}
                  </td>
                  <td className="mono">
                    {(s.terms_reviewed_at as string) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Recent runs</h2>
        {(runs?.length ?? 0) === 0 ? (
          <p className="muted">No runs recorded yet.</p>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>ZIP</th>
                  <th>Status</th>
                  <th>Candidates</th>
                  <th>Drafts</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id as string}>
                    <td className="mono">
                      {new Date(r.started_at as string).toLocaleString("en-US")}
                    </td>
                    <td className="mono">{(r.target_zip as string) ?? "—"}</td>
                    <td>
                      <span
                        className={
                          r.status === "completed"
                            ? "badge badge-ok"
                            : r.status === "failed"
                              ? "badge badge-bad"
                              : "badge badge-warn"
                        }
                      >
                        {r.status as string}
                      </span>
                    </td>
                    <td className="mono">{r.candidates_found as number}</td>
                    <td className="mono">{r.drafts_created as number}</td>
                    <td className="muted" style={{ maxWidth: 360 }}>
                      {(r.error_message as string) ?? "—"}
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
