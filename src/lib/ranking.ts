import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Ranking is computed only from evidence that has actually been recorded.
 *
 * A criterion scores zero when no sourced evidence supports it. Nothing here
 * uses sales volume, transaction counts or reviews, because the platform holds
 * no authorised source for those; see the published methodology.
 *
 * Sponsorship is never an input. Paid placement lives in sponsored_placement
 * and is rendered as a label.
 */

interface Criterion {
  key: string;
  label: string;
  weight: number;
  description: string;
}

const COMPLETENESS_FIELDS = [
  "full_name",
  "brokerage",
  "public_phone",
  "website",
  "license_number",
  "service_zips",
  "specialties",
] as const;

export interface ScoreBreakdown {
  score: number;
  components: Record<string, { weight: number; earned: number; basis: string }>;
  evidenceCompleteness: number;
}

export async function computeScore(agentId: string): Promise<ScoreBreakdown | null> {
  const supabase = createSupabaseAdminClient();

  const [{ data: methodology }, { data: agent }, { data: evidence }] =
    await Promise.all([
      supabase
        .from("ranking_methodology")
        .select("version, criteria")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("agent")
        .select("id, claim_verified_at, license_verified_at, service_zips")
        .eq("id", agentId)
        .maybeSingle(),
      supabase
        .from("evidence")
        .select("field_name, verification")
        .eq("subject", "agent")
        .eq("subject_id", agentId),
    ]);

  if (!methodology || !agent) return null;

  const criteria = (methodology.criteria ?? []) as Criterion[];
  const rows = evidence ?? [];

  const verifiedFields = new Set(
    rows.filter((r) => r.verification === "verified").map((r) => r.field_name as string),
  );
  const anySourceFields = new Set(rows.map((r) => r.field_name as string));

  const components: ScoreBreakdown["components"] = {};
  let total = 0;

  const sourcedCount = COMPLETENESS_FIELDS.filter((f) => anySourceFields.has(f)).length;
  const completeness = sourcedCount / COMPLETENESS_FIELDS.length;

  for (const criterion of criteria) {
    let earned = 0;
    let basis = "No sourced evidence recorded";

    switch (criterion.key) {
      case "license_verified":
        if (verifiedFields.has("license_status") && agent.license_verified_at) {
          earned = criterion.weight;
          basis = "Licence status verified against a recorded source";
        }
        break;

      case "brokerage_affiliation_verified":
        if (verifiedFields.has("brokerage")) {
          earned = criterion.weight;
          basis = "Brokerage affiliation verified against a recorded source";
        } else if (anySourceFields.has("brokerage")) {
          earned = criterion.weight * 0.4;
          basis = "Brokerage recorded from a source, but not independently verified";
        }
        break;

      case "service_area_documented":
        if (verifiedFields.has("service_zips")) {
          earned = criterion.weight;
          basis = "Service area documented in a recorded source";
        } else if (anySourceFields.has("service_zips")) {
          earned = criterion.weight * 0.5;
          basis = "Service area self-reported or third-party";
        }
        break;

      case "profile_completeness_sourced":
        earned = Math.round(criterion.weight * completeness * 100) / 100;
        basis = `${sourcedCount} of ${COMPLETENESS_FIELDS.length} key fields carry a recorded source`;
        break;

      case "credentials_verified":
        if (verifiedFields.has("specialties") || verifiedFields.has("credentials")) {
          earned = criterion.weight;
          basis = "Credentials confirmed by an authorised source";
        }
        break;

      case "profile_claimed":
        if (agent.claim_verified_at) {
          earned = criterion.weight;
          basis = "Claimed by the agent and verified by an administrator";
        }
        break;

      default:
        basis = "Criterion not implemented; scores zero rather than being assumed";
    }

    components[criterion.key] = { weight: criterion.weight, earned, basis };
    total += earned;
  }

  return {
    score: Math.round(total * 1000) / 1000,
    components,
    evidenceCompleteness: Math.round(completeness * 100) / 100,
  };
}

/** Recomputes and stores the score for every ZIP the agent serves. */
export async function computeAndStoreScore(agentId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const breakdown = await computeScore(agentId);
  if (!breakdown) return;

  const [{ data: methodology }, { data: agent }] = await Promise.all([
    supabase.from("ranking_methodology").select("version").eq("is_active", true).maybeSingle(),
    supabase.from("agent").select("service_zips").eq("id", agentId).maybeSingle(),
  ]);

  if (!methodology || !agent) return;

  const zips = (agent.service_zips ?? []) as string[];
  if (zips.length === 0) return;

  const payload = zips.map((zip) => ({
    agent_id: agentId,
    zip,
    methodology_version: methodology.version as string,
    score: breakdown.score,
    components: breakdown.components,
    evidence_completeness: breakdown.evidenceCompleteness,
    computed_at: new Date().toISOString(),
  }));

  await supabase
    .from("agent_zip_score")
    .upsert(payload, { onConflict: "agent_id,zip,methodology_version" });
}
