import Link from "next/link";
import type { Metadata } from "next";
import { requireClient } from "@/lib/client";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "Your results",
  robots: { index: false, follow: false },
};

export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireClient();

  return (
    <div className="wrap page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 12,
          borderBottom: "1px solid var(--line)",
          paddingBottom: 14,
          marginBottom: 26,
        }}
      >
        <div>
          <div style={{ fontWeight: 800 }}>Your results</div>
          <div className="muted" style={{ fontSize: "0.86rem" }}>
            {user.email}
          </div>
        </div>
        <div className="btn-row">
          <Link className="btn btn-secondary btn-small" href="/">
            View the site
          </Link>
          <form action={signOut}>
            <button className="btn btn-secondary btn-small" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {children}
    </div>
  );
}
