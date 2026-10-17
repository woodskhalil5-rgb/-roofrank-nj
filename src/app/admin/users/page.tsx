import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import RoleForm from "./RoleForm";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requireAdmin("/admin/users");
  const supabase = await createSupabaseServerClient();
  const env = serverEnv();

  const [{ data: users }, { data: bootstrap }, { data: recentAudit }] =
    await Promise.all([
      supabase
        .from("app_user")
        .select("id, email, full_name, role, is_active, created_at")
        .order("created_at", { ascending: true }),
      supabase.from("role_bootstrap").select("email, role, note").order("email"),
      supabase
        .from("audit_log")
        .select("action, actor_email, entity_id, before_state, after_state, created_at")
        .eq("entity_type", "app_user")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  return (
    <>
      <h1>Users and roles</h1>
      <p className="muted">
        A new sign-up gets the <span className="mono">readonly</span> role and
        can see nothing internal until an administrator changes it. Only
        owner and admin can approve or publish profiles.
      </p>

      <section className="section">
        <h2>Accounts ({users?.length ?? 0})</h2>
        {(users?.length ?? 0) === 0 ? (
          <div className="notice notice-warn">
            No accounts exist yet. Create the first administrator in the Supabase
            dashboard under Authentication → Users, using an email on the
            bootstrap list below. The role is applied automatically on sign-up.
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th style={{ width: 200 }}>Change role</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id as string}>
                    <td>
                      {u.email as string}
                      {u.id === actor.id ? (
                        <span className="badge badge-neutral" style={{ marginLeft: 6 }}>
                          you
                        </span>
                      ) : null}
                    </td>
                    <td className="muted">{(u.full_name as string) ?? "—"}</td>
                    <td>
                      <span className="badge badge-neutral">{u.role as string}</span>
                    </td>
                    <td>{u.is_active ? "yes" : "no"}</td>
                    <td>
                      {u.id === actor.id ? (
                        <span className="muted">—</span>
                      ) : (
                        <RoleForm userId={u.id as string} currentRole={u.role as string} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Bootstrap allowlist</h2>
        <p className="muted">
          These addresses receive their role automatically the first time they
          sign up. Approval notifications are sent to{" "}
          <span className="mono">{env.adminEmail}</span>.
        </p>
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role on first sign-up</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {(bootstrap ?? []).map((b) => (
                <tr key={b.email as string}>
                  <td className="mono">{b.email as string}</td>
                  <td>
                    <span className="badge badge-neutral">{b.role as string}</span>
                  </td>
                  <td className="muted">{(b.note as string) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(recentAudit?.length ?? 0) > 0 ? (
        <section className="section">
          <h2>Recent permission changes</h2>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>By</th>
                  <th>Change</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {(recentAudit ?? []).map((a, i) => (
                  <tr key={i}>
                    <td className="mono">{a.action as string}</td>
                    <td className="muted">{(a.actor_email as string) ?? "system"}</td>
                    <td className="mono">
                      {JSON.stringify(a.before_state)} → {JSON.stringify(a.after_state)}
                    </td>
                    <td className="mono">
                      {new Date(a.created_at as string).toLocaleString("en-US")}
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
