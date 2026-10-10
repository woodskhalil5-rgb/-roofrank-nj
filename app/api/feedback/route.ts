import { NextResponse } from "next/server";
import { adminDb } from "../../../lib/server";

const ANSWERS = ["hired", "deciding", "no_contact"] as const;
type Answer = (typeof ANSWERS)[number];

/**
 * Public, token-authenticated. The token is an unguessable uuid that exists only
 * in the homeowner's follow-up email, so no sign-in is needed and nothing else
 * about the lead is ever exposed.
 *
 * GET because it is reached by clicking a link in an email client.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  const answer = (url.searchParams.get("a") ?? "").trim() as Answer;
  const rooferId = (url.searchParams.get("r") ?? "").trim();
  const unsub = url.searchParams.get("unsub") === "1";

  if (!/^[0-9a-f-]{36}$/i.test(token)) return done("That link isn't valid.", false);

  const db = adminDb();
  if (!db) return done("We couldn't record that just now. Please try again later.", false);

  const { data: lead } = await db
    .from("leads")
    .select("id, feedback")
    .eq("feedback_token", token)
    .maybeSingle();

  if (!lead) return done("That link isn't valid or has expired.", false);

  if (unsub) {
    await db.from("leads").update({ unsubscribed: true }).eq("id", lead.id);
    return done("You're unsubscribed. We won't email you again about this request.", true);
  }

  if (!ANSWERS.includes(answer)) return done("That link isn't valid.", false);

  // First answer wins; a second click must not silently overwrite the first.
  if (lead.feedback) {
    return done("Thanks — we already have your answer recorded.", true);
  }

  await db
    .from("leads")
    .update({
      feedback: answer,
      feedback_at: new Date().toISOString(),
      feedback_roofer_id: /^[0-9a-f-]{36}$/i.test(rooferId) ? rooferId : null,
    })
    .eq("id", lead.id);

  const msg =
    answer === "hired"
      ? "Thanks for letting us know — glad you found someone."
      : answer === "deciding"
        ? "Thanks. Good luck with the decision."
        : "Thanks for telling us. We're sorry nobody reached out, and we'll follow up with the companies involved.";

  return done(msg, true);
}

function done(message: string, ok: boolean) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>RoofRank NJ</title>
<style>
:root{--gold:#d6ad58;--cream:#f4f0e7}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--cream);
 color:#171817;font-family:Arial,Helvetica,sans-serif;padding:24px}
.card{background:#fff;border:1px solid #e4dfd4;padding:clamp(28px,7vw,52px);
 max-width:520px;text-align:center}
.mark{display:inline-grid;place-items:center;width:44px;height:44px;border:1px solid var(--gold);
 color:var(--gold);font-family:Georgia,serif;font-size:28px;margin-bottom:20px}
h1{font:400 clamp(24px,5vw,32px)/1.2 Georgia,serif;margin:0 0 14px}
p{font-size:14px;line-height:1.8;color:#60615a;margin:0 0 22px}
a{display:inline-block;background:var(--gold);color:#10100e;padding:14px 22px;
 font-size:12px;font-weight:800;text-decoration:none}
</style></head><body><div class="card"><span class="mark">R</span>
<h1>${ok ? "Thank you" : "Something's not right"}</h1>
<p>${message}</p>
<a href="https://roofranknj.com">Back to RoofRank NJ</a>
</div></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
