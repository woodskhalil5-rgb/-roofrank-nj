import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { adminDb } from "../../../../lib/server";
import { requireEstimator, type EstimatorUser } from "../../../../lib/estimator-auth";
import { ESTIMATE_BUCKET } from "../../../../lib/estimator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 30;

function sniff(buf: Buffer): { type: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/** Admin: any job. Road Pro: only jobs assigned to them. */
async function mayEdit(db: NonNullable<ReturnType<typeof adminDb>>, who: EstimatorUser, estimateId: string) {
  const { data } = await db.from("estimates").select("rep_id").eq("id", estimateId).maybeSingle();
  if (!data) return false;
  return who.role === "admin" || data.rep_id === who.rep.id;
}

/** Adds one site-visit photo to an estimate. The browser shrinks it first. */
export async function POST(req: Request) {
  const who = await requireEstimator(req);
  if (!who) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Upload failed. Try again." }, { status: 400 }); }
  const estimateId = String(form.get("estimate_id") ?? "");
  const file = form.get("file");
  if (!estimateId || !(file instanceof Blob)) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too big." }, { status: 400 });
  if (!(await mayEdit(db, who, estimateId))) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const { count } = await db.from("estimate_photos").select("id", { count: "exact", head: true }).eq("estimate_id", estimateId);
  if ((count ?? 0) >= MAX_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos per job.` }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const t = sniff(buf);
  if (!t) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 400 });

  const path = `${estimateId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${t.ext}`;
  const { error: upErr } = await db.storage.from(ESTIMATE_BUCKET).upload(path, buf, { contentType: t.type, upsert: false });
  if (upErr) {
    console.error(`[estimate-photo] upload failed estimate=${estimateId} error=${upErr.message}`);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
  const { error } = await db.from("estimate_photos").insert({ estimate_id: estimateId, path });
  if (error) {
    await db.storage.from(ESTIMATE_BUCKET).remove([path]);
    return NextResponse.json({ error: "Couldn't save the photo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const who = await requireEstimator(req);
  if (!who) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Database not connected." }, { status: 503 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const { data } = await db.from("estimate_photos").select("path, estimate_id").eq("id", String(id ?? "")).single();
  if (!data || !(await mayEdit(db, who, data.estimate_id))) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  await db.from("estimate_photos").delete().eq("id", String(id));
  await db.storage.from(ESTIMATE_BUCKET).remove([data.path]);
  return NextResponse.json({ ok: true });
}
