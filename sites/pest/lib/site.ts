/**
 * The ONLY file that differs between trades. Everything else reads from here,
 * so a new vertical is a copy of this file plus a new domain and database.
 */
export const SITE = {
  brand: "PestRank NJ",
  mark: "P",
  wordmark: "PESTRANK",
  subMark: "NEW JERSEY PEST CONTROL NETWORK",
  domain: "pestranknj.com",
  url: "https://pestranknj.com",
  company: "pest control company",
  companies: "pest control companies",
  trade: "pest control",
  meta: {
    title: "PestRank NJ | Find Trusted Pest Control in New Jersey",
    description: "Compare pest control services and request an estimate from participating New Jersey pest control companies.",
    ogDescription: "A smarter way to find pest control help in New Jersey.",
  },
  hero: {
    eyebrow: "NEW JERSEY PEST CONTROL, MADE SIMPLE",
    line1: "Your home.",
    lineEm: "Your choice.",
    line2: "Pest-free, fast.",
    sub: "Find help with rodents, insects, termites, wildlife and recurring prevention\u2014right here in New Jersey.",
  },
  proof: ["Tell us what you\u2019re dealing with", "We route your request to relevant pros", "Compare your options and choose"],
  how: { h2a: "Pest control,", h2em: "without the runaround.", p: "Whether you saw one mouse or you have a recurring problem, start with one simple request." },
  estimate: { h2a: "Let\u2019s get your home", h2em: "back to normal.", p: "Share a few details. We\u2019ll use them to help connect your request with participating pest control companies that serve your area." },
  cards: [
    { icon: "\u25c9", title: "Rodents", body: "Mice, rats and anything else getting indoors." },
    { icon: "\u2736", title: "Insects", body: "Roaches, ants, bed bugs, wasps and spiders." },
    { icon: "\u25a3", title: "Termites", body: "Inspection, treatment and prevention." },
    { icon: "\u25cc", title: "Ongoing Plans", body: "Recurring service to keep problems from returning." }
  ],
  services: ["Rodents — mice or rats", "Roaches", "Ants", "Bed bugs", "Termites", "Wasps or hornets", "Spiders", "Wildlife removal", "Recurring prevention plan", "Inspection only", "Not sure yet"],
  providerServices: ["General pest control", "Termite specialist", "Wildlife removal", "Bed bug specialist", "Multiple pest services"],
  propertyTypes: ["Single-family home", "Townhouse", "Multi-family", "Commercial", "Other"],
  timings: ["As soon as possible", "Within 2 weeks", "Within 1\u20133 months", "Just researching"],
  providerBar: { h2: "Grow your local pipeline.", p: "Interested in receiving homeowner requests in your service area?" },
  join: { h1: "Join the PestRank NJ network.", p: "Tell us about your pest control company and the New Jersey areas you serve." },
  disclaimer: "PestRank NJ helps homeowners connect with participating pest control companies. Contractor availability and qualifications should be confirmed directly before hiring.",
  operator: "Destiny Marketing Group LLC",
  operatorAddress: "511 N Boardwalk, Rehoboth Beach, DE 19971",
  operatorEmail: "contact@destinymarketinggroup.com",
} as const;
