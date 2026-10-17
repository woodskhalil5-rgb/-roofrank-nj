import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jhpConfig, serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const user = await requireStaff();
  const admin = isAdmin(user.role);
  const supabase = await createSupabaseServerClient();
  const env = serverEnv();
  const jhp = jhpConfig();

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    pendingApprovals,
    draftProfiles,
    publishedProfiles,
    flaggedApprovals,
    pendingClaims,
    targetZips,
    unclaimedPublished,
    serviceQueued,
    serviceFailed,
    serviceDelivered,
    notificationsStuck,
    researchFailures,
    inquiries30,
    pageViews30,
  ] = await Promise.all([
    supabase.from("approval_request").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("agent").select("id", { count: "exact", head: true }).in("status", ["draft", "pending_review", "changes_requested"]),
    supabase.from("agent").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("approval_request").select("id", { count: "exact", head: true }).eq("flagged_for_verification", true).eq("status", "pending"),
    supabase.from("profile_claim").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("zip_area").select("zip", { count: "exact", head: true }).eq("is_target", true),
    supabase.from("agent").select("id", { count: "exact", head: true }).eq("status", "published").is("claim_verified_at", null),
    supabase.from("service_request").select("id", { count: "exact", head: true }).in("status", ["received", "validated", "queued"]),
    supabase.from("service_request").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("service_request").select("id", { count: "exact", head: true }).eq("status", "delivered"),
    supabase.from("notification_outbox").select("id", { count: "exact", head: true }).in("status", ["failed", "abandoned"]),
    supabase.from("research_run").select("id", { count: "exact", head: true }).in("status", ["failed", "partial"]),
    supabase.from("site_event").select("id", { count: "exact", head: true }).eq("event_name", "home_service_request_submitted").gte("created_at", since30),
    supabase.from("site_event").select("id", { count: "exact", head: true }).eq("event_name", "page_view").gte("created_at", since30),
  ]);

  const mrr = admin
    ? await supabase.from("contract").select("mrr").eq("status", "active")
    : { data: null };

  const activeMrr = (mrr.data ?? []).reduce(
    (sum: number, row: { mrr: number | string }) => sum + Number(row.mrr),
    0,
  );

  const emailConfigured = env.emailProvider === "resend" && Boolean(env.resendApiKey);

  return (
    <>
      <h1>Overview</h1>
      <p className="muted">
        Every number here is counted from recorded data. Where an integration is
        not yet connected it is labelled rather than filled with a placeholder.
      </p>

      {(pendingApprovals.count ?? 0) > 0 ? (
        <div className="notice notice-warn">
          <strong>
            {pendingApprovals.count} profile
            {pendingApprovals.count === 1 ? "" : "s"} waiting for approval.
          </strong>{" "}
          Nothing is published until an administrator approves it.{" "}
          <Link href="/admin/approvals">Open the review queue →</Link>
        </div>
      ) : null}

      <section className="section">
        <h2>Approval and review</h2>
        <div className="grid grid-4">
          <div className="stat">
            <div className="label">Pending approvals</div>
            <div className="value">{pendingApprovals.count ?? 0}</div>
            <div className="note">awaiting an administrator decision</div>
          </div>
          <div className="stat">
            <div className="label">Flagged for verification</div>
            <div className="value">{flaggedApprovals.count ?? 0}</div>
            <div className="note">needs extra checking before approval</div>
          </div>
          <div className="stat">
            <div className="label">Drafts in progress</div>
            <div className="value">{draftProfiles.count ?? 0}</div>
            <div className="note">not yet submitted or returned for changes</div>
          </div>
          <div className="stat">
            <div className="label">Agent claims pending</div>
            <div className="value">{pendingClaims.count ?? 0}</div>
            <div className="note">identity not yet verified</div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Published directory</h2>
        <div className="grid grid-4">
          <div className="stat">
            <div className="label">Published profiles</div>
            <div className="value">{publishedProfiles.count ?? 0}</div>
            <div className="note">live on the public site</div>
          </div>
          <div className="stat">
            <div className="label">Unclaimed published</div>
            <div className="value">{unclaimedPublished.count ?? 0}</div>
            <div className="note">outreach opportunities</div>
          </div>
          <div className="stat">
            <div className="label">ZIP codes covered</div>
            <div className="value">{targetZips.count ?? 0}</div>
            <div className="note">areas with a public page</div>
          </div>
          <div className="stat">
            <div className="label">Research runs with errors</div>
            <div className="value">{researchFailures.count ?? 0}</div>
            <div className="note">failed or partial</div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Home-service requests</h2>
        {!jhp.configured ? (
          <div className="notice notice-warn">
            <strong>Jersey Home Pros is not connected.</strong> Its real
            endpoint, authentication and request schema have not been verified,
            so nothing is being transmitted. Consented requests are recorded and
            held in the queue, and will be sent once the integration is
            configured and tested.
          </div>
        ) : null}
        <div className="grid grid-4">
          <div className="stat">
            <div className="label">Held in queue</div>
            <div className="value">{serviceQueued.count ?? 0}</div>
            <div className="note">consented, not yet transmitted</div>
          </div>
          <div className="stat">
            <div className="label">Delivery failures</div>
            <div className="value">{serviceFailed.count ?? 0}</div>
            <div className="note">retryable</div>
          </div>
          <div className="stat">
            <div className="label">Delivered to JHP</div>
            <div className="value">{serviceDelivered.count ?? 0}</div>
            <div className="note">confirmed by JHP&apos;s response</div>
          </div>
          <div className="stat">
            <div className="label">Requests (30 days)</div>
            <div className="value">{inquiries30.count ?? 0}</div>
            <div className="note">submitted by visitors</div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Revenue and pipeline</h2>
        <div className="grid grid-4">
          <div className="stat">
            <div className="label">Active recurring revenue</div>
            <div className="value">
              {admin ? `$${activeMrr.toLocaleString("en-US")}` : "—"}
            </div>
            <div className="note">
              {admin ? "sum of active contracts" : "administrators only"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Page views (30 days)</div>
            <div className="value">{pageViews30.count ?? 0}</div>
            <div className="note">recorded site events</div>
          </div>
          <div className="stat">
            <div className="label">Email delivery</div>
            <div className="value" style={{ fontSize: "1rem", paddingTop: 8 }}>
              {emailConfigured ? (
                <span className="badge badge-ok">Configured</span>
              ) : (
                <span className="badge badge-warn">Not configured</span>
              )}
            </div>
            <div className="note">
              {emailConfigured
                ? `notifications to ${env.adminEmail}`
                : "approvals stay visible here regardless"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Notification failures</div>
            <div className="value">{notificationsStuck.count ?? 0}</div>
            <div className="note">
              <Link href="/admin/notifications">view outbox</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
