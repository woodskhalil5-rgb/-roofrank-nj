import { adminDb, sendEmail } from "./server";
import { SITE } from "./site";
import { tradeOr } from "./trades";

type DB = NonNullable<ReturnType<typeof adminDb>>;
export type AssignResult = { ok: true; repName: string; emailed: boolean; emailError?: string } | { ok: false; error: string };

/**
 * Assigns a visit to a Road Pro and emails them the details. The one place
 * the rule lives: only an active Road Pro whose background check is 'clear'.
 * The commission rate is copied onto the job now, so a later change to the
 * default never rewrites a deal already made.
 */
export async function assignRep(db: DB, estimateId: string, repId: string): Promise<AssignResult> {
  const { data: rep } = await db.from("road_pros").select("id, name, email, active, bg_status, commission_pct").eq("id", repId).single();
  if (!rep || !rep.active) return { ok: false, error: "Pick an active Road Pro." };
  if (rep.bg_status !== "clear") return { ok: false, error: `${rep.name}'s background check isn't marked clear yet. Visits can't be assigned until it is.` };
  const { data: e } = await db.from("estimates").select("id, trade, zip, homeowner_name, homeowner_phone, address, visit_times, problem").eq("id", estimateId).single();
  if (!e) return { ok: false, error: "Job not found." };
  const { data: s } = await db.from("estimator_settings").select("rep_commission_pct").eq("id", 1).single();
  const now = new Date().toISOString();
  const { error } = await db.from("estimates").update({
    rep_id: rep.id, assigned_at: now, updated_at: now,
    rep_commission_pct: rep.commission_pct ?? s?.rep_commission_pct ?? null,
  }).eq("id", estimateId);
  if (error) return { ok: false, error: "Couldn't assign." };

  const mail = await sendEmail(rep.email, `New JHP site visit: ${tradeOr(e.trade).label} in ${e.zip || "NJ"}`, [
    `${rep.name},`, "",
    `You have a new free site visit.`, "",
    `Homeowner: ${e.homeowner_name || "—"}`,
    ...(e.homeowner_phone ? [`Phone: ${e.homeowner_phone} (call or text today to confirm the time)`] : []),
    ...(e.address ? [`Address: ${e.address}`] : []),
    ...(e.visit_times ? [`Best times: ${e.visit_times}`] : []),
    ...(e.problem ? ["", `What they said: ${e.problem}`] : []),
    "", `Open it in the JHP Estimator app: ${SITE.url}/estimator`, "", `— ${SITE.brand}`,
  ].join("\n"));
  return { ok: true, repName: rep.name, emailed: mail.ok, emailError: mail.ok ? undefined : mail.error };
}

/** First name only, for homeowner-facing emails. */
export const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? "";
