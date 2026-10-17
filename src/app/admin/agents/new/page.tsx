import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import NewAgentForm from "./NewAgentForm";

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  await requireStaff("/admin/agents/new");

  return (
    <>
      <p className="muted" style={{ marginBottom: 4 }}>
        <Link href="/admin/agents">← Agent profiles</Link>
      </p>
      <h1>New draft profile</h1>
      <p className="muted">
        Use this while automated research sources are still being authorised.
        Everything recorded here carries a source and goes through the same
        approval gate as automated research.
      </p>

      <div className="card">
        <NewAgentForm />
      </div>
    </>
  );
}
