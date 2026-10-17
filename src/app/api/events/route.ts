import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient, hasServiceRole } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "directory_search",
  "agent_profile_view",
  "claim_form_opened",
  "home_services_form_opened",
]);

/**
 * Records a site event. Only a fixed set of event names is accepted so the
 * table cannot be filled with arbitrary data, and no personal information is
 * stored here — the session id is a random per-visit value from the client.
 */
export async function POST(request: NextRequest) {
  if (!hasServiceRole()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const eventName = String(body.event ?? "");
  if (!ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ ok: false, reason: "unknown_event" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.slice(0, 300) : null;
  const zip = typeof body.zip === "string" && /^[0-9]{5}$/.test(body.zip) ? body.zip : null;
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : null;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("site_event").insert({
    event_name: eventName,
    path,
    zip,
    session_id: sessionId,
    referrer: request.headers.get("referer")?.slice(0, 300) ?? null,
  });

  if (error) {
    return NextResponse.json({ ok: false, reason: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
