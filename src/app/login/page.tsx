import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isStaff } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = next && next.startsWith("/") ? next : "/admin";

  const user = await getSessionUser();
  if (user && isStaff(user.role)) {
    redirect(target);
  }

  return (
    <main className="page">
      <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: "1.45rem" }}>Staff sign-in</h1>
        <p className="muted">
          This area is for Destiny Marketing Group staff. Agents do not need an
          account to claim a profile.
        </p>
        <div className="card">
          <LoginForm next={target} />
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          Accounts are created by an administrator. A new sign-up has no access
          until an administrator grants a role.
        </p>
      </div>
    </main>
  );
}
