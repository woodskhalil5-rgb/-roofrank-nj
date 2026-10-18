"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import {
  SOURCE_KIND_VERIFICATION,
  parsePastedAgents,
  slugifyName,
  type SourceKind,
} from "@/lib/intake";

export interface IntakeState {
  status: "idle" | "ok" | "error";
  message?: string;
  created?: number;
  skipped?: { line: number; raw: string; problems: string[] }[];
  failed?: { name: string; reason: string }[];
}

const SOURCE_KINDS: SourceKind[] = [
  "state_register",
  "brokerage_site",
  "agent_told_us",
  "other",
];

/**
 * Takes pasted research and turns each line into a draft listing waiting for
 * approval.
 *
 * Nothing here can publish. Every listing is created as a draft, moved to
 * pending_review, and given an approval request. The database refuses to
 * publish anything that an administrator has not approved, so a researcher
 * cannot put an agent on the public site even by accident.
 */
export async function submitPastedAgents(
  _prev: IntakeState,
  formData: FormData,
): Promise<IntakeState> {
  const user = await requireStaff("/admin/intake");
  const supabase = await createSupabaseServerClient();

  const pasted = String(formData.get("pasted") ?? "");
  const batchSourceUrl = String(formData.get("batchSourceUrl") ?? "").trim();
  const sourceKindRaw = String(formData.get("sourceKind") ?? "other");
  const sourceKind: SourceKind = SOURCE_KINDS.includes(sourceKindRaw as SourceKind)
    ? (sourceKindRaw as SourceKind)
    : "other";
  const verification = SOURCE_KIND_VERIFICATION[sourceKind];

  if (pasted.trim().length === 0) {
    return { status: "error", message: "Paste at least one line of research first." };
  }

  if (batchSourceUrl && !/^https?:\/\//i.test(batchSourceUrl)) {
    return {
      status: "error",
      message: "The source link should start with https://",
    };
  }

  const parsed = parsePastedAgents(pasted);

  if (parsed.usable.length === 0) {
    return {
      status: "error",
      message:
        "None of those lines could be read. Check that the columns are separated by a tab or a | character.",
      skipped: parsed.rejected.map((r) => ({
        line: r.line,
        raw: r.raw,
        problems: r.problems,
      })),
    };
  }

  let created = 0;
  const failed: { name: string; reason: string }[] = [];

  for (const row of parsed.usable) {
    const sourceUrl = row.sourceUrl || batchSourceUrl;

    if (!sourceUrl) {
      failed.push({
        name: row.fullName,
        reason:
          "No source link for this agent. Add one on the line, or set a link for the whole batch.",
      });
      continue;
    }

    const { data: agent, error: agentError } = await supabase
      .from("agent")
      .insert({
        full_name: row.fullName,
        slug: slugifyName(row.fullName),
        brokerage_name_raw: row.brokerage || null,
        license_number: row.licenseNumber || null,
        license_status: row.licenseStatus || null,
        license_verified_at:
          row.licenseStatus && verification === "verified"
            ? new Date().toISOString()
            : null,
        public_phone: row.phone || null,
        service_zips: row.zips,
        status: "draft",
        created_by: user.id,
      })
      .select("id, full_name")
      .single();

    if (agentError || !agent) {
      failed.push({
        name: row.fullName,
        reason: agentError?.message ?? "Could not be saved",
      });
      continue;
    }

    // One evidence row per fact that actually has a value.
    const facts: { field: string; value: string }[] = [];
    if (row.brokerage) facts.push({ field: "brokerage", value: row.brokerage });
    if (row.licenseStatus)
      facts.push({ field: "license_status", value: row.licenseStatus });
    if (row.phone) facts.push({ field: "public_phone", value: row.phone });
    if (row.zips.length > 0)
      facts.push({ field: "service_zips", value: row.zips.join(", ") });

    if (facts.length > 0) {
      const { error: evidenceError } = await supabase.from("evidence").insert(
        facts.map((f) => ({
          subject: "agent" as const,
          subject_id: agent.id as string,
          field_name: f.field,
          field_value: f.value,
          source_url: sourceUrl,
          method: "manual" as const,
          verification,
          recorded_by: user.id,
          retrieved_at: new Date().toISOString(),
        })),
      );

      if (evidenceError) {
        failed.push({
          name: row.fullName,
          reason: `Saved, but its sources could not be recorded: ${evidenceError.message}`,
        });
        continue;
      }
    }

    const { error: statusError } = await supabase
      .from("agent")
      .update({ status: "pending_review" })
      .eq("id", agent.id as string);

    if (statusError) {
      failed.push({
        name: row.fullName,
        reason: `Saved, but could not be sent for approval: ${statusError.message}`,
      });
      continue;
    }

    const { error: approvalError } = await supabase
      .from("approval_request")
      .insert({
        subject: "agent",
        subject_id: agent.id as string,
        requested_by: user.id,
      });

    if (approvalError) {
      failed.push({
        name: row.fullName,
        reason: `Saved, but no approval request opened: ${approvalError.message}`,
      });
      continue;
    }

    created += 1;
  }

  if (created > 0) {
    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "intake.batch_submitted",
      entityType: "agent",
      after: {
        created,
        skipped: parsed.rejected.length,
        failed: failed.length,
        source_kind: sourceKind,
        source_url: batchSourceUrl || "per-line",
      },
    });
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/agents");
  revalidatePath("/admin");

  return {
    status: created > 0 ? "ok" : "error",
    message:
      created > 0
        ? `${created} listing${created === 1 ? "" : "s"} sent for approval. Nothing is public until you approve it.`
        : "Nothing could be saved. See the problems below.",
    created,
    skipped: parsed.rejected.map((r) => ({
      line: r.line,
      raw: r.raw,
      problems: r.problems,
    })),
    failed,
  };
}
