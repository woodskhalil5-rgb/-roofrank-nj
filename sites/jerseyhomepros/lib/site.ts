/**
 * Brand-level configuration. Trade-specific content lives in lib/trades.ts.
 */
export const SITE = {
  brand: "Jersey Home Pros",
  mark: "J",
  wordmark: "JERSEY HOME",
  wordmarkBold: "PROS",
  subMark: "NEW JERSEY CONTRACTOR NETWORK",
  domain: "jerseyhomepros.com",
  url: "https://jerseyhomepros.com",

  meta: {
    title: "Jersey Home Pros | Find Trusted Home Contractors in New Jersey",
    description:
      "Tell us what your home needs and we connect your request with participating New Jersey contractors who serve your area. Roofing, heating and cooling, and pest control.",
    ogDescription: "A smarter way to find home contractors in New Jersey.",
  },

  hero: {
    eyebrow: "NEW JERSEY HOME SERVICES, MADE SIMPLE",
    line1: "Your home.",
    lineEm: "Your choice.",
    line2: "Start with confidence.",
    sub: "One request connects you with participating New Jersey contractors who serve your area — roofing, heating and cooling, and pest control.",
  },

  proof: [
    "Tell us what your home needs",
    "We route your request to relevant pros",
    "Compare your options and choose",
  ],

  how: {
    h2a: "Home help,",
    h2em: "without the runaround.",
    p: "Whether the roof is leaking, the furnace quit overnight, or something is living in the attic, start with one simple request.",
  },

  providerBar: {
    h2: "Grow your local pipeline.",
    p: "Interested in receiving homeowner requests in your service area?",
  },

  join: {
    h1: "Join the Jersey Home Pros network.",
    p: "Tell us about your company, the trade you work in, and the New Jersey areas you serve.",
  },

  propertyTypes: [
    "Single-family home",
    "Townhouse",
    "Multi-family",
    "Commercial",
    "Other",
  ],
  timings: [
    "As soon as possible",
    "Within 2 weeks",
    "Within 1–3 months",
    "Just researching",
  ],

  disclaimer:
    "Jersey Home Pros helps homeowners connect with participating contractors. Contractor availability, licensing and qualifications should be confirmed directly before hiring.",

  operator: "Destiny Marketing Group LLC",
  operatorAddress: "511 N Boardwalk, Rehoboth Beach, DE 19971",
  operatorEmail: "contact@destinymarketinggroup.com",
} as const;
