/**
 * The clickable house: a photo with a heads-up-display layer on top. A scan
 * line sweeps once, then gold brackets lock onto each part of the home, each
 * linking to that trade's request form. The tags NAME areas; they never claim
 * to have detected a problem, because the page has no way to know.
 *
 * The photo is AI-generated (no real address, no real people). The brackets
 * are SVG <a> links over it, so they work without JavaScript and with a
 * keyboard. The trade cards below stay as the plain way in.
 */
type Zone = {
  slug: "roofing" | "hvac" | "pest" | "moving" | "cleaning" | "landscaping" | "hardscaping";
  label: string;
  hint: string;
  /** Bracket rectangle in the 2048x1360 photo. */
  x: number; y: number; w: number; h: number;
  /** Where the tag sits relative to the bracket. */
  tag: "above" | "below" | "inside-bottom";
};

const ZONES: Zone[] = [
  { slug: "roofing", label: "Roofing", hint: "Leaks, storm damage, replacement", x: 551, y: 316, w: 901, h: 196, tag: "above" },
  { slug: "cleaning", label: "Cleaning", hint: "Deep cleans, windows, move-out", x: 337, y: 501, w: 185, h: 490, tag: "above" },
  { slug: "hvac", label: "Heating & Cooling", hint: "No heat, no AC, tune-ups", x: 629, y: 1001, w: 134, h: 122, tag: "above" },
  { slug: "pest", label: "Pest Control", hint: "Mice, insects, termites", x: 80, y: 1022, w: 520, h: 84, tag: "below" },
  { slug: "moving", label: "Moving", hint: "Local moves, packing, heavy items", x: 1444, y: 872, w: 324, h: 199, tag: "above" },
  { slug: "landscaping", label: "Landscaping", hint: "Lawn, planting, cleanups", x: 60, y: 1168, w: 1080, h: 172, tag: "inside-bottom" },
  { slug: "hardscaping", label: "Hardscaping", hint: "Patios, walkways, driveways", x: 1440, y: 1112, w: 580, h: 228, tag: "inside-bottom" },
];

const TAG_H = 46;
/** Rough width for an uppercase tag: number + label at 23px bold with tracking. */
function tagWidth(z: Zone): number {
  return Math.round(z.label.length * 17.5 + 92);
}

function Bracket({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const c = Math.min(46, w / 3, h / 3);
  return (
    <path
      className="hudbracket"
      d={`M${x} ${y + c}V${y}H${x + c} M${x + w - c} ${y}H${x + w}V${y + c} M${x + w} ${y + h - c}V${y + h}H${x + w - c} M${x + c} ${y + h}H${x}V${y + h - c}`}
    />
  );
}

export default function HomeMap({ hero = false }: { hero?: boolean }) {
  return (
    <div className={hero ? "homemap homemaphero" : "homemap"} id="scan">
      {!hero && (
        <div className="homemaphead">
          <div className="eyebrow"><i></i> TAP THE PROBLEM</div>
          <p>Not sure who to call? Tap the part of the home that needs help.</p>
        </div>
      )}

      <div className="hud">
        <picture>
          <source srcSet="/home-hud.webp" type="image/webp" />
          <img src="/home-hud.jpg" width={1600} height={1062} loading={hero ? "eager" : "lazy"} decoding="async"
               fetchPriority={hero ? "high" : "auto"}
               alt="A modern two-story home with a lawn, shrubs, an AC unit, a garage and a driveway" />
        </picture>

        <svg viewBox="0 0 2048 1360" role="group" aria-label="Areas of the home you can tap">
          <defs>
            <linearGradient id="hudScan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d6ad58" stopOpacity="0" />
              <stop offset=".85" stopColor="#d6ad58" stopOpacity=".28" />
              <stop offset="1" stopColor="#ffe6a8" stopOpacity=".9" />
            </linearGradient>
            <pattern id="hudGrid" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M64 0H0V64" fill="none" stroke="#d6ad58" strokeOpacity=".09" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* faint grid + one-time scan sweep */}
          <rect className="hudgrid" width="2048" height="1360" fill="url(#hudGrid)" />
          <rect className="hudscan" x="0" y="-160" width="2048" height="160" fill="url(#hudScan)" />

          {/* status line: describes the interface, never a finding */}
          <g className="hudstatus">
            <rect x="28" y="28" width="610" height="52" rx="4" />
            <circle cx="62" cy="54" r="8" className="hudlive" />
            <text x="84" y="63">HOME SCAN · {ZONES.length} AREAS · TAP ONE</text>
          </g>

          {ZONES.map((z, i) => {
            const tw = tagWidth(z);
            const ty =
              z.tag === "above" ? z.y - TAG_H - 10
              : z.tag === "below" ? z.y + z.h + 10
              : z.y + z.h - TAG_H - 14;
            const tx = z.tag === "inside-bottom" ? z.x + 14 : z.x;
            const n = String(i + 1).padStart(2, "0");
            return (
              <a key={z.slug} href={`/${z.slug}#estimate`} className="hudzone"
                 style={{ ["--d" as string]: `${0.9 + i * 0.16}s` }}
                 aria-label={`${z.label}: ${z.hint}`}>
                <rect className="hudarea" x={z.x} y={z.y} width={z.w} height={z.h} />
                <Bracket x={z.x} y={z.y} w={z.w} h={z.h} />
                <circle className="hudpulse" cx={z.x + z.w / 2} cy={z.y + z.h / 2} r="16" />
                <circle className="huddot" cx={z.x + z.w / 2} cy={z.y + z.h / 2} r="10" />
                <g className="hudtag">
                  <rect x={tx} y={ty} width={tw} height={TAG_H} rx="4" />
                  <text x={tx + 16} y={ty + 31} className="hudnum">{n}</text>
                  <text x={tx + 62} y={ty + 31} className="hudlabel">{z.label.toUpperCase()}</text>
                </g>
              </a>
            );
          })}
        </svg>
      </div>

      {/* On a phone the tags are too small to read, so the names move into
          numbered buttons under the photo. */}
      <div className="homemaplegend">
        {ZONES.map((z, i) => (
          <a key={z.slug} href={`/${z.slug}#estimate`}><b>{String(i + 1).padStart(2, "0")}</b>{z.label}</a>
        ))}
      </div>
    </div>
  );
}
