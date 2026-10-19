"use client";

import { useEffect, useRef } from "react";

export interface TrackPayload {
  event:
    | "placement_impression"
    | "placement_click"
    | "zip_search"
    | "profile_view"
    | "contact_click";
  agentId?: string | null;
  zip?: string | null;
  paid?: boolean;
}

/** Fire-and-forget. Never blocks navigation and never throws at the visitor. */
export function sendEvent(payload: TrackPayload): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* measurement is never worth an error on screen */
  }
}

/**
 * Counts one view when the page is first shown.
 *
 * The pages it sits on are cached and regenerated on a timer, so a count taken
 * while rendering on the server would undercount badly — one tally per
 * regeneration rather than one per visitor. Counting here instead means one
 * tally per page view, which is the number an advertiser is actually asking
 * about.
 */
export default function Track(props: TrackPayload) {
  const { event, agentId, zip, paid } = props;
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    sendEvent({ event, agentId, zip, paid });
  }, [event, agentId, zip, paid]);

  return null;
}
