"use client";
import { useEffect } from "react";

/**
 * Counts a profile view from the browser rather than from the server render,
 * so link previews, prefetches and crawlers that never run JavaScript are not
 * counted as people. Fire-and-forget: a failed count never affects the page.
 */
export default function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const body = JSON.stringify({ slug });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/pros/view", new Blob([body], { type: "application/json" }));
        return;
      }
    } catch {
      /* fall through */
    }
    fetch("/api/pros/view", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
      .catch(() => {});
  }, [slug]);
  return null;
}
