import type { Metadata } from "next";
import { SITE } from "../lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: SITE.meta.title,
  description: SITE.meta.description,
  metadataBase: new URL(SITE.url),
  alternates: { canonical: "/" },
  openGraph: { title: SITE.brand, description: SITE.meta.ogDescription, type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
