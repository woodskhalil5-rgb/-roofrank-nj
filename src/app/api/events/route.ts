import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { isEventType, recordEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Counts one event.
 *
 * Accepts a single event per request, writes a tally and returns nothing.
 * Requests from another origin are ignored: it is not a protection worth much
 * on its own, but it stops casual noise, and because the endpoint can only
 * ever add one to a counter, there is nothing behind it worth attacking.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const allowed = new URL(publicEnv.siteUrl).host;
      const incoming = new URL(origin).host;
      if (incoming !== allowed && incoming !== request.nextUrl.host) {
        return new NextResponse(null, { status: 204 });
      }
    } catch {
      return new NextResponse(null, { status: 204 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  if (typeof body !== "object" || body === null) {
    return new NextResponse(null, { status: 204 });
  }

  const payload = body as Record<string, unknown>;
  if (!isEventType(payload.event)) {
    return new NextResponse(null, { status: 204 });
  }

  await recordEvent({
    event: payload.event,
    agentId: typeof payload.agentId === "string" ? payload.agentId : null,
    zip: typeof payload.zip === "string" ? payload.zip : null,
    paid: payload.paid === true,
  });

  return new NextResponse(null, { status: 204 });
}
