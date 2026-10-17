"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export interface ProspectState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/**
 * Adds a brokerage prospect. Contact details require a recorded basis — where
 * the detail came from and why contacting it is permitted — before any
 * outreach is logged against it.
 */
export async function addProspect(
  _prev: ProspectState,
  formData: FormData,
): Promise<ProspectState> {
  const user = await requireStaff("/admin/crm");
  const supabase = await createSupabaseServerClient();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { status: "error", message: "Enter the brokerage name." };
  }

  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const contactBasis = String(formData.get("contactBasis") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();

  if ((contactEmail || contactName) && contactBasis.length < 5) {
    return {
      status: "error",
      message:
        "Record where this contact detail came from and why contacting it is permitted before saving it.",
    };
  }

  const { data: account, error } = await supabase
    .from("crm_account")
    .insert({
      name,
      stage: "researching",
      owner_user_id: user.id,
      acquisition_source: sourceUrl || null,
      research_summary: String(formData.get("summary") ?? "").trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !account) {
    return { status: "error", message: error?.message ?? "Could not save the prospect." };
  }

  if (contactName || contactEmail) {
    const { error: contactError } = await supabase.from("crm_contact").insert({
      account_id: account.id,
      full_name: contactName || "Unknown",
      title: String(formData.get("contactTitle") ?? "").trim() || null,
      email: contactEmail || null,
      phone: String(formData.get("contactPhone") ?? "").trim() || null,
      is_decision_maker: formData.get("isDecisionMaker") === "on",
      source_url: sourceUrl || null,
      contact_basis: contactBasis,
    });

    if (contactError) {
      return {
        status: "error",
        message: `Prospect saved, but the contact could not be: ${contactError.message}`,
      };
    }
  }

  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "crm.prospect_added",
    entityType: "crm_account",
    entityId: account.id as string,
    after: { name },
  });

  revalidatePath("/admin/crm");
  return { status: "ok", message: `${name} added to the pipeline.` };
}
