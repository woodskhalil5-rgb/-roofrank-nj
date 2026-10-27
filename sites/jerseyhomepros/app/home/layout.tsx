import type { Metadata } from "next";
import { SITE } from "../../lib/site";

export const metadata: Metadata = {
  title: `Your Home Board | ${SITE.brand}`,
  description: "Keep track of your home to-dos and the requests you've sent through Jersey Home Pros.",
  robots: { index: false, follow: false },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
