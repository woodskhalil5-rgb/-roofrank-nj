import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * ZIP-code research pipeline.
 *
 * The pipeline only queries sources that are recorded as enabled in
 * research_source — which happens after someone has reviewed that source's
 * terms of use and recorded the review. Nothing is scraped on the assumption
 * that public visibility implies permission.
 *
 * No source adapters are active yet, so a run against a ZIP code records
 * exactly why it produced nothing instead of inventing candidates. This is
 * deliberate: a run that cannot reach an authorised source must fail visibly,
 * not quietly produce plausible-looking agents.
 */

const AUTOMATABLE_SOURCE_TYPES = [
  "state_licensing",
  "brokerage_site",
  "professional_profile",
  "mls",
] as const;

export interface ResearchRunResult {
  runId: string;
  status: "completed" | "failed" | "partial";
  candidatesFound: number;
  draftsCreated: number;
  sourceErrors: { source: string; reason: string }[];
  message: string;
}

export async function runZipResearch(
  zip: string,
  requestedBy: string,
): Promise<ResearchRunResult> {
  const supabase = createSupabaseAdminClient();

  const { data: run, error: runError } = await supabase
    .from("research_run")
    .insert({
      kind: "zip_agent_discovery",
      target_zip: zip,
      requested_by: requestedBy,
      status: "running",
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Could not start a research run: ${runError?.message}`);
  }

  const runId = run.id as string;

  const { data: sources } = await supabase
    .from("research_source")
    .select("name, source_type, is_enabled, restrictions")
    .in("source_type", AUTOMATABLE_SOURCE_TYPES);

  const all = sources ?? [];
  const enabled = all.filter((s) => s.is_enabled);
  const blocked = all.filter((s) => !s.is_enabled);

  const sourceErrors = blocked.map((s) => ({
    source: s.name as string,
    reason:
      (s.restrictions as string) ??
      "Source is not enabled: its terms of use have not been reviewed and recorded.",
  }));

  if (enabled.length === 0) {
    const message =
      `No authorised automated source is available for ZIP ${zip}. ` +
      `${blocked.length} candidate source(s) are registered but not enabled. ` +
      `Until a source is authorised, build profiles through the manual draft ` +
      `form so that every field still carries a real source.`;

    await supabase
      .from("research_run")
      .update({
        status: "failed",
        candidates_found: 0,
        drafts_created: 0,
        sources_used: [],
        source_errors: sourceErrors,
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      runId,
      status: "failed",
      candidatesFound: 0,
      draftsCreated: 0,
      sourceErrors,
      message,
    };
  }

  // An authorised source exists but no adapter has been written for it yet.
  // Say so rather than returning an empty success.
  const message =
    `${enabled.length} source(s) are authorised for ZIP ${zip}, but no data ` +
    `adapter has been implemented for them yet, so no candidates were ` +
    `retrieved. Implement the adapter for: ` +
    enabled.map((s) => s.name as string).join(", ") +
    `.`;

  await supabase
    .from("research_run")
    .update({
      status: "partial",
      candidates_found: 0,
      drafts_created: 0,
      sources_used: enabled.map((s) => s.name as string),
      source_errors: sourceErrors,
      error_message: message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return {
    runId,
    status: "partial",
    candidatesFound: 0,
    draftsCreated: 0,
    sourceErrors,
    message,
  };
}
