import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "No access",
  robots: { index: false, follow: false },
};

export default async function NoAccessPage() {
  const user = await getSessionUser();

  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>You do not have access to this area</h1>
        <p className="muted">
          {user
            ? `Your account (${user.email}) exists but has the role "${user.role}", which cannot open internal pages. An administrator has to grant you a staff role.`
            : "You are not signed in."}
        </p>
        <div className="btn-row">
          <Link className="btn btn-secondary" href="/">
            Back to the public site
          </Link>
          {user ? (
            <form action={signOut}>
              <button className="btn btn-secondary" type="submit">
                Sign out
              </button>
            </form>
          ) : (
            <Link className="btn" href="/login">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
