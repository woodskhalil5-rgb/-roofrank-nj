"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notify";
import { serverEnv } from "@/lib/env";
import { zipSchema } from "@/lib/validation";
import { SOURCED_FIELDS } from "@/lib/sourced-fields";

export interface DraftState {
  status: "idle" | "ok" | "error";
  message?: string;
  errors?: Record<string, string>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

/**
 * Creates a draft profile together with its evidence, then puts it in the
 * administrator review queue.
 *
 * Nothing here can publish. The profile is created as a draft, moved to
 * pending_review, and an approval request is opened. Publication requires an
 * administrator decision, which the database enforces independently.
 */
export async function createDraftProfile(
  _prev: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const user = await requireStaff("/admin/agents/new");
  const supabase = await createSupabaseServerClient();
  const env = serverEnv();

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 3) {
    return { status: "error", message: "Enter the agent's full name." };
  }

  const zipsRaw = String(formData.get("serviceZips") ?? "").trim();
  const zips = zipsRaw
    .split(/[,\s]+/)
    .map((z) => z.trim())
    .filter(Boolean);

  for (const zip of zips) {
    if (!zipSchema.safeParse(zip).success) {
      return { status: "error", message: `"${zip}" is not a five-digit ZIP code.` };
    }
  }

  const specialties = String(formData.get("specialties") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const licenseVerifiedSource = String(formData.get("source_license_status") ?? "").trim();
  const licenseVerification = String(formData.get("verification_license_status") ?? "unverified");

  const baseSlug = slugify(fullName);
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

  const { data: agent, error: agentError } = await supabase
    .from("agent")
    .insert({
      full_name: fullName,
      slug,
      brokerage_name_raw: String(formData.get("brokerage") ?? "").trim() || null,
      public_email: String(formData.get("publicEmail") ?? "").trim() || null,
      public_phone: String(formData.get("publicPhone") ?? "").trim() || null,
      website: String(formData.get("website") ?? "").trim() || null,
      profile_url: String(formData.get("profileUrl") ?? "").trim() || null,
      license_number: String(formData.get("licenseNumber") ?? "").trim() || null,
      license_status: String(formData.get("licenseStatus") ?? "").trim() || null,
      license_verified_at:
        licenseVerification === "verified" && licenseVerifiedSource
          ? new Date().toISOString()
          : null,
      headline: String(formData.get("headline") ?? "").trim() || null,
      bio: String(formData.get("bio") ?? "").trim() || null,
      service_zips: zips,
      specialties,
      status: "draft",
      created_by: user.id,
    })
    .select("id, full_name, slug")
    .single();

  if (agentError || !agent) {
    return { status: "error", message: `Could not create the draft: ${agentError?.message}` };
  }

  // Record one evidence row per field that was given a source.
  const evidenceRows = SOURCED_FIELDS.flatMap((field) => {
    const sourceUrl = String(formData.get(`source_${field.key}`) ?? "").trim();
    if (!sourceUrl) return [];

    const verification = String(
      formData.get(`verification_${field.key}`) ?? "unverified",
    );

    let value: string | null = null;
    if (field.key === "brokerage") value = String(formData.get("brokerage") ?? "") || null;
    if (field.key === "license_status") value = String(formData.get("licenseStatus") ?? "") || null;
    if (field.key === "public_phone") value = String(formData.get("publicPhone") ?? "") || null;
    if (field.key === "service_zips") value = zips.join(", ") || null;
    if (field.key === "specialties") value = specialties.join(", ") || null;

    return [
      {
        subject: "agent" as const,
        subject_id: agent.id as string,
        field_name: field.key,
        field_value: value,
        source_url: sourceUrl,
        method: "manual" as const,
        verification,
        recorded_by: user.id,
        retrieved_at: new Date().toISOString(),
      },
    ];
  });

  if (evidenceRows.length > 0) {
    const { error: evidenceError } = await supabase.from("evidence").insert(evidenceRows);
    if (evidenceError) {
      return {
        status: "error",
        message: `The draft was created but its sources could not be saved: ${evidenceError.message}. Add them before submitting for approval.`,
      };
    }
  }

  // Move into the review queue.
  const { error: statusError } = await supabase
    .from("agent")
    .update({ status: "pending_review" })
    .eq("id", agent.id as string);

  if (statusError) {
    return { status: "error", message: `Could not submit for review: ${statusError.message}` };
  }

  const { data: approval, error: approvalError } = await supabase
    .from("approval_request")
    .insert({
      subject: "agent",
      subject_id: agent.id as string,
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (approvalError || !approval) {
    return {
      status: "error",
      message: `The draft was saved but no approval request could be opened: ${approvalError?.message}`,
    };
  }

  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "agent.draft_submitted_for_approval",
    entityType: "agent",
    entityId: agent.id as string,
    after: {
      approval_id: approval.id,
      evidence_rows: evidenceRows.length,
      service_zips: zips,
    },
  });

  // Notification is best-effort; the queue entry above is the real record.
  let notificationNote = "";
  try {
    await queueNotification({
      kind: "profile_approval_required",
      recipient: env.adminEmail,
      subject: `Approval required: ${agent.full_name}`,
      bodyText: [
        `A draft agent profile is waiting for your approval.`,
        ``,
        `Agent: ${agent.full_name}`,
        `Prepared by: ${user.email}`,
        `Sourced fields: ${evidenceRows.length}`,
        `Service ZIPs: ${zips.join(", ") || "none recorded"}`,
        ``,
        `Review it here (you will be asked to sign in):`,
        `${env.siteUrl}/admin/approvals/${approval.id}`,
        ``,
        `This profile is NOT published. It cannot be published until an`,
        `administrator approves it from an authenticated session. Opening this`,
        `email does not approve anything.`,
      ].join("\n"),
      relatedType: "approval_request",
      relatedId: approval.id as string,
    });
  } catch (cause) {
    notificationNote = ` The approval notification could not be queued (${(cause as Error).message}), but the request is in the review queue.`;
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/agents");
  revalidatePath("/admin");

  return {
    status: "ok",
    message:
      `Draft created for ${agent.full_name} with ${evidenceRows.length} sourced field(s) and submitted for approval. It is not published.` +
      notificationNote,
  };
}
