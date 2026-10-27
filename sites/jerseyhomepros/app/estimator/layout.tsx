import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JHP Estimator",
  description: "Jersey Home Pros estimator.",
  robots: { index: false, follow: false },
  // Installs as its own app ("JHP Estimator"), separate from the homeowner app.
  manifest: "/estimator.webmanifest",
  appleWebApp: { capable: true, title: "JHP Estimator", statusBarStyle: "black" },
};

export default function EstimatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
