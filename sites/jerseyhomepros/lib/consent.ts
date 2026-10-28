/**
 * Single source of truth for consent wording. The exact text rendered on the
 * form is also stored on the lead, so what a consumer saw can always be
 * reproduced years later.
 *
 * Phone consent is deliberately separate and optional: TCPA forbids making it
 * a condition of the service.
 *
 * Bump CONSENT_VERSION whenever any wording below changes. Old leads keep the
 * version and text they were shown.
 */
import { SITE } from "./site";
import type { Trade } from "./trades";

export const CONSENT_VERSION = "2026-10-10.v2";

export function sharingConsentText(trade: Trade): string {
  return (
    `I agree that ${SITE.brand} may share the details I submit — my name, phone number, ` +
    `email address, ZIP code and project information — with participating ${trade.companies} ` +
    `that serve my area, so they can respond to my request. I understand those companies pay ` +
    `${SITE.brand} for these requests, that ${SITE.brand} is not a ${trade.company}, and that I ` +
    `am under no obligation to hire anyone.`
  );
}

export const TERMS_ACK =
  "I have read the Privacy Notice and agree to the Terms of Use.";

export function phoneConsentText(trade: Trade): string {
  return (
    `I also agree that the participating ${trade.companies} ${SITE.brand} shares my request with, ` +
    `and ${SITE.brand}, may contact me at the phone number I provided by telephone call and text ` +
    `message, including calls or texts that use automated technology, an autodialer, or an ` +
    `artificial or prerecorded voice, even if my number is on a federal, state or company Do Not ` +
    `Call list. Consent is not a condition of using ${SITE.brand} or of purchasing any goods or ` +
    `services. Message frequency varies and message and data rates may apply. Reply STOP to any ` +
    `text to opt out, or tell any caller to stop calling.`
  );
}

/** Free site-visit booking (Road Pro). Stored verbatim on the estimate. */
export const VISIT_CONSENT_VERSION = "2026-10-27.v1";

export function visitConsentText(trade: Trade): string {
  return (
    `I'm asking ${SITE.brand} for a free site visit. I agree that ${SITE.brand} and its Road Pro may ` +
    `call or text me at the number I gave to schedule and carry out this visit, and that ${SITE.brand} ` +
    `may share my name, contact details, address, photos and the job details with one participating ` +
    `${trade.company} for this job. I understand that contractor pays ${SITE.brand} if I hire them, ` +
    `that the visit and estimate are free, and that I am under no obligation to hire anyone.`
  );
}

export function visitContractorCallsText(trade: Trade): string {
  return `The ${trade.company} may also call or text me about this job. (Leave unticked for email only.)`;
}

/** Road Pro job application. Shown on /road-pros and stored on the application. */
export const RP_CONSENT =
  "I agree that Jersey Home Pros may contact me about this role by phone, text and email. I understand a background check is required before any visit, and that it is done separately, only with my written permission.";
