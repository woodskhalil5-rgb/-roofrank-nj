/**
 * Single source of truth for consent wording. Rendered on the form AND stored
 * on the lead, so what a consumer saw can always be reproduced.
 * Phone consent is deliberately separate and optional: TCPA forbids making it
 * a condition of the service.
 */
import { SITE } from "./site";

export const CONSENT_VERSION = "2026-10-10.v1";

export const SHARING_CONSENT_TEXT =
  `I agree that ${SITE.brand} may share the details I submit \u2014 my name, phone number, ` +
  `email address, ZIP code and project information \u2014 with participating ${SITE.companies} ` +
  `that serve my area, so they can respond to my request. I understand those companies pay ` +
  `${SITE.brand} for these requests, that ${SITE.brand} is not a ${SITE.company}, and that I ` +
  `am under no obligation to hire anyone.`;

export const TERMS_ACK = "I have read the Privacy Notice and agree to the Terms of Use.";

export const PHONE_CONSENT_TEXT =
  `I also agree that the participating ${SITE.companies} ${SITE.brand} shares my request with, ` +
  `and ${SITE.brand}, may contact me at the phone number I provided by telephone call and text ` +
  `message, including calls or texts that use automated technology, an autodialer, or an artificial ` +
  `or prerecorded voice, even if my number is on a federal, state or company Do Not Call list. ` +
  `Consent is not a condition of using ${SITE.brand} or of purchasing any goods or services. ` +
  `Message frequency varies and message and data rates may apply. Reply STOP to any text to opt out, ` +
  `or tell any caller to stop calling.`;
