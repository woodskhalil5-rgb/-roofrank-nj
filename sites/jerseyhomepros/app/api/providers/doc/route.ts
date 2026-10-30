import { NextResponse } from "next/server";
import { adminDb, alertEmails, sendEmail } from "../../../../lib/server";
import { SITE } from "../../../../lib/site";
import { hashToken } from "../../../../lib/pros";
import { storeInsurance } from "../../../../lib/prodocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lets a brand-new applicant attach their insurance certificate right after
 * applying, using the one-time token the application returned (2 hours).
 */
export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Upload failed. Try again." }, { status: 400 }); }
  const token = String(form.get("token") ?? ""), file = form.get("file");
  if (!token || !(file instanceof Blob)) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const { data: row } = await db.from("roofers").select("id, company, doc_token_expires").eq("doc_token_hash", hashToken(token)).maybeSingle();
  if (!row || !row.doc_token_expires || new Date(row.doc_token_expires).getTime() < Date.now()) {
    return NextResponse.json({ error: "This upload link expired. You can add it later from your dashboard." }, { status: 400 });
  }
  const r = await storeInsurance(db, row.id, file);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  await db.from("roofers").update({ doc_token_hash: null, doc_token_expires: null }).eq("id", row.id);
  await sendEmail(alertEmails(), `Insurance uploaded: ${row.company}`, `${row.company} uploaded an insurance document.\n\nCheck it and mark them verified: ${SITE.url}/admin`);
  return NextResponse.json({ ok: true });
}
