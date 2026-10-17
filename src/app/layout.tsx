import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: "Destiny Marketing Group — Real Estate Professional Directory",
    template: "%s | Destiny Marketing Group",
  },
  description:
    "A verified directory of local real estate professionals, with a published ranking methodology and clearly labelled sponsored placements.",
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
              DESTINY MARKETING GROUP <span>| Real Estate Intelligence</span>
            </Link>
            <nav>
              <Link href="/directory">Directory</Link>
              <Link href="/methodology">Methodology</Link>
              <Link href="/claim">Claim your profile</Link>
              <Link href="/home-services">Home services</Link>
            </nav>
          </div>
        </header>

        {children}

        <footer className="site">
          <div className="wrap">
            <p style={{ marginBottom: 6 }}>
              Destiny Marketing Group — independent real estate directory and
              brokerage marketing services.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Sponsored placements are labelled wherever they appear and never
              change editorial ranking scores. Home-service requests are passed
              to Jersey Home Pros, a separate company, only with the visitor&apos;s
              explicit consent.{" "}
              <Link href="/methodology">How rankings are produced</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
