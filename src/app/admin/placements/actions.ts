"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { placementSchema, fieldErrors } from "@/lib/validation";
import { endsOnOrAfter, placementDay, STATEWIDE_SLOTS } from "@/lib/placements";

export interface PlacementState {
  status: "idle" | "ok" | "error";
  message?: string;
  errors?: Record<string, string>;
}

/**
 * Sells one promotional position.
 *
 * Selling is an administrator's act, not an employee's: the database policy on
 * sponsored_placement is is_admin(), and this check matches it rather than
 * relying on it. Nothing here touches the listing itself — a campaign changes
 * what is advertised, never what the directory says about anyone.
 */
export async function sellPlacement(
  _prev: PlacementState,
  formData: FormData,
): Promise<PlacementState> {
  const user = await requireAdmin("/admin/placements");
  const supabase = await createSupabaseServerClient();

  const parsed = placementSchema.safeParse({
    agentId: formData.get("agentId"),
    brokerageId: formData.get("brokerageId") ?? "",
    label: formData.get("label"),
    scope: formData.get("scope"),
    zip: formData.get("zip") ?? "",
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    monthlyValue: formData.get("monthlyValue"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      errors: fieldErrors(parsed.error),
    };
  }

  const input = parsed.data;
  const zip = input.scope === "statewide" ? null : (input.zip as string);

  // The listing has to be published before it can be advertised, otherwise the
  // campaign runs against a page the public cannot open.
  const { data: agent } = await supabase
    .from("agent")
    .select("id, full_name, status, brokerage_id")
    .eq("id", input.agentId)
    .maybeSingle();

  if (!agent) {
    return { status: "error", message: "That listing could not be found." };
  }
  if (agent.status !== "published") {
    return {
      status: "error",
      message: `${agent.full_name} is not published yet, so a campaign would point at a page nobody can open. Approve the listing first.`,
    };
  }

  // Refuse to oversell: three statewide positions exist and no more.
  if (zip === null) {
    const { count } = await supabase
      .from("sponsored_placement")
      .select("id", { count: "exact", head: true })
      .is("zip", null)
      .lte("starts_on", input.endsOn)
      .gte("ends_on", input.startsOn);

    if ((count ?? 0) >= STATEWIDE_SLOTS) {
      return {
        status: "error",
        message: `All ${STATEWIDE_SLOTS} statewide positions are already committed for part of those dates. End a campaign first, or sell a town placement instead.`,
      };
    }
  }

  const { data: created, error } = await supabase
    .from("sponsored_placement")
    .insert({
      agent_id: input.agentId,
      brokerage_id: input.brokerageId || agent.brokerage_id || null,
      zip,
      label: input.label,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      monthly_value: Number(input.monthlyValue),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    return {
      status: "error",
      message: `Could not record the placement. ${error?.message ?? ""}`,
    };
  }

  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "placement.sold",
    entityType: "sponsored_placement",
    entityId: created.id as string,
    after: {
      agent: agent.full_name,
      label: input.label,
      scope: zip ?? "statewide",
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      monthly_value: input.monthlyValue,
    },
  });

  revalidatePath("/admin/placements");
  revalidatePath("/");

  return {
    status: "ok",
    message: `${input.label} sold to ${agent.full_name}, running ${input.startsOn} to ${input.endsOn}.`,
  };
}

/**
 * Ends a campaign today.
 *
 * The promotional position clears; the listing stays exactly as it was. A
 * campaign ending never changes a single factual detail on anyone's page.
 */
export async function endPlacement(formData: FormData): Promise<void> {
  const user = await requireAdmin("/admin/placements");
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("placementId") ?? "");
  if (!id) return;

  const today = placementDay();

  const { data: before } = await supabase
    .from("sponsored_placement")
    .select("id, label, starts_on, ends_on, agent_id")
    .eq("id", id)
    .maybeSingle();

  if (!before) return;

  // Never move a start date; a campaign that has not begun is cancelled by
  // ending it on its own start date rather than in the past.
  const endOn = today < (before.starts_on as string)
    ? (before.starts_on as string)
    : today;

  const { error } = await supabase
    .from("sponsored_placement")
    .update({ ends_on: endOn })
    .eq("id", id);

  if (error) return;

  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "placement.ended",
    entityType: "sponsored_placement",
    entityId: id,
    before: { ends_on: before.ends_on },
    after: { ends_on: endOn, listing_unchanged: true },
  });

  revalidatePath("/admin/placements");
  revalidatePath("/");
}

/** Statewide positions committed across a given day, for the slot counter. */
export async function statewideSoldOn(day = placementDay()): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("sponsored_placement")
    .select("id", { count: "exact", head: true })
    .is("zip", null)
    .lte("starts_on", day)
    .or(endsOnOrAfter(day));
  return count ?? 0;
}
