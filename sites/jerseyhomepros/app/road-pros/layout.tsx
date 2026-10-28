import type { Metadata } from "next";
import { SITE } from "../../lib/site";

export const metadata: Metadata = {
  title: `Become a Road Pro | ${SITE.brand}`,
  description: "Visit homeowners in South Jersey, take photos and measurements with the JHP app, and earn commission on jobs that sign.",
  alternates: { canonical: "/road-pros" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
