import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const EVENT_TYPES = [
  "placement_impression",
  "placement_click",
  "zip_search",
  "profile_view",
  "contact_click",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS: Record<EventType, string> = {
  placement_impression: "Homepage impressions",
  placement_click: "Placement clicks",
  zip_search: "ZIP code searches",
  profile_view: "Profile visits",
  contact_click: "Contact clicks",
};

export interface EventInput {
  event: EventType;
  agentId?: string | null;
  zip?: string | null;
  paid?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEventType(value: unknown): value is EventType {
  return (
    typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Adds one to a daily tally.
 *
 * Calls a SECURITY DEFINER function that can do nothing but increment a count,
 * so the public endpoint in front of it cannot read or change anything else.
 * Nothing identifying the visitor is sent or stored — not an address, not a
 * cookie, not an identifier of any kind.
 */
export async function recordEvent(input: EventInput): Promise<void> {
  const supabase = createSupabasePublicClient();

  const agentId =
    input.agentId && UUID.test(input.agentId) ? input.agentId : null;
  const zip = input.zip && /^[0-9]{5}$/.test(input.zip) ? input.zip : null;

  const { error } = await supabase.rpc("record_event", {
    p_event: input.event,
    p_agent: agentId,
    p_zip: zip,
    p_paid: input.paid ?? false,
  });

  if (error) {
    // Measurement must never break a page for a visitor.
    console.error(`record_event(${input.event}) failed: ${error.message}`);
  }
}
