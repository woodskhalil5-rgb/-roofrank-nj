import { NextResponse, type NextRequest } from "next/server";
import { drainOutbox } from "@/lib/notify";
import { retryDueServiceRequests } from "@/lib/jhp";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Scheduled maintenance: retry queued notifications and failed JHP deliveries.
 *
 * Protected by a shared secret because it runs without a user session. It is
 * never reachable from the browser without that secret, and it performs no
 * action a user could not see the result of in the dashboard.
 */
export async function POST(request: NextRequest) {
  const env = serverEnv();

  if (!env.jobSecret) {
    return NextResponse.json(
      { error: "JOB_SECRET is not configured; scheduled jobs are disabled." },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-job-secret");

  if (provided !== env.jobSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await drainOutbox();
  const serviceRequests = await retryDueServiceRequests();

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    notifications,
    serviceRequests,
  });
}
