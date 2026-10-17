"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { drainOutbox } from "@/lib/notify";

export interface DrainState {
  status: "idle" | "ok" | "error";
  message?: string;
}

export async function drainNotifications(
  _prev: DrainState,
  _formData: FormData,
): Promise<DrainState> {
  await requireAdmin("/admin/notifications");

  try {
    const summary = await drainOutbox();
    revalidatePath("/admin/notifications");

    if (summary.considered === 0) {
      return { status: "ok", message: "Nothing was due for delivery." };
    }
    if (summary.heldUnconfigured > 0 && summary.sent === 0) {
      return {
        status: "error",
        message: `${summary.heldUnconfigured} message(s) are still waiting because no email provider is configured. They have not been lost.`,
      };
    }
    return {
      status: "ok",
      message: `${summary.sent} sent, ${summary.failed} failed, ${summary.heldUnconfigured} held.`,
    };
  } catch (cause) {
    return { status: "error", message: (cause as Error).message };
  }
}
