import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, isAdmin } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireStaff();
  const admin = isAdmin(user.role);

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div style={{ padding: "0 12px 14px" }}>
          <div style={{ fontWeight: 800 }}>Destiny MG</div>
          <div className="muted" style={{ fontSize: "0.82rem", lineHeight: 1.4 }}>
            {user.email}
          </div>
          <span className="badge badge-neutral" style={{ marginTop: 6 }}>
            {user.role}
          </span>
        </div>

        <div className="nav-group">Daily work</div>
        <Link href="/admin">Overview</Link>
        <Link href="/admin/intake">Add agents</Link>
        <Link href="/admin/approvals">Approvals</Link>
        <Link href="/admin/claims">Claims</Link>

        <div className="nav-group">Data</div>
        <Link href="/admin/agents">All listings</Link>
        <Link href="/admin/coverage">Towns</Link>
        <Link href="/admin/analytics">Measurement</Link>
        <Link href="/admin/placements">Placements</Link>

        {admin ? (
          <>
            <div className="nav-group">Admin</div>
            <Link href="/admin/users">Team</Link>
            <Link href="/admin/clients">Client access</Link>
          </>
        ) : null}

        <div style={{ padding: "20px 12px 0" }}>
          <form action={signOut}>
            <button className="btn btn-secondary btn-small" type="submit" style={{ width: "100%" }}>
              Sign out
            </button>
          </form>
          <Link href="/" className="muted" style={{ fontSize: "0.84rem", display: "block", marginTop: 12 }}>
            View public site
          </Link>
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
