/**
 * Every trade the network covers. Adding a trade is an entry here plus the
 * same slug in the database's leads_trade_check / roofers_trade_check
 * constraints. Nothing else needs to change.
 *
 * `slug` is the URL segment AND the value stored on leads and providers, so it
 * must never be changed once leads exist under it.
 */
export type TradeSlug = "roofing" | "hvac" | "pest" | "moving" | "cleaning" | "landscaping" | "hardscaping";

export type Trade = {
  slug: TradeSlug;
  /** Short label for menus and chips: "Roofing" */
  label: string;
  /** Singular noun for a provider: "roofing company" */
  company: string;
  /** Plural noun for providers: "roofing companies" */
  companies: string;
  /** How the work is described in a sentence: "roofing help" */
  work: string;
  icon: string;
  blurb: string;
  hero: { eyebrow: string; line1: string; lineEm: string; line2: string; sub: string };
  how: { h2a: string; h2em: string; p: string };
  estimate: { h2a: string; h2em: string; p: string };
  cards: ReadonlyArray<{ icon: string; title: string; body: string }>;
  services: ReadonlyArray<string>;
  providerServices: ReadonlyArray<string>;
  meta: { title: string; description: string };
  /**
   * Optional prompt for the free-text details box. Some trades need a detail
   * the fixed fields don't capture — a move has a destination, a clean has a
   * house size — and asking for it here is cheaper than adding a column that
   * only one trade would ever use. Falls back to a generic prompt.
   */
  detailsHint?: string;
};

