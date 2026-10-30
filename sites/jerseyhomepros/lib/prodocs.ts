import crypto from "node:crypto";
import { adminDb } from "./server";

/** Private bucket for contractor insurance certificates / registration docs. */
export const DOCS_BUCKET = "pro-docs";
export const DOC_MAX_BYTES = 6 * 1024 * 1024;

type DB = NonNullable<ReturnType<typeof adminDb>>;

/** Identify the file by its first bytes, not by what the browser claims. */
export function sniffDoc(buf: Buffer): { type: string; ext: string } | null {
  if (buf.length > 4 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/** Stores an insurance document for a contractor and records it. Replaces any earlier one. */
export async function storeInsurance(db: DB, rooferId: string, file: Blob): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.size > DOC_MAX_BYTES) return { ok: false, error: "That file is over 6 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  const t = sniffDoc(buf);
  if (!t) return { ok: false, error: "Upload a PDF or a photo (JPG, PNG)." };
  const { data: cur } = await db.from("roofers").select("insurance_path").eq("id", rooferId).single();
  const path = `${rooferId}/insurance-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${t.ext}`;
  const { error: up } = await db.storage.from(DOCS_BUCKET).upload(path, buf, { contentType: t.type, upsert: false });
  if (up) return { ok: false, error: "Upload failed. Try again." };
  const { error } = await db.from("roofers").update({ insurance_path: path, insurance_uploaded_at: new Date().toISOString() }).eq("id", rooferId);
  if (error) { await db.storage.from(DOCS_BUCKET).remove([path]); return { ok: false, error: "Couldn't save it. Try again." }; }
  if (cur?.insurance_path) await db.storage.from(DOCS_BUCKET).remove([cur.insurance_path]);
  return { ok: true };
}
