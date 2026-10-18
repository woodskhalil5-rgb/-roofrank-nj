/**
 * Parser for pasted agent research.
 *
 * The researcher pastes one agent per line, straight out of a spreadsheet or
 * typed by hand. Columns are separated by a tab or a pipe, in this order:
 *
 *   Name | Licence number | Licence status | Brokerage | Town | ZIP codes | Phone | Source URL
 *
 * Only the name is required. Anything missing is left blank rather than
 * guessed, and every row keeps the raw line so a reviewer can see exactly what
 * was pasted.
 */

export type SourceKind =
  | "state_register"
  | "brokerage_site"
  | "agent_told_us"
  | "other";

/** How a fact from this kind of source may be described. */
export const SOURCE_KIND_VERIFICATION: Record<SourceKind, string> = {
  state_register: "verified",
  brokerage_site: "verified",
  agent_told_us: "self_reported",
  other: "third_party",
};

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  state_register: "The New Jersey licence register",
  brokerage_site: "The brokerage's own website",
  agent_told_us: "The agent told us directly",
  other: "Somewhere else",
};

export interface ParsedRow {
  line: number;
  raw: string;
  fullName: string;
  licenseNumber: string;
  licenseStatus: string;
  brokerage: string;
  town: string;
  zips: string[];
  phone: string;
  sourceUrl: string;
  problems: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  usable: ParsedRow[];
  rejected: ParsedRow[];
}

const HEADER_HINTS = ["name", "licence", "license", "brokerage"];

function looksLikeHeader(cells: string[]): boolean {
  const first = (cells[0] ?? "").toLowerCase();
  return HEADER_HINTS.some((h) => first.includes(h));
}

export function parsePastedAgents(input: string): ParseResult {
  const rows: ParsedRow[] = [];

  const lines = input.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;

    const cells = trimmed
      .split(/\t|\s*\|\s*/)
      .map((c) => c.trim());

    if (index === 0 && looksLikeHeader(cells)) return;

    const [
      fullName = "",
      licenseNumber = "",
      licenseStatus = "",
      brokerage = "",
      town = "",
      zipField = "",
      phone = "",
      sourceUrl = "",
    ] = cells;

    const zips = zipField
      .split(/[,\s]+/)
      .map((z) => z.trim())
      .filter((z) => z.length > 0);

    const problems: string[] = [];

    if (fullName.length < 3) {
      problems.push("No agent name on this line");
    }
    if (cells.length < 2) {
      problems.push(
        "Only one column found — separate the columns with a tab or a | character",
      );
    }
    for (const zip of zips) {
      if (!/^[0-9]{5}$/.test(zip)) {
        problems.push(`"${zip}" is not a five-digit ZIP code`);
      }
    }
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      problems.push("The source link should start with https://");
    }

    rows.push({
      line: index + 1,
      raw: trimmed,
      fullName,
      licenseNumber,
      licenseStatus,
      brokerage,
      town,
      zips,
      phone,
      sourceUrl,
      problems,
    });
  });

  return {
    rows,
    usable: rows.filter((r) => r.problems.length === 0),
    rejected: rows.filter((r) => r.problems.length > 0),
  };
}

/** URL-safe handle for an agent, with a short suffix to avoid collisions. */
export function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70);
  return `${base || "agent"}-${Math.random().toString(36).slice(2, 7)}`;
}
