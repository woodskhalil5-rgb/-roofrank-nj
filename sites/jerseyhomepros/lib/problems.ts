import { TRADE_SLUGS, TRADES, type TradeSlug } from "./trades";

/**
 * Turns a homeowner's own words ("water stain on the ceiling", "no heat")
 * into the trade that handles it. Deliberately a plain keyword list, not a
 * model: it's predictable, it can't invent a diagnosis, and the result page
 * always says what it matched and lets the homeowner switch with one tap.
 *
 * Each entry: a word or phrase (lowercase) and its weight. Phrases beat
 * single words. Add words here freely; nothing else needs to change.
 */
const WORDS: Record<TradeSlug, [string, number][]> = {
  roofing: [
    ["roof", 3], ["roofer", 4], ["shingle", 4], ["shingles", 4], ["gutter", 3], ["gutters", 3],
    ["leak in ceiling", 4], ["ceiling leak", 4], ["water stain", 3], ["stain on ceiling", 3],
    ["flashing", 3], ["chimney", 2], ["skylight", 2], ["soffit", 2], ["fascia", 2],
    ["storm damage", 2], ["hail", 2], ["missing shingles", 5], ["attic leak", 3], ["leak", 1],
  ],
  hvac: [
    ["hvac", 5], ["heat", 2], ["heater", 3], ["no heat", 5], ["furnace", 5], ["boiler", 4],
    ["heat pump", 5], ["ac", 3], ["a/c", 3], ["air conditioning", 5], ["air conditioner", 5],
    ["no ac", 5], ["no cold air", 5], ["thermostat", 4], ["vent", 2], ["vents", 2], ["duct", 3],
    ["ducts", 3], ["blowing cold", 4], ["blowing warm", 4], ["cold house", 3], ["freezing inside", 3],
    ["tune up", 2], ["tune-up", 2], ["mini split", 4], ["radiator", 3],
  ],
  pest: [
    ["pest", 4], ["exterminator", 5], ["mice", 5], ["mouse", 5], ["rat", 4], ["rats", 4],
    ["roach", 5], ["roaches", 5], ["cockroach", 5], ["ants", 4], ["ant", 2], ["termite", 5],
    ["termites", 5], ["bed bugs", 5], ["bedbugs", 5], ["wasp", 4], ["wasps", 4], ["hornet", 4],
    ["bees", 3], ["spiders", 3], ["fleas", 4], ["ticks", 3], ["droppings", 4], ["scratching in the walls", 5],
    ["bugs", 3], ["rodent", 5], ["squirrel in attic", 4], ["stink bugs", 4],
  ],
  moving: [
    ["moving", 4], ["movers", 5], ["mover", 5], ["move", 2], ["relocate", 3], ["packing", 3],
    ["piano", 3], ["heavy furniture", 4], ["storage", 2], ["truck", 1], ["downsizing", 3],
    ["moving out", 4], ["moving in", 4],
  ],
  cleaning: [
    ["cleaning", 4], ["cleaner", 4], ["clean", 2], ["maid", 5], ["housekeeper", 5],
    ["deep clean", 5], ["move out clean", 5], ["move-out clean", 5], ["dirty", 2], ["dust", 2],
    ["carpet cleaning", 4], ["window cleaning", 3], ["post construction cleaning", 5],
  ],
  landscaping: [
    ["landscaping", 5], ["landscaper", 5], ["lawn", 4], ["grass", 3], ["mow", 4], ["mowing", 4],
    ["yard", 3], ["leaves", 3], ["leaf", 3], ["mulch", 4], ["shrubs", 3], ["bushes", 3],
    ["hedge", 3], ["trees", 2], ["tree", 2], ["weeds", 3], ["garden", 3], ["flower bed", 4],
    ["sod", 4], ["aeration", 4], ["fall cleanup", 4], ["spring cleanup", 4], ["sprinkler", 3],
  ],
  hardscaping: [
    ["hardscaping", 5], ["hardscape", 5], ["patio", 4], ["pavers", 5], ["paver", 5],
    ["walkway", 4], ["driveway", 4], ["retaining wall", 5], ["fire pit", 4], ["steps", 2],
    ["stoop", 3], ["concrete", 3], ["cracked driveway", 5], ["sinking pavers", 5], ["stone wall", 4],
  ],
  windows: [
    ["window", 4], ["windows", 4], ["door", 3], ["doors", 3], ["drafty", 4], ["draft", 3],
    ["foggy window", 5], ["broken glass", 4], ["cracked window", 5], ["sliding door", 5],
    ["patio door", 5], ["storm door", 5], ["front door", 4], ["entry door", 5], ["window replacement", 5],
    ["stuck window", 4], ["sash", 3], ["screen door", 3],
  ],
};

export type Guess = { trade: TradeSlug; score: number; matched: string[] };

export function guessTrades(text: string): Guess[] {
  const q = ` ${text.toLowerCase().replace(/[^a-z0-9/ -]+/g, " ").replace(/\s+/g, " ").trim()} `;
  if (q.trim().length < 2) return [];
  const out: Guess[] = [];
  for (const slug of TRADE_SLUGS) {
    let score = 0;
    const matched: string[] = [];
    for (const [w, weight] of WORDS[slug]) {
      if (q.includes(` ${w} `) || q.includes(` ${w}s `)) {
        score += weight + (w.includes(" ") ? 2 : 0);
        matched.push(w);
      }
    }
    // The trade's own name and label count too ("roofing", "heating & cooling").
    const label = TRADES[slug].label.toLowerCase();
    if (q.includes(` ${slug} `) || q.includes(` ${label} `)) score += 5;
    if (score > 0) out.push({ trade: slug, score, matched });
  }
  return out.sort((a, b) => b.score - a.score);
}
