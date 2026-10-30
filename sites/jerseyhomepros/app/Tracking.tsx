"use client";
import { useEffect } from "react";
import { captureAttribution, gpcOn } from "../lib/track";

/**
 * Runs once per page load: remembers which ad brought the visitor, and loads
 * the advertising tags (Google Ads, Meta pixel) when their IDs are set in
 * Vercel. Neither ad tag loads when the browser sends Global Privacy Control.
 * GA4 (site analytics) is loaded separately in layout.tsx.
 */
const META_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

type W = Window & { fbq?: ((...a: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }; _fbq?: unknown; gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };

export function Tracking() {
  useEffect(() => {
    captureAttribution();
    if (gpcOn()) return;
    const w = window as W;

    if (ADS_ID && /^AW-\d+$/.test(ADS_ID)) {
      // gtag may not exist yet if GA hasn't loaded; queue through dataLayer the same way gtag does.
      w.dataLayer = w.dataLayer || [];
      w.gtag = w.gtag || function () { (w.dataLayer as unknown[]).push(arguments); };
      if (!document.getElementById("gads-src")) {
        const s = document.createElement("script");
        s.id = "gads-src"; s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`;
        document.head.appendChild(s);
        w.gtag("js", new Date());
      }
      w.gtag("config", ADS_ID);
    }

    if (META_ID && /^\d{6,20}$/.test(META_ID) && !w.fbq) {
      // Meta's standard base code, written out.
      const n = function (...args: unknown[]) {
        const f = n as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
        if (f.callMethod) f.callMethod(...args); else f.queue.push(args);
      } as unknown as NonNullable<W["fbq"]>;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      w.fbq = n; w._fbq = n;
      const s = document.createElement("script");
      s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
      w.fbq("init", META_ID);
      w.fbq("track", "PageView");
    }
  }, []);
  return null;
}
