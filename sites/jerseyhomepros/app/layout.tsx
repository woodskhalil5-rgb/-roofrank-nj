import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SITE } from "../lib/site";
import "./globals.css";
import { RegisterSW } from "./AppInstall";

export const metadata: Metadata = {
  title: SITE.meta.title,
  description: SITE.meta.description,
  metadataBase: new URL(SITE.url),
  alternates: { canonical: "/" },
  openGraph: { title: SITE.brand, description: SITE.meta.ogDescription, type: "website" },
  // Installable app (PWA). /estimator overrides `manifest` with its own.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "JHP", statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#0a0b0c" };

/**
 * Analytics is opt-in by environment variable. With neither set, no third-party
 * script loads at all — the site stays fast and no visitor data leaves it. That
 * is the right default for a site that promises not to pass people's details
 * around, and it means a missing ID can never break a deploy.
 *
 * Set exactly one in Vercel:
 *   NEXT_PUBLIC_GTM_ID   e.g. GTM-XXXXXXX   (preferred: triggers configured in GTM)
 *   NEXT_PUBLIC_GA_ID    e.g. G-XXXXXXXXXX  (direct gtag, no container)
 *
 * The conversion itself is the `lead_submitted` push in LeadForm.tsx, which
 * fires only after the server confirms a saved lead. Nothing here fires on a
 * page view of the form, so a visit can never be counted as a lead.
 */
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {GTM_ID && (
          <Script id="gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        )}
        {!GTM_ID && GA_ID && (
          <>
            <Script
              id="ga-src"
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA_ID}');`}
            </Script>
          </>
        )}
      </head>
      <body>
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
