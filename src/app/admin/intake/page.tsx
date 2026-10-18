import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import IntakeForm from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const user = await requireStaff("/admin/intake");
  const supabase = await createSupabaseServerClient();

  const [{ count: pending }, { count: mine }] = await Promise.all([
    supabase
      .from("approval_request")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("agent")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id),
  ]);

  return (
    <>
      <h1 style={{ fontSize: "1.9rem", maxWidth: "none" }}>Add agents</h1>
      <p className="lede">
        Paste what you found. Each line becomes a draft listing for an
        administrator to approve.
      </p>

      <div className="grid grid-4" style={{ marginBottom: 28 }}>
        <div className="stat">
          <div className="label">Waiting for approval</div>
          <div className="value">{pending ?? 0}</div>
          <div className="note">across the whole team</div>
        </div>
        <div className="stat">
          <div className="label">Added by you</div>
          <div className="value">{mine ?? 0}</div>
          <div className="note">all time</div>
        </div>
      </div>

      <div className="card">
        <IntakeForm />
      </div>

      <section className="section" style={{ marginTop: 36 }}>
        <h2>House rules</h2>
        <ul className="muted">
          <li>
            Record facts only — name, licence number and status, brokerage, town,
            publicly listed business phone.
          </li>
          <li>
            Never copy an agent&apos;s biography, headshot or marketing text from
            another website. Leave those blank; we write our own or ask the agent.
          </li>
          <li>
            If you cannot find something, leave it empty. An empty field is
            always better than a guess, and the listing will say it is
            unconfirmed.
          </li>
          <li>
            Always paste the link to the page you actually looked at. A listing
            cannot be saved without one.
          </li>
        </ul>
        <p className="muted">
          Questions about a specific agent? Add them anyway and flag it in the
          approval note — <Link href="/admin/approvals">the review queue</Link> is
          where it gets settled.
        </p>
      </section>
    </>
  );
}
