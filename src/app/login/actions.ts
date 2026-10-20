"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "error";
  message?: string;
}

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    return { status: "error", message: "Enter your email address and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately generic: do not reveal whether an account exists.
    return { status: "error", message: "Those details were not accepted." };
  }

  // Staff go to the dashboard, advertisers to their own results. Sending a
  // client to /admin would only bounce them to the no-access page.
  let destination = next.startsWith("/") ? next : "/admin";
  if (destination === "/admin") {
    const { data: profile } = await supabase
      .from("app_user")
      .select("role")
      .eq("email", email)
      .maybeSingle();
    const role = profile?.role as string | undefined;
    if (role && !["owner", "admin", "employee"].includes(role)) {
      destination = "/portal";
    }
  }

  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
