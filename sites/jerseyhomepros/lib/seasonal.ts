import type { TradeSlug } from "./trades";

/**
 * Seasonal South Jersey to-do suggestions for the Home Board. Advice-level
 * only (no prices, no claims). `months` are the months (1–12) a suggestion is
 * offered; `dueMonth`/`dueDay` set a sensible default date in the coming season.
 */
export type Suggestion = {
  key: string;
  title: string;
  trade: TradeSlug;
  months: number[];
  dueMonth: number;
  dueDay: number;
};

export const SUGGESTIONS: Suggestion[] = [
  { key: "furnace-tuneup", title: "Furnace / heat tune-up before the cold", trade: "hvac", months: [9, 10, 11], dueMonth: 11, dueDay: 15 },
  { key: "gutters-fall", title: "Clean gutters after the leaves drop", trade: "roofing", months: [10, 11, 12], dueMonth: 12, dueDay: 1 },
  { key: "leaf-cleanup", title: "Fall leaf cleanup and last mow", trade: "landscaping", months: [10, 11], dueMonth: 11, dueDay: 20 },
  { key: "mice-check", title: "Check for mice as nights get colder", trade: "pest", months: [10, 11, 12, 1], dueMonth: 11, dueDay: 30 },
  { key: "drafty-windows", title: "Fix drafty windows and doors before winter", trade: "windows", months: [10, 11, 12], dueMonth: 12, dueDay: 15 },
  { key: "holiday-clean", title: "Deep clean before the holidays", trade: "cleaning", months: [10, 11, 12], dueMonth: 11, dueDay: 22 },
  { key: "roof-after-storm", title: "Check the roof after winter storms", trade: "roofing", months: [1, 2, 3], dueMonth: 3, dueDay: 15 },
  { key: "ac-tuneup", title: "AC tune-up before summer", trade: "hvac", months: [3, 4, 5], dueMonth: 5, dueDay: 15 },
  { key: "spring-cleanup", title: "Spring yard cleanup and mulch", trade: "landscaping", months: [3, 4, 5], dueMonth: 4, dueDay: 15 },
  { key: "patio-plan", title: "Plan patio or walkway work for summer", trade: "hardscaping", months: [1, 2, 3, 4], dueMonth: 4, dueDay: 30 },
  { key: "termites", title: "Termite and ant check for spring", trade: "pest", months: [3, 4, 5], dueMonth: 4, dueDay: 30 },
  { key: "spring-clean", title: "Spring deep clean", trade: "cleaning", months: [3, 4], dueMonth: 4, dueDay: 15 },
  { key: "summer-move", title: "Book movers early for a summer move", trade: "moving", months: [3, 4, 5], dueMonth: 5, dueDay: 31 },
  { key: "pavers-reset", title: "Reset or seal pavers", trade: "hardscaping", months: [5, 6, 7, 8, 9], dueMonth: 9, dueDay: 15 },
];

export function suggestionsFor(date = new Date()): Suggestion[] {
  const m = date.getMonth() + 1;
  return SUGGESTIONS.filter((s) => s.months.includes(m));
}

/** Next occurrence of the suggestion's due date on or after today. */
export function dueDateFor(s: Suggestion, today = new Date()): string {
  let y = today.getFullYear();
  const d = new Date(Date.UTC(y, s.dueMonth - 1, s.dueDay));
  if (d.getTime() < Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) y += 1;
  return `${y}-${String(s.dueMonth).padStart(2, "0")}-${String(s.dueDay).padStart(2, "0")}`;
}
