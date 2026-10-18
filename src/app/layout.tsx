import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: "Find a real estate agent in New Jersey | Destiny Marketing Group",
    template: "%s | Destiny Marketing Group",
  },
  description:
    "Find local real estate agents by ZIP code. Every licence is checked against the state register, and agents can claim and correct their own listing for free.",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="wrap masthead-inner">
            <Link href="/" className="logo">
              Destiny Marketing Group
              <span>New Jersey real estate directory</span>
            </Link>
            <nav>
              <Link href="/directory">Find an agent</Link>
              <Link href="/methodology">How we check</Link>
              <Link href="/home-services">Home services</Link>
              <Link href="/claim" className="nav-cta">
                Claim your listing
              </Link>
            </nav>
          </div>
        </header>

        {children}

        <footer className="site">
          <div className="wrap">
            <p style={{ marginBottom: 8, fontWeight: 600, color: "var(--ink-2)" }}>
              Destiny Marketing Group — New Jersey real estate directory
            </p>
            <p style={{ margin: 0 }}>
              Agents are listed free and can claim or correct their listing at no
              cost. Sponsored listings are labelled wherever they appear and
              never change the order of results.{" "}
              <Link href="/methodology">How we check listings</Link>. Home-service
              requests are passed to Jersey Home Pros, a separate company, only
              when you ask us to.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
