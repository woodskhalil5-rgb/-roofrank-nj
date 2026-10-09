import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "RoofRank NJ | Find Trusted Roofing Pros in New Jersey",
  description: "Compare roofing services and request a roofing estimate from participating New Jersey roofing companies.",
  metadataBase: new URL("https://roofranknj.com"),
  alternates: { canonical: "/" },
  openGraph: { title: "RoofRank NJ", description: "A smarter way to find roofing help in New Jersey.", type: "website" }
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}