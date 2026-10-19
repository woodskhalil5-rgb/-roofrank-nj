/**
 * One definition of "a placement is running today".
 *
 * A campaign has a start date and usually an end date. Everywhere a Sponsored
 * label, a gold border or a hero card is decided, the same window has to be
 * applied — otherwise an agent who advertised once stays labelled as a paying
 * advertiser forever, and a campaign that has not started yet is shown early.
 *
 * Apply it IN THE QUERY, never after a `limit`. Filtering expired rows out in
 * JavaScript after the database has already returned the first three means a
 * live campaign can be pushed out of the result by campaigns that have ended.
 */

/** Today in the date form the placement columns use. */
export function placementDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The PostgREST filter for "ends today or later, or never ends".
 * Use alongside `.lte("starts_on", day)`.
 */
export function endsOnOrAfter(day: string): string {
  return `ends_on.is.null,ends_on.gte.${day}`;
}

/** The same test in JavaScript, for rows already in hand. */
export function isLiveOn(
  startsOn: string | null,
  endsOn: string | null,
  day: string,
): boolean {
  if (!startsOn || startsOn > day) return false;
  if (endsOn && endsOn < day) return false;
  return true;
}

/** How many statewide positions exist. Selling a fourth is overselling. */
export const STATEWIDE_SLOTS = 3;
