import { NextResponse } from "next/server";
import { adminDb, alertEmails, sendEmail } from "../../../../lib/server";
import { SITE } from "../../../../lib/site";
import { requireContractor } from "../../../../lib/pros";
import { storeInsurance } from "../../../../lib/prodocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A signed-in contractor submits their HIC number and/or insurance
 * certificate for the Verified badge. Nothing is marked verified here:
 * Khalil checks it in /admin.
 */
export async function POST(req: Request) {
  const me = await requireContractor(req);
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Upload failed. Try again." }, { status: 400 }); }

  const hic = String(form.get("hic_number") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  const file = form.get("file");
  const hasFile = file instanceof Blob && file.size > 0;
  if (!hic && !hasFile) return NextResponse.json({ error: "Add your HIC number or a certificate of insurance." }, { status: 400 });

  if (hic && hic !== me.license_number) {
    // A new number hasn't been checked yet.
    const { error } = await db.from("roofers").update({ license_number: hic, license_label: "NJ Home Improvement Contractor", license_checked_at: null, license_status: "" }).eq("id", me.id);
    if (error) return NextResponse.json({ error: "Couldn't save that number." }, { status: 500 });
  }
  if (hasFile) {
    const r = await storeInsurance(db, me.id, file as Blob);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  await sendEmail(alertEmails(), `Verification submitted: ${me.company}`,
    [`${me.company} submitted ${[hic && `HIC #${hic}`, hasFile && "an insurance certificate"].filter(Boolean).join(" and ")} for the Verified badge.`, "", `Check it in Admin → Pros: ${SITE.url}/admin`].join("\n"));
  return NextResponse.json({ ok: true });
}
