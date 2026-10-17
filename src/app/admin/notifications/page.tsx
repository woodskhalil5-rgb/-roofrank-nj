import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import DrainButton from "./DrainButton";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  sent: "badge badge-ok",
  queued: "badge badge-warn",
  failed: "badge badge-bad",
  abandoned: "badge badge-bad",
};

export default async function NotificationsPage() {
  const user = await requireStaff("/admin/notifications");
  const supabase = await createSupabaseServerClient();
  const env = serverEnv();

  const { data: messages } = await supabase
    .from("notification_outbox")
    .select("id, kind, recipient, subject, status, attempts, last_error, created_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = messages ?? [];
  const configured = env.emailProvider === "resend" && Boolean(env.resendApiKey) && Boolean(env.emailFrom);

  return (
    <>
      <h1>Notifications</h1>
      <p className="muted">
        Approval and claim notifications are queued here first and then
        delivered. A delivery failure never hides an approval — it stays in the
        review queue either way.
      </p>

      {!configured ? (
        <div className="notice notice-warn">
          <strong>No email provider is configured.</strong>
          <p style={{ margin: "6px 0 0" }}>
            Messages are being retained with an explanatory error rather than
            consuming their retry budget. Set EMAIL_PROVIDER=resend,
            RESEND_API_KEY and EMAIL_FROM to start delivering to{" "}
            <span className="mono">{env.adminEmail}</span>. Until then, work the
            review queue directly.
          </p>
        </div>
      ) : (
        <p className="muted">
          Delivering to <span className="mono">{env.adminEmail}</span> via Resend.
        </p>
      )}

      {isAdmin(user.role) ? <DrainButton /> : null}

      {rows.length === 0 ? (
        <div className="notice notice-info">Nothing has been queued yet.</div>
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Queued</th>
                <th>Kind</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id as string}>
                  <td className="mono">
                    {new Date(m.created_at as string).toLocaleDateString("en-US")}
                  </td>
                  <td className="mono">{m.kind as string}</td>
                  <td className="muted">{m.recipient as string}</td>
                  <td>{m.subject as string}</td>
                  <td>
                    <span className={BADGE[m.status as string] ?? "badge badge-neutral"}>
                      {m.status as string}
                    </span>
                  </td>
                  <td className="mono">{m.attempts as number}</td>
                  <td className="muted" style={{ maxWidth: 300 }}>
                    {(m.last_error as string) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
