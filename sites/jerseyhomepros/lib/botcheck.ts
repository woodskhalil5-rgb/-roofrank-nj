/**
 * Lightweight bot screening for public forms (no CAPTCHA, nothing a real
 * person notices). Each signal adds to a score; a submission at or above
 * SPAM_SCORE is stored as spam and silently accepted, so bots learn nothing
 * and the operator gets no alert. Found 2026-11-07: a claim with names like
 * "MsfrtoNnDKhNxYjcDYQ" and a 624 area code.
 */
export const SPAM_SCORE = 3;

// Area codes around NJ (NJ, NY, PA, DE, MD, CT). Outside these is only a weak signal:
// real contractors carry out-of-area cell numbers.
const NEARBY = new Set(("201 551 609 640 732 848 856 862 908 973 " +
  "212 315 332 347 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934 " +
  "215 223 267 272 412 445 484 570 582 610 717 724 814 835 878 302 240 301 410 443 667 203 475 860 959").split(" "));

/** "MsfrtoNnDKhNxYjcDYQ": one long token with case flipping all over the place. */
export function looksRandom(s: string): boolean {
  const t = s.trim();
  if (t.length < 10 || /\s/.test(t)) return false;
  let flips = 0;
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], b = t[i];
    if (/[a-z]/.test(a) && /[A-Z]/.test(b)) flips++;
  }
  const vowels = (t.match(/[aeiouy]/gi) ?? []).length / t.length;
  return flips >= 3 || vowels < 0.15;
}

/** North American numbering rules: area code and exchange can't start with 0/1, no N11 / N9X area codes. */
export function phoneProblem(phone: string): "invalid" | "far" | null {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return "invalid";
  const area = d.slice(0, 3), exch = d.slice(3, 6);
  if (/^[01]/.test(area) || /^[01]/.test(exch) || area[1] === "9" || /^.11$/.test(area)) return "invalid";
  return NEARBY.has(area) ? null : "far";
}

export function botScore(f: { honeypot?: string; elapsedMs?: number; names?: string[]; phone?: string }) {
  const reasons: string[] = [];
  let score = 0;
  if (f.honeypot) { score += 10; reasons.push("hidden field filled"); }
  if (typeof f.elapsedMs === "number" && f.elapsedMs >= 0 && f.elapsedMs < 3000) { score += 2; reasons.push(`sent ${Math.round(f.elapsedMs / 100) / 10}s after page load`); }
  for (const n of f.names ?? []) if (n && looksRandom(n)) { score += 2; reasons.push(`random-looking text "${n.slice(0, 40)}"`); }
  if (f.phone) {
    const p = phoneProblem(f.phone);
    if (p === "invalid") { score += 2; reasons.push("phone isn't a real US number format"); }
    if (p === "far") { score += 1; reasons.push("phone area code not near NJ"); }
  }
  return { spam: score >= SPAM_SCORE, score, reasons };
}
