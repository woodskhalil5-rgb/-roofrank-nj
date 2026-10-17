import { redirect } from "next/navigation";

/**
 * Notification emails link here. The link is only a pointer — authorization
 * comes from the signed-in session enforced by the admin layout, never from
 * the link itself.
 */
export default async function ClaimRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  redirect("/admin/claims");
}
