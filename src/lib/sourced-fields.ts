/**
 * Fields a draft profile can carry a recorded source for.
 * Shared by the draft form, the evidence writer and the ranking calculation.
 */
export const SOURCED_FIELDS = [
  { key: "brokerage", label: "Brokerage affiliation" },
  { key: "license_status", label: "Licence status" },
  { key: "public_phone", label: "Public phone" },
  { key: "service_zips", label: "Service area" },
  { key: "specialties", label: "Specialties" },
] as const;

export type SourcedFieldKey = (typeof SOURCED_FIELDS)[number]["key"];

export const VERIFICATION_OPTIONS = [
  { value: "verified", label: "Verified against an authorised source" },
  { value: "self_reported", label: "Self-reported by the agent" },
  { value: "third_party", label: "Third-party claim" },
  { value: "ai_generated", label: "AI-generated assessment" },
  { value: "unverified", label: "Unverified" },
] as const;
