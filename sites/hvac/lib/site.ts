/**
 * The ONLY file that differs between trades. Everything else reads from here,
 * so a new vertical is a copy of this file plus a new domain and database.
 */
export const SITE = {
  brand: "HVACRank NJ",
  mark: "H",
  wordmark: "HVACRANK",
  subMark: "NEW JERSEY HVAC NETWORK",
  domain: "hvacranknj.com",
  url: "https://hvacranknj.com",
  company: "HVAC company",
  companies: "HVAC companies",
  trade: "HVAC",
  meta: {
    title: "HVACRank NJ | Find Trusted Heating & Cooling Pros in New Jersey",
    description: "Compare heating and cooling services and request an estimate from participating New Jersey HVAC companies.",
    ogDescription: "A smarter way to find heating and cooling help in New Jersey.",
  },
  hero: {
    eyebrow: "NEW JERSEY HEATING & COOLING, MADE SIMPLE",
    line1: "Your comfort.",
    lineEm: "Your choice.",
    line2: "Start with confidence.",
    sub: "Find help with heating, cooling, repairs, installs and emergency no-heat calls\u2014right here in New Jersey.",
  },
  proof: ["Tell us what your system needs", "We route your request to relevant pros", "Compare your options and choose"],
  how: { h2a: "Heating and cooling help,", h2em: "without the runaround.", p: "Whether the furnace quit overnight or the AC never quite keeps up, start with one simple request." },
  estimate: { h2a: "Let\u2019s get your home", h2em: "comfortable again.", p: "Share a few details. We\u2019ll use them to help connect your request with participating HVAC companies that serve your area." },
  cards: [
    { icon: "\u2668", title: "No Heat / No Cool", body: "Emergency calls when the system stops working entirely." },
    { icon: "\u2744", title: "AC Repair & Install", body: "Cooling that struggles, leaks, or needs replacing." },
    { icon: "\u25ce", title: "Furnace & Boiler", body: "Heating repair, servicing, and full replacement." },
    { icon: "\u25c8", title: "Maintenance", body: "Seasonal tune-ups before the weather turns." }
  ],
  services: ["No heat — urgent", "No cooling — urgent", "Furnace repair", "Furnace replacement", "AC repair", "AC replacement", "Boiler service", "Heat pump", "Ductwork", "Seasonal maintenance", "Not sure yet"],
  providerServices: ["Heating only", "Cooling only", "Heating and cooling", "Commercial HVAC", "Multiple HVAC services"],
  propertyTypes: ["Single-family home", "Townhouse", "Multi-family", "Commercial", "Other"],
  timings: ["As soon as possible", "Within 2 weeks", "Within 1\u20133 months", "Just researching"],
  providerBar: { h2: "Grow your local pipeline.", p: "Interested in receiving homeowner requests in your service area?" },
  join: { h1: "Join the HVACRank NJ network.", p: "Tell us about your HVAC company and the New Jersey areas you serve." },
  disclaimer: "HVACRank NJ helps homeowners connect with participating HVAC companies. Contractor availability and qualifications should be confirmed directly before hiring.",
  operator: "Destiny Marketing Group LLC",
  operatorAddress: "511 N Boardwalk, Rehoboth Beach, DE 19971",
  operatorEmail: "contact@destinymarketinggroup.com",
} as const;
