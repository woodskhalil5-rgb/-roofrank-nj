"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { zipSchema } from "@/lib/validation";

export interface CoverageState {
  status: "idle" | "ok" | "error";
  message?: string;
}

/**
 * Adds or updates a ZIP area. A ZIP only gets a public page when it is marked
 * as a target, which is how thin pages are kept off the site.
 */
export async function saveZipArea(
  _prev: CoverageState,
  formData: FormData,
): Promise<CoverageState> {
  const user = await requireAdmin("/admin/coverage");
  const supabase = await createSupabaseServerClient();

  const zipResult = zipSchema.safeParse(formData.get("zip"));
  if (!zipResult.success) {
    return { status: "error", message: zipResult.error.issues[0].message };
  }

  const city = String(formData.get("primaryCity") ?? "").trim();
  const county = String(formData.get("county") ?? "").trim();
  const isTarget = formData.get("isTarget") === "on";

  if (city.length < 2) {
    return { status: "error", message: "Enter the primary town or city for this ZIP code." };
  }

  const { error } = await supabase.from("zip_area").upsert(
    {
      zip: zipResult.data,
      primary_city: city,
      county: county || null,
      state: "NJ",
      is_target: isTarget,
    },
    { onConflict: "zip" },
  );

  if (error) return { status: "error", message: error.message };

  await recordAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: isTarget ? "coverage.zip_targeted" : "coverage.zip_saved",
    entityType: "zip_area",
    entityId: zipResult.data,
    after: { city, county, is_target: isTarget },
  });

  revalidatePath("/admin/coverage");
  revalidatePath("/");
  revalidatePath("/directory");
  revalidatePath(`/directory/${zipResult.data}`);

  return {
    status: "ok",
    message: isTarget
      ? `${zipResult.data} saved and will have a public page once profiles are published.`
      : `${zipResult.data} saved. It has no public page until you mark it as a target area.`,
  };
}
