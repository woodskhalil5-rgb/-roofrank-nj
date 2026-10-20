import { z } from "zod";

export const zipSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{5}$/, "Enter a five-digit ZIP code");

export const SERVICE_CATEGORIES = [
  "moving",
  "cleaning",
  "roofing",
  "hvac",
  "pest_control",
  "painting",
  "plumbing",
  "other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  moving: "Moving",
  cleaning: "Cleaning",
  roofing: "Roofing",
  hvac: "HVAC",
  pest_control: "Pest control",
  painting: "Painting",
  plumbing: "Plumbing",
  other: "Something else",
};

/**
 * The exact wording a visitor must agree to before anything is shared with
 * Jersey Home Pros. Stored verbatim with every consent record so we can show
 * what a given person actually saw.
 */
export const JHP_CONSENT_VERSION = "jhp-referral-v1";

export const JHP_CONSENT_TEXT =
  "I am asking Destiny Marketing Group to pass my request to Jersey Home Pros, " +
  "a separate company, so that they can contact me about this home service. I " +
  "understand that my name, contact details, service address and the service I " +
  "asked for will be sent to Jersey Home Pros for that purpose, that Jersey Home " +
  "Pros will handle contacting me and arranging any contractor, and that I can " +
  "withdraw this request by contacting Destiny Marketing Group.";

export const serviceRequestSchema = z.object({
  requesterName: z.string().trim().min(2, "Enter your name").max(120),
  requesterEmail: z.string().trim().email("Enter a valid email address").max(200),
  requesterPhone: z
    .string()
    .trim()
    .min(7, "Enter a contact phone number")
    .max(32),
  streetAddress: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  zip: zipSchema,
  serviceCategory: z.enum(SERVICE_CATEGORIES),
  details: z.string().trim().max(2000).optional().or(z.literal("")),
  preferredTiming: z.string().trim().max(120).optional().or(z.literal("")),
  // Must be literally true. A missing or false value is a hard rejection.
  consent: z.literal(true, {
    errorMap: () => ({
      message:
        "We cannot pass your request to Jersey Home Pros without your explicit consent.",
    }),
  }),
  sourcePage: z.string().trim().max(300).optional().or(z.literal("")),
});

export type ServiceRequestInput = z.infer<typeof serviceRequestSchema>;

export const claimSchema = z.object({
  agentSlug: z.string().trim().min(1).max(200),
  claimantName: z.string().trim().min(2, "Enter your full name").max(120),
  claimantEmail: z.string().trim().email("Enter a valid email address").max(200),
  claimantPhone: z.string().trim().max(32).optional().or(z.literal("")),
  licenseNumber: z.string().trim().max(60).optional().or(z.literal("")),
  brokerage: z.string().trim().max(160).optional().or(z.literal("")),
  evidenceUrl: z
    .string()
    .trim()
    .url("Enter a full web address, including https://")
    .max(500)
    .optional()
    .or(z.literal("")),
  requestedChanges: z.string().trim().max(2000).optional().or(z.literal("")),
  attestation: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm that you are this agent or are authorised to act for them.",
    }),
  }),
});

export type ClaimInput = z.infer<typeof claimSchema>;

/** Collapses zod issues into a field -> message map for form redisplay. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Selling one of the promotional positions.
 *
 * An end date is required, not optional. The database's own public policy on
 * sponsored_placement reads `CURRENT_DATE <= ends_on`, which is NULL-blind: an
 * open-ended campaign would be stored happily and then shown to nobody. Until
 * that policy is changed, every campaign gets an explicit end date so the
 * application and the database agree about what is running.
 */
export const placementSchema = z
  .object({
    agentId: z.string().uuid("Choose the agent this placement is for"),
    brokerageId: z.string().uuid().optional().or(z.literal("")),
    label: z.string().trim().min(2, "Name the position sold").max(80),
    scope: z.enum(["statewide", "zip"]),
    zip: z.string().trim().optional().or(z.literal("")),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date"),
    monthlyValue: z
      .string()
      .trim()
      .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter the monthly amount, e.g. 650"),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    message: "The end date cannot be before the start date",
    path: ["endsOn"],
  })
  .refine((v) => v.scope === "statewide" || /^[0-9]{5}$/.test(v.zip ?? ""), {
    message: "Enter the five-digit ZIP this placement runs in",
    path: ["zip"],
  });

export type PlacementInput = z.infer<typeof placementSchema>;
