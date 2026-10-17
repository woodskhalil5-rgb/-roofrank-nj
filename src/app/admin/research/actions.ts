"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { runZipResearch } from "@/lib/research/pipeline";
import { zipSchema } from "@/lib/validation";

export interface ResearchState {
  status: "idle" | "ok" | "error";
  message?: string;
}

export async function startZipResearch(
  _prev: ResearchState,
  formData: FormData,
): Promise<ResearchState> {
  const user = await requireStaff("/admin/research");

  const parsed = zipSchema.safeParse(formData.get("zip"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  try {
    const result = await runZipResearch(parsed.data, user.id);

    await recordAudit({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "research.run",
      entityType: "research_run",
      entityId: result.runId,
      after: {
        zip: parsed.data,
        status: result.status,
        drafts_created: result.draftsCreated,
      },
    });

    revalidatePath("/admin/research");

    return {
      status: result.draftsCreated > 0 ? "ok" : "error",
      message: result.message,
    };
  } catch (cause) {
    return { status: "error", message: (cause as Error).message };
  }
}
