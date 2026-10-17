import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jhpConfig } from "@/lib/env";
import RetryButton from "./RetryButton";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  delivered: "badge badge-ok",
  failed: "badge badge-bad",
  queued: "badge badge-warn",
  validated: "badge badge-warn",
  received: "badge badge-neutral",
  rejected: "badge badge-bad",
  cancelled: "badge badge-neutral",
};

export default async function ServiceRequestsPage() {
  const user = await requireStaff("/admin/service-requests");
  const supabase = await createSupabaseServerClient();
  const jhp = jhpConfig();

  const { data: requests } = await supabase
    .from("service_request")
    .select(
      "id, requester_name, requester_email, zip, service_category, status, attempts, last_error, delivered_at, jhp_reference, created_at, consent_record_id",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = requests ?? [];

  return (
    <>
      <h1>Home-service requests</h1>
      <p className="muted">
        Requests visitors explicitly asked us to pass to Jersey Home Pros. Each
        one has a consent record; the database will not accept a request
        without one.
      </p>

      {!jhp.configured ? (
        <div className="notice notice-warn">
          <strong>Transmission to Jersey Home Pros is switched off.</strong>
          <p style={{ margin: "6px 0 0" }}>
            No endpoint, authentication scheme or request schema has been
            verified with JHP yet, so nothing is being sent. Consented requests
            are recorded and held here. To enable: confirm the real integration
            surface with whoever administers JHP, then set JHP_API_BASE_URL,
            JHP_API_KEY and JHP_INTEGRATION_ENABLED=true and test against
            non-production records first.
          </p>
        </div>
      ) : isAdmin(user.role) ? (
        <div style={{ marginBottom: 18 }}>
          <RetryButton label="Retry everything that is due" />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="notice notice-info">No requests have been submitted yet.</div>
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Requester</th>
                <th>ZIP</th>
                <th>Service</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Detail</th>
                {isAdmin(user.role) ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id as string}>
                  <td className="mono">
                    {new Date(r.created_at as string).toLocaleDateString("en-US")}
                  </td>
                  <td>
                    {r.requester_name as string}
                    <div className="muted" style={{ fontSize: "0.78rem" }}>
                      {r.requester_email as string}
                    </div>
                  </td>
                  <td className="mono">{r.zip as string}</td>
                  <td>{String(r.service_category).replace("_", " ")}</td>
                  <td>
                    <span className={STATUS_BADGE[r.status as string] ?? "badge badge-neutral"}>
                      {r.status as string}
                    </span>
                  </td>
                  <td className="mono">{r.attempts as number}</td>
                  <td className="muted" style={{ maxWidth: 280 }}>
                    {r.jhp_reference
                      ? `JHP ref ${r.jhp_reference as string}`
                      : ((r.last_error as string) ?? "—")}
                  </td>
                  {isAdmin(user.role) ? (
                    <td>
                      {r.status === "failed" && jhp.configured ? (
                        <RetryButton requestId={r.id as string} label="Retry" />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
