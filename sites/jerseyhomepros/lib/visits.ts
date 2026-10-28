/**
 * Road Pro guided visits. A Road Pro doesn't need to know the trade: the app
 * walks them through what to ask, what to photograph and what to measure, in
 * order. 15 minutes, ground level only. Add or reword steps freely; answers
 * are stored by step id on `estimates.checklist`.
 */

export type StepKind = "ask" | "photo" | "measure" | "check";
export type Step = { id: string; kind: StepKind; text: string; hint?: string };

const START: Step[] = [
  { id: "intro", kind: "check", text: "Introduce yourself: name, Jersey Home Pros, free site visit, about 15 minutes." },
  { id: "safety", kind: "check", text: "Stay on the ground. No ladders, no roofs, no crawl spaces.", hint: "If something can only be seen from a ladder, note it. The contractor will look." },
];

const FINISH: Step[] = [
  { id: "timeline", kind: "ask", text: "When would they like the work done?" },
  { id: "decision", kind: "ask", text: "Is anyone else involved in the decision (spouse, landlord, HOA)?" },
  { id: "insurance", kind: "check", text: "If they mention insurance: “That’s between you and your insurance company.” Don’t discuss the claim." },
  { id: "next", kind: "check", text: "Explain next steps: JHP prepares the written estimate range and introduces ONE contractor. No obligation." },
];

const GUIDES: Record<string, Step[]> = {
  roofing: [
    { id: "age", kind: "ask", text: "How old is the roof? Any past repairs?" },
    { id: "leak", kind: "ask", text: "Any leaks inside? Where, and when does it happen (heavy rain, wind)?" },
    { id: "p_front", kind: "photo", text: "Photo: whole front of the house showing the roof." },
    { id: "p_sides", kind: "photo", text: "Photo: each side and the back, from the ground." },
    { id: "p_damage", kind: "photo", text: "Photo: close-up (zoom) of any missing, curled or dark shingles." },
    { id: "p_gutters", kind: "photo", text: "Photo: gutters and downspouts." },
    { id: "p_inside", kind: "photo", text: "If there’s a leak: photo of the ceiling stain inside." },
    { id: "stories", kind: "measure", text: "Number of stories, and is the roof steep or low?", hint: "Exact roof size comes from a satellite measurement, never a ladder." },
  ],
  hvac: [
    { id: "issue", kind: "ask", text: "What’s happening: no heat, no cooling, noise, high bills, or replacing an old system?" },
    { id: "age", kind: "ask", text: "How old is the system? Gas, oil, electric or heat pump?" },
    { id: "p_outdoor", kind: "photo", text: "Photo: the outdoor unit, and its label/sticker up close." },
    { id: "p_indoor", kind: "photo", text: "Photo: the furnace or air handler, and its label up close." },
    { id: "p_thermo", kind: "photo", text: "Photo: the thermostat." },
    { id: "sqft", kind: "measure", text: "Rough size of the home (square feet or number of bedrooms) and number of floors." },
  ],
  hardscaping: [
    { id: "want", kind: "ask", text: "What do they want: new patio, walkway, driveway, wall, or repair?" },
    { id: "material", kind: "ask", text: "Material they like (pavers, concrete, stone) and any photos they’ve saved?" },
    { id: "p_area", kind: "photo", text: "Photo: the whole area, from two corners." },
    { id: "p_problem", kind: "photo", text: "Photo: close-up of cracks, sinking or drainage problems." },
    { id: "size", kind: "measure", text: "Measure: length × width in feet (walk it or use a tape).", hint: "Add it as a line from the price book with the square footage as the quantity." },
    { id: "access", kind: "check", text: "Note access: can a truck/machine get to the area? Slopes? Trees?" },
  ],
  windows: [
    { id: "issue", kind: "ask", text: "Which windows or doors, and what’s wrong (drafty, foggy, broken, won’t open)?" },
    { id: "count", kind: "measure", text: "Count how many windows/doors need work.", hint: "Add a price-book line with the count as the quantity." },
    { id: "p_each", kind: "photo", text: "Photo: each window/door from inside and outside." },
    { id: "p_problem", kind: "photo", text: "Photo: close-up of the problem (fog between glass, rot, broken seal)." },
    { id: "size", kind: "measure", text: "Width × height of a typical window (inside the frame)." },
  ],
  landscaping: [
    { id: "want", kind: "ask", text: "What do they want: cleanup, regular mowing, planting, beds, sod?" },
    { id: "often", kind: "ask", text: "One-time or ongoing? How often?" },
    { id: "p_front", kind: "photo", text: "Photo: front yard." },
    { id: "p_back", kind: "photo", text: "Photo: back yard." },
    { id: "size", kind: "measure", text: "Rough lawn size (small / medium / large, or length × width)." },
  ],
};

const GENERIC: Step[] = [
  { id: "issue", kind: "ask", text: "What’s the problem, in their words? How long has it been going on?" },
  { id: "p_area", kind: "photo", text: "Photo: the whole area." },
  { id: "p_problem", kind: "photo", text: "Photo: close-up of the problem." },
  { id: "size", kind: "measure", text: "Measure or count whatever the job is priced by." },
];

export function guideFor(trade: string): Step[] {
  return [...START, ...(GUIDES[trade] ?? GENERIC), ...FINISH];
}

/** How the Road Pro talks about JHP. Short enough to read in the driveway. */
export const TALK = {
  opener:
    "Hi, I’m [name] with Jersey Home Pros. You asked for a free site visit. I’ll take some photos and measurements, about 15 minutes, and JHP will send you a written estimate range and introduce one contractor for the job. You’re never obligated to hire anyone.",
  why: [
    "JHP doesn’t have its own crew to push, so the goal is the right contractor for your job.",
    "You get a written range before any contractor quotes you, so you know what’s fair.",
    "One contractor, not ten phone calls.",
  ],
  close:
    "If the range works for you, can I tell JHP you’d like to move forward? The contractor will reach out to confirm the price and schedule.",
  never: [
    "“Guaranteed”, “best price”, “licensed” or “background-checked contractor” (say only what JHP actually checked).",
    "A firm price. Only the range in the app; the contractor sets the final price.",
    "Anything about their insurance claim.",
    "Pressure. If they want to think about it, that’s fine: they’ll get the range in writing.",
  ],
  cancel:
    "If a homeowner signs a JHP contract at their home, they have 3 business days to cancel and the contract must say so. Never start work or take full payment inside those 3 days.",
};
