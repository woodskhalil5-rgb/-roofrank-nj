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
  table?: {
    head: ReadonlyArray<string>;
    rows: ReadonlyArray<ReadonlyArray<string>>;
  };
  /** Safety callout, rendered prominently. Use only where harm is possible. */
  warn?: string;
};

/**
 * A page that quotes money must say where the money came from. Every figure on
 * a cost page traces to one of these, each of which was actually opened and
 * read rather than taken from a search snippet.
 */
export type GuideSource = {
  title: string;
  url: string;
  /** Scope and date, so the reader can judge how much weight it carries. */
  note: string;
};

export type Guide = {
  slug: string;
  trade: TradeSlug;
  h1: string;
  /** Shown under the title and used as the meta description fallback. */
  lede: string;
  updated: string;
  sections: ReadonlyArray<GuideSection>;
  sources?: ReadonlyArray<GuideSource>;
  meta: { title: string; description: string };
};

export const GUIDES: ReadonlyArray<Guide> = [
  {
    slug: "furnace-blowing-cold-air",
    trade: "hvac",
    h1: "Furnace blowing cold air? Here's what to check first.",
    lede:
      "Most of the causes are things you can check yourself in about ten minutes — and the first one on the list is a thermostat setting, not a broken furnace.",
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
      "Landlords and buyers inspect a fairly predictable list, and the same few items are the ones people tend to forget.",
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
        body: ["These are the ones that come up again and again."],
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
  {
    slug: "roof-replacement-cost-nj",
    trade: "roofing",
    h1: "What a roof replacement costs in New Jersey.",
    lede:
      "Published figures put a New Jersey roof replacement between roughly $8,500 and $17,000, with asphalt shingles at $3 to $7 a square foot installed. Here is what moves a quote inside that range.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "New Jersey cost per square foot, by material",
        body: [
          "These are New Jersey figures rather than national ones, installed. Measure your roof's footprint, not your floor space — a steep roof covers considerably more area than the house beneath it.",
        ],
        table: {
          head: ["Material", "Installed, per sq ft in NJ"],
          rows: [
            ["Asphalt shingles (3-tab)", "$3 – $7"],
            ["Architectural shingles", "$7 – $15"],
            ["Rubber (EPDM)", "$3 – $7"],
            ["PVC / vinyl", "$3 – $5"],
            ["Cedar shake", "$4 – $13"],
            ["Concrete tile", "$7 – $10"],
            ["Metal", "$9 – $17"],
            ["Clay tile", "$9 – $15"],
            ["Slate", "$10 – $20"],
          ],
        },
      },
      {
        h2: "What pushes a quote up",
        body: [
          "Two houses the same size can quote thousands apart, and it is usually one of these rather than the contractor being greedy.",
        ],
        list: [
          "Layers coming off — tearing off two or three old layers costs more in labour and dumpster fees than one",
          "Rotten decking found after tear-off, which nobody can price until the old roof is off",
          "Steep pitch, which slows everything down and changes the safety equipment needed",
          "Complexity — valleys, dormers, skylights and chimneys all need flashing, and flashing is where leaks start",
          "Permits and disposal, which vary by municipality across Camden, Gloucester and Burlington counties",
        ],
      },
      {
        h2: "Why estimates should be in writing, itemised",
        body: [
          "A roof quote that is one number on one line is impossible to compare against another one. Ask for the tear-off, the decking allowance, the underlayment, the flashing, the disposal and the warranty broken out separately.",
          "The decking allowance matters most. A quote that says nothing about rotten decking is a quote that will change after the roof is open, and by then you are not in a position to negotiate.",
        ],
      },
      {
        h2: "An honest note on these numbers",
        body: [
          "These are published ranges, not a quote, and they are a starting point for judging whether what you have been handed is reasonable. The only number that matters for your house comes from someone who has stood on it.",
          "We do not yet have verified South Jersey figures of our own. When contractors in our network give us real local numbers, this page gets them.",
        ],
      },
    ],
    sources: [
      {
        title: "Fixr — Roof Replacement Cost in New Jersey",
        url: "https://fixr.com/costs/roof-replacement-new-jersey",
        note: "New Jersey-specific, updated March 2026",
      },
    ],
    meta: {
      title: "Roof Replacement Cost in New Jersey (2026) | Jersey Home Pros",
      description:
        "New Jersey roof replacement costs by material, what pushes a quote up, and how to read an itemised estimate. Published figures, sourced and dated.",
    },
  },

  {
    slug: "furnace-replacement-cost",
    trade: "hvac",
    h1: "What a new furnace costs, installed.",
    lede:
      "Published figures put a standard-efficiency furnace at roughly $3,500 to $7,500 installed, and a high-efficiency unit as high as $11,500. Home size drives it more than anything else.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "By home size",
        body: ["Standard installations, equipment and labour together."],
        table: {
          head: ["Home size", "Installed cost"],
          rows: [
            ["1,000 – 1,500 sq ft", "$2,000 – $4,500"],
            ["1,500 – 2,500 sq ft", "$3,000 – $6,500"],
            ["2,500 – 3,500 sq ft", "$4,000 – $9,500"],
            ["3,500+ sq ft", "$5,500 – $10,000+"],
          ],
        },
      },
      {
        h2: "By fuel and efficiency",
        body: [
          "High-efficiency units cost more up front and less to run. Whether that trade works out depends on how long you plan to stay and what you pay for fuel.",
        ],
        table: {
          head: ["Type", "Installed cost"],
          rows: [
            ["Electric", "$2,500 – $7,000+"],
            ["Gas", "$3,000 – $10,000+"],
            ["Oil", "$4,000 – $10,000+"],
            ["Standard efficiency (80–89% AFUE)", "$3,500 – $7,500+"],
            ["High efficiency (90–98% AFUE)", "$3,800 – $11,500+"],
          ],
        },
      },
      {
        h2: "Repair or replace",
        body: [
          "A furnace past about fifteen years, facing a repair worth a large share of a new unit, is usually worth replacing rather than patching. A newer furnace with one failed part almost never is.",
          "The exception that overrides the arithmetic is a cracked heat exchanger. That is a carbon monoxide risk, not a comfort problem, and it ends the conversation about repair.",
        ],
      },
      {
        h2: "Where quotes go wrong",
        body: [
          "The commonest problem is not price, it is sizing. An oversized furnace short-cycles, wears out early and heats unevenly, and it is a frequent shortcut. A contractor should be measuring your house and doing a load calculation, not sizing the new unit off the label on the old one.",
          "Ask what else is included: removing the old unit, any ducting or venting changes, the thermostat, the permit and inspection. Those are the lines that differ between two quotes that look the same.",
        ],
      },
      {
        h2: "An honest note on these numbers",
        body: [
          "These are national published figures, not New Jersey-specific, and not a quote. Treat them as a sanity check on what you have been handed rather than a target.",
          "When contractors in our network give us real South Jersey numbers, they will replace these.",
        ],
      },
    ],
    sources: [
      {
        title: "HomeGuide — New Furnace Replacement Cost",
        url: "https://homeguide.com/costs/new-furnace-replacement-cost",
        note: "National figures, written December 2025, labelled 2026 pricing",
      },
    ],
    meta: {
      title: "New Furnace Cost, Installed (2026) | Jersey Home Pros",
      description:
        "What a furnace replacement costs by home size, fuel and efficiency, when repair beats replacement, and the sizing shortcut that causes most bad installs.",
    },
  },

  {
    slug: "mice-exterminator-cost",
    trade: "pest",
    h1: "What it costs to get mice out — and keep them out.",
    lede:
      "Published figures put most mouse jobs between $150 and $550, averaging around $350. The number that actually decides your bill is how much sealing the house needs.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "Typical costs",
        body: ["National published ranges for residential work."],
        table: {
          head: ["Service", "Cost"],
          rows: [
            ["Inspection", "$75 – $125 (sometimes free locally)"],
            ["Typical job, overall range", "$150 – $550"],
            ["Lethal trap service", "$150 – $475"],
            ["Bait stations with monitoring", "$300 – $550"],
            ["Emergency or after-hours visit", "Add $100 – $200"],
          ],
        },
      },
      {
        h2: "Sealing is what the price really tracks",
        body: [
          "Trapping removes the mice already inside. Exclusion — sealing how they get in — is what stops the next ones, and it is the line item that varies most.",
        ],
        table: {
          head: ["Scope", "Cost"],
          rows: [
            ["Small — one entry point sealed", "$100 – $500"],
            ["Medium — minor sealing work", "$500 – $1,000"],
            ["Large — sealing plus repairs", "$1,000 – $7,000+"],
          ],
        },
      },
      {
        h2: "Treat a cheap quote with no exclusion as a subscription",
        body: [
          "A low price to set traps and come back is not the same service as finding and closing the entry points. The first one ends when you stop paying. The second one ends.",
          "When you compare quotes, compare what each says about exclusion. If one does not mention it at all, that is the difference, not the price.",
        ],
      },
      {
        h2: "An honest note on these numbers",
        body: [
          "These are national published figures, not New Jersey-specific, and not a quote. Real pricing depends on the size of the house, how long it has been going on, and how accessible the entry points are.",
          "We will replace these with South Jersey figures once contractors in our network supply them.",
        ],
      },
    ],
    sources: [
      {
        title: "HomeGuide — Mice Exterminator Cost",
        url: "https://homeguide.com/costs/mice-exterminator-cost",
        note: "National figures, written September 2025",
      },
    ],
    meta: {
      title: "Mice Exterminator Cost (2026) | Jersey Home Pros",
      description:
        "What mouse removal costs — inspection, trapping, bait stations and the exclusion work that actually stops them coming back. Sourced published figures.",
    },
  },

  {
    slug: "local-moving-cost",
    trade: "moving",
    h1: "What a local move costs.",
    lede:
      "Local movers generally charge $50 to $100 per mover per hour with a three to five hour minimum, which puts a two or three bedroom move somewhere between $900 and $2,800.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "By home size",
        body: ["Local meaning under about 50 miles, which covers most moves inside South Jersey."],
        table: {
          head: ["Home size", "Crew and time", "Typical cost"],
          rows: [
            ["Studio or 1 bedroom", "2 movers, 2 – 4 hrs", "$300 – $800"],
            ["2 – 3 bedrooms", "3 – 4 movers, 6 – 7 hrs", "$900 – $2,800"],
            ["4 – 5 bedrooms", "4 – 5 movers, 9 – 12 hrs", "$1,800 – $6,000"],
          ],
        },
      },
      {
        h2: "What gets added",
        body: [
          "Packing is the big one and it is usually quoted separately — budget $600 to $2,500 for a company to pack and disassemble furniture.",
        ],
        list: [
          "Stairs and long carries from the truck to the door",
          "Elevator buildings, especially where the elevator has to be booked",
          "Pianos, safes, gun safes and oversized appliances",
          "Packing materials, if you did not buy your own boxes",
          "Storage between move-out and move-in",
        ],
      },
      {
        h2: "Hourly billing rewards being ready",
        body: [
          "You are paying by the hour, so everything boxed, labelled and stacked by the door before the crew arrives comes straight off the bill. Beds broken down, drawers emptied, path cleared.",
          "The reverse is also true. A crew that spends the first ninety minutes waiting for you to finish packing the kitchen is ninety minutes you are paying for.",
        ],
      },
      {
        h2: "Check the licence before you book",
        body: [
          "Movers operating within New Jersey are regulated by the State, and anything crossing state lines needs federal authority. Ask for the licence number and proof of insurance, and check it.",
          "The classic scam is a low phone estimate, then a truck loaded and a much higher price demanded before anything comes off. A legitimate mover will do a walkthrough or video survey and give you a written estimate.",
        ],
      },
      {
        h2: "An honest note on these numbers",
        body: [
          "These are national published figures, not New Jersey-specific, and not a quote. Rates in the Philadelphia metro may differ.",
          "We will put real South Jersey numbers here once movers in our network supply them.",
        ],
      },
    ],
    sources: [
      {
        title: "HomeGuide — Moving Company Costs",
        url: "https://homeguide.com/costs/moving-company-costs",
        note: "National figures, written November 2025",
      },
    ],
    meta: {
      title: "Local Moving Cost (2026) | Jersey Home Pros",
      description:
        "What local movers charge per hour and by home size, what gets added to the bill, and how to check a New Jersey mover's licence before you book.",
    },
  },

  {
    slug: "house-cleaning-cost",
    trade: "cleaning",
    h1: "What house cleaning costs.",
    lede:
      "Published figures put a standard visit around $120 to $280, at roughly $25 to $75 per cleaner per hour. Recurring service costs less per visit than a one-off.",
    updated: "2026-10-12",
    sections: [
      {
        h2: "Standard cleaning, by home size",
        body: ["Per visit, for routine rather than deep cleaning."],
        table: {
          head: ["Home", "Per visit"],
          rows: [
            ["Studio", "about $60"],
            ["1 bed, 1 bath", "$60 – $90"],
            ["2 bed, 1 bath", "$90 – $120"],
            ["2 bed, 2 bath", "$95 – $130"],
            ["3 bed, 1 bath", "$110 – $165"],
            ["3 bed, 2 bath", "$135 – $180"],
            ["4 bed, 3 bath", "$140 – $200"],
          ],
        },
      },
      {
        h2: "Deep cleans and move-outs cost more",
        body: [
          "These are different jobs from a routine visit — inside the oven and fridge, baseboards, grout, inside cabinets — and they are priced accordingly.",
        ],
        table: {
          head: ["Service", "Cost"],
          rows: [
            ["Deep clean", "$230 – $600"],
            ["Move-in or move-out clean", "$150 – $500"],
            ["Move-out, around 2,000 sq ft", "$300 – $500"],
          ],
        },
      },
      {
        h2: "Recurring is cheaper per visit, and not only on paper",
        body: [
          "Weekly or fortnightly service is priced below the equivalent one-off, partly as a discount and partly because a house cleaned regularly takes less time than one cleaned twice a year.",
          "If you are deciding between a monthly deep clean and a fortnightly standard clean at a similar monthly total, the fortnightly one generally leaves the house in better condition.",
        ],
      },
      {
        h2: "An honest note on these numbers",
        body: [
          "These are national figures and they are the oldest data on any of our cost pages — the source was written in 2024, and its own tables disagree with each other in places. We are quoting the ranges rather than any single average for that reason.",
          "Treat them as a rough sanity check only. Local quotes will be more reliable than this page, and when cleaners in our network give us South Jersey numbers we will replace these.",
        ],
      },
    ],
    sources: [
      {
        title: "HomeGuide — House Cleaning Prices",
        url: "https://homeguide.com/costs/house-cleaning-prices",
        note: "National figures, written April 2024 — the oldest source cited here, with internally inconsistent tables",
      },
    ],
    meta: {
      title: "House Cleaning Cost (2026) | Jersey Home Pros",
      description:
        "What house cleaning costs per visit by home size, what deep cleans and move-out cleans run, and why recurring service is cheaper per visit.",
    },
  },
];

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