export const TRADES: Record<TradeSlug, Trade> = {
  roofing: {
    slug: "roofing",
    label: "Roofing",
    company: "roofing company",
    companies: "roofing companies",
    work: "roofing help",
    icon: "⌂",
    blurb: "Leaks, storm damage, repairs and full replacements.",
    hero: {
      eyebrow: "NEW JERSEY ROOFING, MADE SIMPLE",
      line1: "Your roof.",
      lineEm: "Your choice.",
      line2: "Start with confidence.",
      sub: "Find roofing help for repairs, replacement, inspections, and storm damage—right here in New Jersey.",
    },
    how: {
      h2a: "Roofing help, without",
      h2em: "the runaround.",
      p: "Whether it’s a small leak or a full replacement, start with one simple request.",
    },
    estimate: {
      h2a: "Let’s get your roof",
      h2em: "back on track.",
      p: "Share a few details. We’ll use them to help connect your request with participating roofing companies that serve your area.",
    },
    cards: [
      { icon: "⌂", title: "Roof Repair", body: "Leaks, missing shingles, flashing, and other roof issues." },
      { icon: "↗", title: "Roof Replacement", body: "Explore options for a new roof and project estimates." },
      { icon: "◈", title: "Storm Damage", body: "Request help assessing damage after severe weather." },
      { icon: "◎", title: "Roof Inspection", body: "Get a closer look before buying, selling, or repairing." },
    ],
    services: [
      "Roof repair",
      "Roof replacement",
      "Roof inspection",
      "Storm damage",
      "Gutter services",
      "Not sure yet",
    ],
    providerServices: [
      "Residential roofing",
      "Commercial roofing",
      "Repairs only",
      "Gutters",
      "Multiple roofing services",
    ],
    meta: {
      title: "Roofing Contractors in New Jersey | Jersey Home Pros",
      description:
        "Compare roofing services and request an estimate from participating New Jersey roofing companies.",
    },
  },

  hvac: {
    slug: "hvac",
    label: "Heating & Cooling",
    company: "HVAC company",
    companies: "HVAC companies",
    work: "heating and cooling help",
    icon: "♨",
    blurb: "No heat, no cooling, repairs, installs and tune-ups.",
    hero: {
      eyebrow: "NEW JERSEY HEATING & COOLING, MADE SIMPLE",
      line1: "Your comfort.",
      lineEm: "Your choice.",
      line2: "Start with confidence.",
      sub: "Find help with heating, cooling, repairs, installs and emergency no-heat calls—right here in New Jersey.",
    },
    how: {
      h2a: "Heating and cooling help,",
      h2em: "without the runaround.",
      p: "Whether the furnace quit overnight or the AC never quite keeps up, start with one simple request.",
    },
    estimate: {
      h2a: "Let’s get your home",
      h2em: "comfortable again.",
      p: "Share a few details. We’ll use them to help connect your request with participating HVAC companies that serve your area.",
    },
    cards: [
      { icon: "♨", title: "No Heat / No Cool", body: "Emergency calls when the system stops working entirely." },
      { icon: "❄", title: "AC Repair & Install", body: "Cooling that struggles, leaks, or needs replacing." },
      { icon: "◎", title: "Furnace & Boiler", body: "Heating repair, servicing, and full replacement." },
      { icon: "◈", title: "Maintenance", body: "Seasonal tune-ups before the weather turns." },
    ],
    services: [
      "No heat — urgent",
      "No cooling — urgent",
      "Furnace repair",
      "Furnace replacement",
      "AC repair",
      "AC replacement",
      "Boiler service",
      "Heat pump",
      "Ductwork",
      "Seasonal maintenance",
      "Not sure yet",
    ],
    providerServices: [
      "Heating only",
      "Cooling only",
      "Heating and cooling",
      "Commercial HVAC",
      "Multiple HVAC services",
    ],
    meta: {
      title: "HVAC Contractors in New Jersey | Jersey Home Pros",
      description:
        "Compare heating and cooling services and request an estimate from participating New Jersey HVAC companies.",
    },
  },

  pest: {
    slug: "pest",
    label: "Pest Control",
    company: "pest control company",
    companies: "pest control companies",
    work: "pest control help",
    icon: "◉",
    blurb: "Rodents, insects, termites and prevention plans.",
    hero: {
      eyebrow: "NEW JERSEY PEST CONTROL, MADE SIMPLE",
      line1: "Your home.",
      lineEm: "Your choice.",
      line2: "Pest-free, fast.",
      sub: "Find help with rodents, roaches, ants, bed bugs, termites and recurring prevention—right here in New Jersey.",
    },
    how: {
      h2a: "Pest control help,",
      h2em: "without the runaround.",
      p: "Whether you heard something in the attic or found something in the kitchen, start with one simple request.",
    },
    estimate: {
      h2a: "Let’s get your home",
      h2em: "back to normal.",
      p: "Share a few details. We’ll use them to help connect your request with participating pest control companies that serve your area.",
    },
    cards: [
      { icon: "◉", title: "Rodents", body: "Mice and rats in the attic, basement, or walls." },
      { icon: "✻", title: "Insects", body: "Roaches, ants, spiders, wasps and bed bugs." },
      { icon: "▤", title: "Termites", body: "Inspections, treatment, and structural damage." },
      { icon: "◈", title: "Ongoing Plans", body: "Recurring prevention so it does not come back." },
    ],
    services: [
      "Rodents — mice or rats",
      "Roaches",
      "Ants",
      "Bed bugs",
      "Termites",
      "Wasps or hornets",
      "Spiders",
      "Wildlife removal",
      "Recurring prevention plan",
      "Inspection only",
      "Not sure yet",
    ],
    providerServices: [
      "General pest control",
      "Termites",
      "Wildlife removal",
      "Bed bugs",
      "Multiple pest services",
    ],
    meta: {
      title: "Pest Control in New Jersey | Jersey Home Pros",
      description:
        "Compare pest control services and request an estimate from participating New Jersey pest control companies.",
    },
  },

  moving: {
    slug: "moving",
    label: "Moving",
    company: "moving company",
    companies: "moving companies",
    work: "moving help",
    icon: "⇄",
    blurb: "Local moves, packing, heavy items and storage.",
    hero: {
      eyebrow: "NEW JERSEY MOVING, MADE SIMPLE",
      line1: "Your move.",
      lineEm: "Your choice.",
      line2: "Start with confidence.",
      sub: "Find help with local moves, packing, heavy or awkward items, and storage—right here in New Jersey.",
    },
    how: {
      h2a: "Moving help,",
      h2em: "without the runaround.",
      p: "Whether it’s a studio across town or a whole house across the state, start with one simple request.",
    },
    estimate: {
      h2a: "Let’s get you",
      h2em: "moved.",
      p: "Share a few details. We’ll use them to help connect your request with participating moving companies that serve your area.",
    },
    cards: [
      { icon: "⇄", title: "Local Moves", body: "Apartments, condos and houses within New Jersey." },
      { icon: "▣", title: "Packing", body: "Full or partial packing, boxes and materials." },
      { icon: "◈", title: "Heavy Items", body: "Pianos, safes, appliances and awkward pieces." },
      { icon: "◎", title: "Storage", body: "Short-term storage between move-out and move-in." },
    ],
    services: [
      "Local move — 1 bedroom or studio",
      "Local move — 2 bedrooms",
      "Local move — 3+ bedrooms",
      "Apartment or condo move",
      "Office or commercial move",
      "Packing services",
      "Single heavy item",
      "Loading or unloading only",
      "Storage needed",
      "Not sure yet",
    ],
    providerServices: [
      "Local residential moving",
      "Long-distance moving",
      "Packing services",
      "Labor only — load and unload",
      "Specialty and heavy items",
      "Multiple moving services",
    ],
    meta: {
      title: "Moving Companies in New Jersey | Jersey Home Pros",
      description:
        "Compare moving services and request an estimate from participating New Jersey moving companies.",
    },
    detailsHint:
      "Where are you moving to, and what date? Stairs, elevators or parking are worth mentioning too…",
  },

  cleaning: {
    slug: "cleaning",
    label: "Cleaning",
    company: "cleaning company",
    companies: "cleaning companies",
    work: "cleaning help",
    icon: "✦",
    blurb: "Recurring cleaning, deep cleans and move-out.",
    hero: {
      eyebrow: "NEW JERSEY HOME CLEANING, MADE SIMPLE",
      line1: "Your time.",
      lineEm: "Your choice.",
      line2: "Spotless, on schedule.",
      sub: "Find help with recurring cleaning, one-off deep cleans, and move-in or move-out cleaning—right here in New Jersey.",
    },
    how: {
      h2a: "Home cleaning,",
      h2em: "without the runaround.",
      p: "Whether you want someone every other week or one deep clean before the in-laws arrive, start with one simple request.",
    },
    estimate: {
      h2a: "Let’s get your home",
      h2em: "handled.",
      p: "Share a few details. We’ll use them to help connect your request with participating cleaning companies that serve your area.",
    },
    cards: [
      { icon: "✦", title: "Recurring Cleaning", body: "Weekly, every other week, or monthly visits." },
      { icon: "◈", title: "Deep Cleaning", body: "A thorough one-off reset, top to bottom." },
      { icon: "▣", title: "Move In / Move Out", body: "Empty-home cleans for tenants, buyers and sellers." },
      { icon: "◎", title: "Post-Construction", body: "Dust and debris cleanup after work is finished." },
    ],
    services: [
      "Recurring — weekly",
      "Recurring — every other week",
      "Recurring — monthly",
      "One-time standard clean",
      "Deep clean",
      "Move-in or move-out clean",
      "Post-construction clean",
      "Carpet or upholstery",
      "Windows",
      "Not sure yet",
    ],
    providerServices: [
      "Recurring residential cleaning",
      "One-time and deep cleaning",
      "Move-in and move-out cleaning",
      "Commercial or office cleaning",
      "Post-construction cleaning",
      "Multiple cleaning services",
    ],
    meta: {
      title: "House Cleaning Services in New Jersey | Jersey Home Pros",
      description:
        "Compare house cleaning services and request an estimate from participating New Jersey cleaning companies.",
    },
    detailsHint:
      "How many bedrooms and bathrooms, and how often? Pets, and anything needing special care, are useful to know…",
  },
  landscaping: {
    slug: "landscaping",
    label: "Landscaping",
    company: "landscaping company",
    companies: "landscaping companies",
    work: "landscaping help",
    icon: "❦",
    blurb: "Lawn care, planting, garden beds and yard cleanups.",
    hero: {
      eyebrow: "NEW JERSEY LANDSCAPING, MADE SIMPLE",
      line1: "Your yard.",
      lineEm: "Your choice.",
      line2: "Start with confidence.",
      sub: "Find help with lawn care, planting, garden beds, mulching and seasonal cleanups—right here in New Jersey.",
    },
    how: {
      h2a: "Landscaping,",
      h2em: "without the runaround.",
      p: "Whether it’s a weekly mow or a whole new front yard, start with one simple request.",
    },
    estimate: {
      h2a: "Let’s get your yard",
      h2em: "looking right.",
      p: "Share a few details. We’ll use them to help connect your request with participating landscaping companies that serve your area.",
    },
    cards: [
      { icon: "❦", title: "Lawn Care", body: "Mowing, edging, fertilizing and overseeding." },
      { icon: "✿", title: "Planting & Beds", body: "Shrubs, flowers, trees and fresh garden beds." },
      { icon: "◈", title: "Cleanups", body: "Spring and fall cleanups, leaves and debris." },
      { icon: "◎", title: "Landscape Design", body: "A plan for a new or reworked yard." },
    ],
    services: [
      "Lawn mowing and maintenance",
      "Spring or fall cleanup",
      "Mulching and garden beds",
      "Planting — shrubs, trees or flowers",
      "Sod or seeding",
      "Tree or shrub trimming",
      "Landscape design",
      "Not sure yet",
    ],
    providerServices: [
      "Lawn maintenance",
      "Seasonal cleanups",
      "Planting and garden beds",
      "Sod, seeding and lawn renovation",
      "Landscape design",
      "Multiple landscaping services",
    ],
    meta: {
      title: "Landscaping Companies in New Jersey | Jersey Home Pros",
      description:
        "Compare landscaping services and request an estimate from participating New Jersey landscaping companies.",
    },
    detailsHint:
      "Roughly how big is the yard, and is this one-time or ongoing? A rough budget helps too…",
  },

  hardscaping: {
    slug: "hardscaping",
    label: "Hardscaping",
    company: "hardscaping company",
    companies: "hardscaping companies",
    work: "hardscaping help",
    icon: "▦",
    blurb: "Patios, pavers, walkways, driveways and retaining walls.",
    hero: {
      eyebrow: "NEW JERSEY HARDSCAPING, MADE SIMPLE",
      line1: "Your outdoor space.",
      lineEm: "Your choice.",
      line2: "Start with confidence.",
      sub: "Find help with paver patios, walkways, driveways, retaining walls and outdoor living—right here in New Jersey.",
    },
    how: {
      h2a: "Hardscaping,",
      h2em: "without the runaround.",
      p: "Whether it’s a cracked walkway or a brand-new patio, start with one simple request.",
    },
    estimate: {
      h2a: "Let’s build your",
      h2em: "outdoor space.",
      p: "Share a few details. We’ll use them to help connect your request with participating hardscaping companies that serve your area.",
    },
    cards: [
      { icon: "▦", title: "Patios", body: "Paver, stone and concrete patios." },
      { icon: "⇢", title: "Walkways & Driveways", body: "New installs, repairs and resurfacing." },
      { icon: "▤", title: "Retaining Walls", body: "Block and stone walls for slopes and beds." },
      { icon: "◎", title: "Outdoor Living", body: "Fire pits, steps, seating walls and more." },
    ],
    services: [
      "Paver or stone patio",
      "Walkway",
      "Driveway — pavers or concrete",
      "Retaining wall",
      "Steps or stoop",
      "Fire pit or outdoor kitchen",
      "Repair or reset existing pavers",
      "Not sure yet",
    ],
    providerServices: [
      "Patios and walkways",
      "Driveways",
      "Retaining walls",
      "Outdoor living features",
      "Paver repair and restoration",
      "Multiple hardscaping services",
    ],
    meta: {
      title: "Hardscaping & Patio Contractors in New Jersey | Jersey Home Pros",
      description:
        "Compare patio, paver, walkway and retaining wall contractors and request an estimate from participating New Jersey hardscaping companies.",
    },
    detailsHint:
      "What are you building or fixing, and roughly how big? Photos you can describe in words help too…",
  },
};

export const TRADE_SLUGS = Object.keys(TRADES) as TradeSlug[];

export function isTradeSlug(v: unknown): v is TradeSlug {
  return typeof v === "string" && (TRADE_SLUGS as string[]).includes(v);
}

/** Never throws: unknown slugs fall back to roofing so a bad URL cannot 500. */
export function tradeOr(slug: unknown, fallback: TradeSlug = "roofing"): Trade {
  return isTradeSlug(slug) ? TRADES[slug] : TRADES[fallback];
}
