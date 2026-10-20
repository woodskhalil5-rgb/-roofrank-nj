import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import GrantForm, { type Option } from "./GrantForm";
import { revokeClientAccess } from "./actions";

export const dynamic = "force-dynamic";

interface AccessRow {
  id: string;
  user_id: string;
  agent_id: string | null;
  brokerage_id: string | null;
  granted_at: string;
  revoked_at: string | null;
  note: string | null;
}

export default async function ClientsPage() {
  await requireAdmin("/admin/clients");
  const supabase = await createSupabaseServerClient();

  const [accessResult, { data: accounts }, { data: agents }, { data: brokerages }] =
    await Promise.all([
      supabase
        .from("client_access")
        .select(
          "id, user_id, agent_id, brokerage_id, granted_at, revoked_at, note",
        )
        .order("granted_at", { ascending: false }),
      supabase
        .from("app_user")
        .select("id, email, full_name, role, is_active")
        .eq("role", "readonly")
        .eq("is_active", true)
        .order("email"),
      supabase
        .from("agent")
        .select("id, full_name, status")
        .eq("status", "published")
        .order("full_name"),
      supabase.from("brokerage").select("id, name").order("name"),
    ]);

  const notConfigured =
    accessResult.error !== null &&
    (accessResult.error.code === "42P01" ||
      accessResult.error.message.includes("does not exist"));

  const rows = (accessResult.data ?? []) as AccessRow[];

  const accountOptions: Option[] = (accounts ?? []).map((a) => ({
    id: a.id as string,
    label: `${a.email as string}${a.full_name ? ` (${a.full_name})` : ""}`,
  }));
  const agentOptions: Option[] = (agents ?? []).map((a) => ({
    id: a.id as string,
    label: a.full_name as string,
  }));
  const brokerageOptions: Option[] = (brokerages ?? []).map((b) => ({
    id: b.id as string,
    label: b.name as string,
  }));

  const emailOf = new Map(
    (accounts ?? []).map((a) => [a.id as string, a.email as string]),
  );
  const agentName = new Map(
    (agents ?? []).map((a) => [a.id as string, a.full_name as string]),
  );
  const brokerageName = new Map(
    (brokerages ?? []).map((b) => [b.id as string, b.name as string]),
  );

  const live = rows.filter((r) => r.revoked_at === null);

  return (
    <>
      <h1>Client access</h1>
      <p className="muted">
        Who can sign in and see their own results. A client sees tallies for
        their own listings and nothing else: not another advertiser&apos;s
        numbers, not the directory&apos;s internals, and nothing they can
        change.
      </p>

      {notConfigured ? (
        <div className="notice notice-warn">
          <strong>Client access is not set up in the database yet.</strong>
          <p style={{ margin: "6px 0 0" }}>
            The migration <span className="mono">0011_client_access.sql</span>{" "}
            is in the repository and needs applying to Supabase. Until then this
            screen can list accounts but cannot grant anything, and the portal
            will turn clients away.
          </p>
        </div>
      ) : null}

      <section className="section">
        <h2>Grant access</h2>
        <div className="card">
          <GrantForm
            accounts={accountOptions}
            agents={agentOptions}
            brokerages={brokerageOptions}
          />
        </div>
      </section>

      <section className="section">
        <h2>Current access</h2>
        {live.length === 0 ? (
          <p className="muted">Nobody has client access yet.</p>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Can see</th>
                  <th>Granted</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {live.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {emailOf.get(r.user_id) ?? (
                        <span className="mono">{r.user_id.slice(0, 8)}</span>
                      )}
                    </td>
                    <td>
                      {r.agent_id ? (
                        agentName.get(r.agent_id) ?? "one listing"
                      ) : r.brokerage_id ? (
                        <>
                          {brokerageName.get(r.brokerage_id) ?? "a brokerage"}{" "}
                          <span className="badge badge-neutral">
                            all its agents
                          </span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="mono">
                      {new Date(r.granted_at).toLocaleDateString("en-US")}
                    </td>
                    <td className="muted">{r.note ?? "—"}</td>
                    <td>
                      <form action={revokeClientAccess}>
                        <input type="hidden" name="accessId" value={r.id} />
                        <button
                          className="btn btn-secondary btn-small"
                          type="submit"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          Revoking removes their sign-in access and changes nothing about the
          listing, which stays in the directory either way.
        </p>
      </section>
    </>
  );
}
