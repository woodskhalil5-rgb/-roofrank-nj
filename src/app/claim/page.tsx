import type { Metadata } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import ClaimForm from "./ClaimForm";

export const metadata: Metadata = {
  title: "Claim your profile",
  description:
    "Agents can claim their directory profile, correct anything that is wrong, and see which sources were used. Claiming is free.",
  alternates: { canonical: "/claim" },
};

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentSlug } = await searchParams;

  let agentName: string | undefined;
  if (agentSlug) {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("agent")
      .select("full_name")
      .eq("slug", agentSlug)
      .eq("status", "published")
      .maybeSingle();
    agentName = (data?.full_name as string | undefined) ?? undefined;
  }

  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>Claim or correct your profile</h1>
        <p className="muted">
          If we have published a profile about you, you can take ownership of it
          and correct anything we got wrong. This is free and always will be —
          paid marketing services are entirely separate and optional.
        </p>

        {agentSlug && !agentName ? (
          <div className="notice notice-warn">
            We could not find a published profile at &ldquo;{agentSlug}&rdquo;. You can
            still submit the form below and we will look into it.
          </div>
        ) : null}

        <div className="card">
          <ClaimForm agentSlug={agentSlug ?? ""} agentName={agentName} />
        </div>

        <h2 style={{ marginTop: 30 }}>How we verify a claim</h2>
        <ol className="muted">
          <li>You submit this form.</li>
          <li>
            We check the details against the licence record and your brokerage,
            using the sources shown on your profile.
          </li>
          <li>
            A person reviews it. We may contact you or your brokerage to confirm.
          </li>
          <li>
            Once verified, your profile shows as claimed and your corrections are
            applied. The change history is kept.
          </li>
        </ol>
        <p className="hint">
          We will not hand control of a profile to anyone who cannot be verified
          as that agent or their authorised representative.
        </p>
      </div>
    </main>
  );
}
