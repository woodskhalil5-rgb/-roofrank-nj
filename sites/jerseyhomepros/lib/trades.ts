/**
 * Every trade the network covers. Adding a trade is an entry here plus the
 * same slug in the database's leads_trade_check / roofers_trade_check
 * constraints. Nothing else needs to change.
 *
 * `slug` is the URL segment AND the value stored on leads and providers, so it
 * must never be changed once leads exist under it.
 */
export type TradeSlug = "roofing" | "hvac" | "pest";

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
};

export const TRADE_SLUGS = Object.keys(TRADES) as TradeSlug[];

export function isTradeSlug(v: unknown): v is TradeSlug {
  return typeof v === "string" && (TRADE_SLUGS as string[]).includes(v);
}

/** Never throws: unknown slugs fall back to roofing so a bad URL cannot 500. */
export function tradeOr(slug: unknown, fallback: TradeSlug = "roofing"): Trade {
  return isTradeSlug(slug) ? TRADES[slug] : TRADES[fallback];
}
