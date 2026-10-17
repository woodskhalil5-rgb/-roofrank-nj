import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  published: "badge badge-ok",
  approved: "badge badge-ok",
  pending_review: "badge badge-warn",
  changes_requested: "badge badge-warn",
  draft: "badge badge-neutral",
  rejected: "badge badge-bad",
  archived: "badge badge-neutral",
};

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaff("/admin/agents");
  const { status } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("agent")
    .select(
      "id, full_name, slug, status, brokerage_name_raw, service_zips, license_number, claim_verified_at, published_at, updated_at",
    );

  if (status) query = query.eq("status", status);

  const { data: agents } = await query
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows = agents ?? [];

  const evidenceCounts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: evidence } = await supabase
      .from("evidence")
      .select("subject_id")
      .eq("subject", "agent")
      .in(
        "subject_id",
        rows.map((r) => r.id as string),
      );
    for (const e of evidence ?? []) {
      const id = e.subject_id as string;
      evidenceCounts.set(id, (evidenceCounts.get(id) ?? 0) + 1);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1>Agent profiles</h1>
        <Link className="btn" href="/admin/agents/new">
          New draft profile
        </Link>
      </div>

      <div className="btn-row" style={{ margin: "10px 0 18px" }}>
        <Link className="btn btn-secondary" href="/admin/agents">All</Link>
        <Link className="btn btn-secondary" href="/admin/agents?status=pending_review">Pending review</Link>
        <Link className="btn btn-secondary" href="/admin/agents?status=published">Published</Link>
        <Link className="btn btn-secondary" href="/admin/agents?status=changes_requested">Needs corrections</Link>
        <Link className="btn btn-secondary" href="/admin/agents?status=rejected">Rejected</Link>
      </div>

      {rows.length === 0 ? (
        <div className="notice notice-info">
          No profiles{status ? ` with status "${status}"` : ""} yet.{" "}
          <Link href="/admin/agents/new">Create the first draft</Link>.
        </div>
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Brokerage</th>
                <th>ZIPs</th>
                <th>Status</th>
                <th>Sources</th>
                <th>Claimed</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const sources = evidenceCounts.get(a.id as string) ?? 0;
                return (
                  <tr key={a.id as string}>
                    <td>
                      {a.status === "published" ? (
                        <Link href={`/agent/${a.slug}`} target="_blank">
                          {a.full_name as string}
                        </Link>
                      ) : (
                        (a.full_name as string)
                      )}
                    </td>
                    <td className="muted">{(a.brokerage_name_raw as string) ?? "—"}</td>
                    <td className="mono">
                      {((a.service_zips as string[]) ?? []).join(", ") || "—"}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[a.status as string] ?? "badge badge-neutral"}>
                        {String(a.status).replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {sources === 0 ? (
                        <span className="badge badge-bad">none</span>
                      ) : (
                        <span className="mono">{sources}</span>
                      )}
                    </td>
                    <td>{a.claim_verified_at ? "yes" : <span className="muted">no</span>}</td>
                    <td className="mono">
                      {new Date(a.updated_at as string).toLocaleDateString("en-US")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
