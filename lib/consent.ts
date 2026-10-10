/**
 * Single source of truth for consent wording.
 *
 * The same constants render on the form and are written to the lead record, so
 * what a consumer saw can always be reproduced. Bump CONSENT_VERSION whenever
 * the wording changes — older leads keep the text they actually agreed to.
 *
 * TCPA note: phone/text consent is deliberately separate and optional.
 * Making it a condition of the service would breach the "not a condition of
 * purchase" requirement for prior express written consent.
 */
export const CONSENT_VERSION = "2026-10-10.v1";

export const SHARING_CONSENT_TEXT =
  "I agree that RoofRank NJ may share the details I submit — my name, phone number, " +
  "email address, ZIP code and project information — with participating roofing companies " +
  "that serve my area, so they can respond to my request. I understand those companies pay " +
  "RoofRank NJ for these requests, that RoofRank NJ is not a roofing contractor, and that I " +
  "am under no obligation to hire anyone.";

/** Rendered beside links on the form; appended to the stored record. */
export const TERMS_ACK = "I have read the Privacy Notice and agree to the Terms of Use.";

export const PHONE_CONSENT_TEXT =
  "I also agree that the participating roofing companies RoofRank NJ shares my request with, " +
  "and RoofRank NJ, may contact me at the phone number I provided about my roofing project by " +
  "telephone call and text message, including calls or texts that use automated technology, an " +
  "autodialer, or an artificial or prerecorded voice, even if my number is on a federal, state " +
  "or company Do Not Call list. Consent is not a condition of using RoofRank NJ or of purchasing " +
  "any goods or services. Message frequency varies and message and data rates may apply. " +
  "Reply STOP to any text to opt out, or tell any caller to stop calling.";
