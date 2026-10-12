import type { TradeSlug } from "./trades";

/**
 * Homeowner answer pages — the free-traffic half of the strategy.
 *
 * These exist to be found at the moment something breaks, so every one
 * answers a question a person types with a problem in front of them, and
 * answers it properly before asking for anything. A page that withholds the
 * answer to force a form is worth nothing: the reader leaves, and the search
 * engine learns they left.
 *
 * Nothing here quotes a price. We do not have real local pricing yet, and an
 * invented number would be both useless to the reader and the kind of claim
 * that is hard to walk back. Cost pages come when our own contractors supply
 * the figures.
 */
export type GuideSection = {
  h2: string;
  body: ReadonlyArray<string>;
  list?: ReadonlyArray<string>;
  /** Safety callout, rendered prominently. Use only where harm is possible. */
  warn?: string;
};

export type Guide = {
  slug: string;
  trade: TradeSlug;
  h1: string;
  /** Shown under the title and used as the meta description fallback. */
  lede: string;
  updated: string;
  sections: ReadonlyArray<GuideSection>;
  meta: { title: string; description: string };
};

export const GUIDES: ReadonlyArray<Guide> = [
  {
    slug: "furnace-blowing-cold-air",
    trade: "hvac",
    h1: "Furnace blowing cold air? Here's what to check first.",
    lede:
      "Four of the five causes are things you can check yourself in about ten minutes, and one of them is the most common call heating companies get all winter.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "Start with the thermostat fan setting",
        body: [
          "This is the one that embarrasses people, and it is genuinely the most common cause. If your thermostat fan is set to ON instead of AUTO, the blower runs constantly — including between heating cycles, when there is no flame. You feel room-temperature air coming from the vents and assume the furnace has failed.",
          "Set the fan to AUTO. If the air turns warm within a few minutes, that was it.",
        ],
      },
      {
        h2: "Check the filter",
        body: [
          "A clogged filter chokes airflow across the heat exchanger. The furnace overheats, a safety limit switch shuts the burners down, and the blower keeps running to cool things off — so you get cold air from the vents while the unit cycles on and off.",
          "Pull the filter out and hold it up to a light. If you cannot see light through it, replace it. If the furnace has been short-cycling for a while, give it an hour after the change before judging whether it fixed anything.",
        ],
      },
      {
        h2: "Make sure it is actually getting power and fuel",
        body: [
          "There is usually a switch that looks like a light switch on or near the furnace. It gets flipped by accident more often than you would think, especially in basements. Check it, check the breaker, and check that the gas valve is open.",
          "If your thermostat is battery powered, weak batteries can leave the display on while failing to call for heat. Fresh batteries cost a dollar and rule it out.",
        ],
      },
      {
        h2: "If the burners light and then go out",
        body: [
          "Watch the furnace through its inspection window. If you see it ignite and then shut down a few seconds later, that usually points to a dirty flame sensor — a thin metal rod that confirms a flame is present. When it is coated, the furnace cannot confirm ignition and shuts the gas off as a safety measure.",
          "Many high-efficiency furnaces also shut down when the condensate drain backs up. If there is water pooling around the base of the unit, that is worth mentioning when you call.",
          "Both are routine repairs for a technician. Neither is something to improvise with on a gas appliance.",
        ],
      },
      {
        h2: "When to stop and call someone",
        body: [
          "If the furnace is short-cycling, making a booming or scraping noise, or you have gone through the checks above with no change, it needs a technician. Repeated overheating damages the heat exchanger, and a cracked heat exchanger is a carbon monoxide problem, not a comfort problem.",
        ],
        warn:
          "If you smell gas — like rotten eggs — do not flip any switches, do not use your phone indoors, leave the house, and call 911 and your gas utility from outside. If your carbon monoxide alarm sounds, get everyone out and call 911. Neither of these is a wait-until-morning situation.",
      },
    ],
    meta: {
      title: "Furnace Blowing Cold Air? What to Check First | Jersey Home Pros",
      description:
        "A plain checklist for a furnace blowing cold air — thermostat fan setting, filter, power, flame sensor — and the point at which it needs a technician.",
    },
  },

  {
    slug: "no-heat-what-to-check",
    trade: "hvac",
    h1: "No heat at all: what to check before you call.",
    lede:
      "Five minutes of checking can save you an emergency call-out fee, and if it does not fix it, you will be able to tell the technician something useful.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "The three that cost nothing",
        body: ["Do these in order. They resolve a surprising share of no-heat calls."],
        list: [
          "Thermostat — is it set to HEAT, and is the target temperature above the room temperature? Replace the batteries if it takes them.",
          "The furnace switch — the light-switch-looking one on or near the unit. If someone has been in the basement, it gets knocked.",
          "The breaker — check the panel. A tripped breaker needs to be pushed fully OFF before it will go back ON.",
        ],
      },
      {
        h2: "Then check the filter and the vents",
        body: [
          "A badly clogged filter can shut a furnace down on its safety limit. Replace it if light will not pass through.",
          "Walk the house and make sure supply vents are open and not blocked by furniture. Starving the return air does the same thing a dirty filter does.",
        ],
      },
      {
        h2: "If you have a high-efficiency furnace",
        body: [
          "High-efficiency units produce condensation and drain it away. When that drain clogs, a float switch cuts the furnace off deliberately to stop water backing up into the unit. Water around the base of the furnace is the tell.",
          "The furnace also draws air and vents exhaust through PVC pipes that usually exit the side of the house. After snow or heavy leaves, those can block. Clearing the outside end is something you can safely do yourself.",
        ],
      },
      {
        h2: "Protect the pipes while you wait",
        body: [
          "If the house is getting genuinely cold and the repair is hours away, open the cabinet doors under sinks on exterior walls and let faucets drip. A burst pipe turns a repair bill into a renovation.",
        ],
        warn:
          "Never use an oven, a grill, or an unvented fuel-burning heater to warm the house. They produce carbon monoxide and people die this way every winter in New Jersey. If you have no heat and nowhere warm to go, call 211 for local emergency assistance.",
      },
      {
        h2: "What to tell whoever you call",
        body: [
          "Tell them what you already checked, whether the blower runs at all, whether the burners light, and whether there is water near the unit. It is the difference between a diagnostic visit and a technician arriving with the right part on the truck.",
        ],
      },
    ],
    meta: {
      title: "No Heat? What to Check Before You Call | Jersey Home Pros",
      description:
        "A five-minute no-heat checklist for New Jersey homeowners — thermostat, furnace switch, breaker, filter, condensate — plus how to keep pipes from freezing while you wait.",
    },
  },

  {
    slug: "mice-getting-in",
    trade: "pest",
    h1: "Mice in the house in October: why now, and what actually works.",
    lede:
      "The first cold nights push mice indoors across New Jersey, all at once. Traps deal with the mice already inside. Only sealing the entry points stops the next ones.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "Why it is happening now",
        body: [
          "Mice do not hibernate. When overnight temperatures drop, they move toward warmth and stored food, and a house is the best of both. This is why half of South Jersey hears scratching in the attic the same week.",
          "A house mouse fits through a gap about the width of a pencil. Young ones get through less. Any hole that will take your little finger will take a mouse.",
        ],
      },
      {
        h2: "Find how they are getting in",
        body: [
          "This is the part people skip, and it is the only part that matters long term. Look for gaps where something enters the house.",
        ],
        list: [
          "Where pipes, cables, dryer vents and AC lines pass through exterior walls",
          "The gap under and around garage doors, especially at the corners",
          "Where the siding meets the foundation, and around basement window frames",
          "Soffits, roof-line gaps and anywhere a tree branch touches the roof",
          "Crawl space vents with torn or missing screens",
        ],
      },
      {
        h2: "Seal properly, not with foam alone",
        body: [
          "Mice chew straight through expanding foam and caulk. The gap needs something they cannot get through — copper mesh or steel wool packed tight into the hole first, then sealed over. Larger openings need hardware cloth or sheet metal.",
          "Do the sealing before or alongside trapping. Trapping alone turns into a standing appointment.",
        ],
      },
      {
        h2: "On traps and poison",
        body: [
          "Snap traps placed against walls, perpendicular, with the trigger facing the wall, work better than traps in the open — mice travel along edges, not across rooms. Bait with something sticky rather than cheese.",
          "Think hard before using poison, especially with pets or children in the house. A poisoned mouse dies somewhere you cannot reach, usually inside a wall, and you will smell it for weeks. Poisoned rodents also kill the owls, hawks and cats that eat them.",
        ],
      },
      {
        h2: "When it is worth bringing someone in",
        body: [
          "If you are hearing activity in the attic or inside walls, if it keeps coming back after sealing, or if you are finding droppings in more than one area of the house, the entry point is probably somewhere you cannot see or safely reach. That is the point where a professional inspection is cheaper than another month of guessing.",
          "Droppings and nesting material also carry real health risks. Wet them down with a disinfectant before cleaning rather than sweeping or vacuuming them dry, which puts particles into the air.",
        ],
      },
    ],
    meta: {
      title: "Mice Getting In This Fall? What Actually Works | Jersey Home Pros",
      description:
        "Why mice come indoors in October in New Jersey, where they get in, how to seal entry points so they stay out, and when an inspection is worth it.",
    },
  },

  {
    slug: "roof-leak-what-to-do-now",
    trade: "roofing",
    h1: "Roof leaking right now? Do these things in this order.",
    lede:
      "The goal in the first hour is limiting damage and documenting it. The repair is a separate problem, and the documentation is what decides whether insurance helps pay for it.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "First: contain it",
        body: [
          "Put a bucket under the drip and move anything valuable out of the area. If water is pooling in a ceiling — a bulge or a sagging patch — put a bucket underneath and pierce the centre of the bulge with a screwdriver.",
          "That feels wrong, and it is right. A contained hole drains into your bucket. A ceiling left to fill eventually comes down all at once, across the whole room.",
        ],
      },
      {
        h2: "Second: photograph everything",
        body: [
          "Before you clean anything up, take photographs and video. Wide shots showing the room, close shots of the damage, and anything ruined.",
          "Insurance claims are decided on evidence of the condition immediately after the event. Cleaning up first and photographing later costs people money routinely.",
        ],
        list: [
          "The active leak and where water is entering",
          "Every damaged surface — ceiling, walls, flooring, insulation",
          "Damaged contents, individually",
          "The date and time, which your phone records automatically",
        ],
      },
      {
        h2: "Stay off the roof",
        body: [
          "A wet roof is slick, and storm-damaged decking can be soft in places that look fine. Roof falls cause serious injuries and deaths every year, and almost all of them are homeowners rather than roofers.",
          "If the roof needs a tarp, that is a job for someone with the equipment and the insurance to do it. Interior containment is yours; the roof is not.",
        ],
        warn:
          "If water is anywhere near electrical fixtures, outlets or a ceiling light, shut that circuit off at the breaker and do not touch the fixture. If the ceiling is sagging badly across a wide area, stay out of the room entirely.",
      },
      {
        h2: "Call your insurer before you commit to a repair",
        body: [
          "Most policies cover sudden storm damage but not gradual wear, and most require you to take reasonable steps to prevent further damage — which the containment and tarping satisfy. Keep receipts for anything you spend.",
          "Get the claim opened before you authorise permanent repairs. An emergency tarp is fine and usually expected; a new roof signed for on the spot is not.",
        ],
      },
      {
        h2: "Be careful who knocks",
        body: [
          "After any significant storm, crews appear in the neighbourhood offering free inspections. Some are legitimate local companies. Some are not, and the pattern is familiar: pressure to sign immediately, a demand for money up front, and an insurance claim handled entirely by them.",
          "Do not sign anything the day of the storm. Check that the company is licensed and insured in New Jersey, and get the details in writing. Nothing legitimate disappears if you take a day.",
        ],
      },
    ],
    meta: {
      title: "Roof Leaking Right Now? What to Do First | Jersey Home Pros",
      description:
        "Step-by-step for an active roof leak — containing it, draining a bulging ceiling safely, photographing for insurance, and avoiding storm-chaser contractors.",
    },
  },

  {
    slug: "move-out-cleaning-checklist",
    trade: "cleaning",
    h1: "Move-out cleaning: what actually gets checked.",
    lede:
      "Landlords and buyers inspect a predictable list, and most deposit disputes come down to four or five of the same items every time.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "Clean after the furniture is out, not before",
        body: [
          "Every surface the movers touch gets marked again on the way out, and the floor under a sofa has not been cleaned in years. Cleaning a full apartment and then emptying it means doing it twice.",
          "If you are hiring both a mover and a cleaner, book the clean for the afternoon of the move or the following morning.",
        ],
      },
      {
        h2: "The things that actually get inspected",
        body: ["In roughly the order they cost people their deposit."],
        list: [
          "Oven and stovetop, including the drip pans and the glass in the door",
            "Refrigerator — emptied, wiped, and the seals cleaned",
          "Bathroom grout, shower door tracks and the toilet base",
          "Inside cabinets and drawers, which people forget entirely",
          "Baseboards, window sills and light switch plates",
          "Floors, including the corners and under where the appliances stood",
          "Walls — scuffs, and the holes where things hung",
        ],
      },
      {
        h2: "Nail holes and paint",
        body: [
          "Small nail holes are usually normal wear. A wall of anchors from a mounted television is not, and that one surprises people.",
          "Patch and sand before you repaint, and check your lease before painting anything — some require the original colour and some forbid touch-ups entirely, on the grounds that a mismatched patch looks worse than the hole.",
        ],
      },
      {
        h2: "Document the empty place",
        body: [
          "Photograph every room once it is empty and clean, with something showing the date. Do this even if the landlord seems reasonable.",
          "Deposit disputes are decided months later on whoever has evidence. Fifteen minutes of photographs is the cheapest insurance in the whole move.",
        ],
      },
      {
        h2: "If you are selling rather than renting",
        body: [
          "Buyers do a final walkthrough, usually the day of closing, and they are looking for the condition they agreed to buy. The two that cause problems are things left behind — paint cans, garage shelving, anything in the attic — and appliances that were supposed to stay but did not.",
          "Anything you leave behind that was not in the contract becomes the buyer's problem to dispose of, and it can hold up a closing.",
        ],
      },
    ],
    meta: {
      title: "Move-Out Cleaning Checklist: What Gets Inspected | Jersey Home Pros",
      description:
        "What landlords and buyers actually check at move-out, when to schedule the clean around the movers, and how to document an empty place to protect your deposit.",
    },
  },
];

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
