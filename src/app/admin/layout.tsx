import Link from "next/link";
import type { Metadata } from "next";
import { requireStaff, isAdmin } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "Dashboard",
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
        <div style={{ padding: "0 10px 12px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Destiny MG</div>
          <div className="muted" style={{ fontSize: "0.76rem" }}>
            {user.email}
            <br />
            <span className="badge badge-neutral" style={{ marginTop: 4 }}>
              {user.role}
            </span>
          </div>
        </div>

        <div className="nav-group">Review</div>
        <Link href="/admin">Overview</Link>
        <Link href="/admin/approvals">Profile approvals</Link>
        <Link href="/admin/claims">Agent claims</Link>

        <div className="nav-group">Data</div>
        <Link href="/admin/agents">Agent profiles</Link>
        <Link href="/admin/research">Research runs</Link>
        <Link href="/admin/coverage">ZIP coverage</Link>

        <div className="nav-group">Revenue</div>
        <Link href="/admin/crm">Brokerage pipeline</Link>

        <div className="nav-group">Operations</div>
        <Link href="/admin/service-requests">Home-service requests</Link>
        <Link href="/admin/notifications">Notifications</Link>
        {admin ? <Link href="/admin/users">Users and roles</Link> : null}

        <div style={{ padding: "18px 10px 0" }}>
          <form action={signOut}>
            <button className="btn btn-secondary" type="submit" style={{ width: "100%" }}>
              Sign out
            </button>
          </form>
        </div>

        <div style={{ padding: "14px 10px 0" }}>
          <Link href="/" className="muted" style={{ fontSize: "0.78rem" }}>
            View public site →
          </Link>
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
