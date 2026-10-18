import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const user = await requireStaff();
  const admin = isAdmin(user.role);
  const supabase = await createSupabaseServerClient();

  const [
    pendingApprovals,
    drafts,
    published,
    unclaimed,
    pendingClaims,
    towns,
    openTowns,
  ] = await Promise.all([
    supabase.from("approval_request").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("agent").select("id", { count: "exact", head: true }).in("status", ["draft", "pending_review", "changes_requested"]),
    supabase.from("agent").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("agent").select("id", { count: "exact", head: true }).eq("status", "published").is("claim_verified_at", null),
    supabase.from("profile_claim").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("zip_area").select("zip", { count: "exact", head: true }),
    supabase.from("zip_area").select("zip", { count: "exact", head: true }).eq("is_target", true),
  ]);

  return (
    <>
      <h1 style={{ fontSize: "2rem", maxWidth: "none" }}>
        Good to see you{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
      </h1>
      <p className="lede">
        Every number here is counted from real records. Nothing is estimated.
      </p>

      {(pendingApprovals.count ?? 0) > 0 ? (
        <div className="notice notice-warn">
          <strong>
            {pendingApprovals.count} listing{pendingApprovals.count === 1 ? "" : "s"} waiting on you.
          </strong>{" "}
          Nothing reaches the public site until you approve it.{" "}
          <Link href="/admin/approvals">Open the queue</Link>
        </div>
      ) : null}

      <div className="grid grid-4" style={{ marginBottom: 32 }}>
        <Link href="/admin/approvals" className="stat">
          <div className="label">Waiting for approval</div>
          <div className="value">{pendingApprovals.count ?? 0}</div>
          <div className="note">needs a decision</div>
        </Link>
        <Link href="/admin/agents" className="stat">
          <div className="label">In progress</div>
          <div className="value">{drafts.count ?? 0}</div>
          <div className="note">drafts and corrections</div>
        </Link>
        <Link href="/admin/agents?status=published" className="stat">
          <div className="label">Live listings</div>
          <div className="value">{published.count ?? 0}</div>
          <div className="note">on the public site</div>
        </Link>
        <Link href="/admin/claims" className="stat">
          <div className="label">Claims to review</div>
          <div className="value">{pendingClaims.count ?? 0}</div>
          <div className="note">identity not yet checked</div>
        </Link>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Your call list</h3>
          <p className="muted">
            <strong style={{ fontSize: "1.6rem", color: "var(--brand)" }}>
              {unclaimed.count ?? 0}
            </strong>{" "}
            live listings have not been claimed by their agent. Each one is a
            reason to pick up the phone: their listing is already up, verified,
            and free.
          </p>
          <Link className="btn btn-secondary btn-small" href="/admin/agents?status=published">
            See them
          </Link>
        </div>

        <div className="card">
          <h3>Coverage</h3>
          <p className="muted">
            {openTowns.count ?? 0} of {towns.count ?? 0} towns are open to the
            public. A town stays shut until it has listings worth showing.
          </p>
          <Link className="btn btn-secondary btn-small" href="/admin/coverage">
            Manage towns
          </Link>
        </div>
      </div>

      <section className="section" style={{ marginTop: 36 }}>
        <h2>Not connected yet</h2>
        <ul className="muted">
          <li>
            Approval emails are queued but not sent — no email provider is
            configured. The queue above is the source of truth either way.
          </li>
          <li>
            Jersey Home Pros transmission is switched off until its real API is
            confirmed. Consented requests are held, never sent to a guessed
            endpoint.
          </li>
          <li>
            Automated research is off. Listings come from the{" "}
            <Link href="/admin/intake">Add agents</Link> screen until a lawful
            bulk source is authorised.
          </li>
          {!admin ? (
            <li>
              Your role can research and prepare listings but cannot approve or
              publish them.
            </li>
          ) : null}
        </ul>
      </section>
    </>
  );
}
