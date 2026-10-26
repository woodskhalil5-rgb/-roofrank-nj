/**
 * The clickable house. Each part of the drawing is a link to that trade's
 * request form, so a homeowner can point at the problem instead of having to
 * know what the trade is called. The trade cards below it stay as the plain,
 * accessible way in.
 *
 * Hotspots are SVG <a> elements: they work without JavaScript, take keyboard
 * focus, and carry an aria-label naming the trade.
 */
type Spot = {
  slug: "roofing" | "hvac" | "pest" | "moving" | "cleaning";
  label: string;
  hint: string;
  /** Pin position in the 860x470 drawing. */
  x: number;
  y: number;
  /** Which side the label sits on, so labels never run off the drawing. */
  side: "left" | "right";
};

const SPOTS: Spot[] = [
  { slug: "roofing", label: "Roofing", hint: "Leaks, missing shingles, storm damage", x: 330, y: 150, side: "left" },
  { slug: "hvac", label: "Heating & Cooling", hint: "No heat, no AC, strange noises", x: 640, y: 372, side: "right" },
  { slug: "pest", label: "Pest Control", hint: "Mice, insects, termites", x: 470, y: 446, side: "right" },
  { slug: "moving", label: "Moving", hint: "Local moves, packing, heavy items", x: 60, y: 300, side: "right" },
  { slug: "cleaning", label: "Cleaning", hint: "Deep cleans, move-out, recurring", x: 530, y: 286, side: "right" },
];

export default function HomeMap() {
  return (
    <div className="homemap">
      <div className="homemaphead">
        <div className="eyebrow"><i></i> TAP THE PROBLEM</div>
        <p>Not sure who to call? Point at the part of the house that needs help.</p>
      </div>
      <svg viewBox="0 0 860 470" role="group" aria-label="Choose what your home needs by tapping part of the house">
        <defs>
          <linearGradient id="hmSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b1b18" />
            <stop offset="1" stopColor="#0a0b0c" />
          </linearGradient>
          <pattern id="hmShingle" width="22" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 11.5H22M11 0V11.5" stroke="#d6ad58" strokeOpacity=".22" strokeWidth="1" />
          </pattern>
          <pattern id="hmSiding" width="10" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 13.5H10" stroke="#d6ad58" strokeOpacity=".09" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="860" height="470" fill="url(#hmSky)" />
        {/* moon + ground */}
        <circle cx="770" cy="70" r="26" fill="none" stroke="#d6ad58" strokeOpacity=".35" />
        <path d="M0 420H860" stroke="#d6ad58" strokeOpacity=".45" />
        <path d="M0 420H860V470H0Z" fill="#121312" />
        {/* driveway */}
        <path d="M40 420L210 420L230 470L0 470Z" fill="#191a18" />

        {/* ---------- house ---------- */}
        <g className="hmhouse">
          {/* chimney */}
          <rect x="455" y="118" width="34" height="62" fill="#121414" stroke="#d6ad58" strokeOpacity=".6" />
          {/* body */}
          <rect x="250" y="232" width="300" height="188" fill="#151614" stroke="#d6ad58" strokeOpacity=".7" />
          <rect x="250" y="232" width="300" height="188" fill="url(#hmSiding)" />
          {/* door */}
          <rect x="372" y="330" width="56" height="90" fill="#0d0e0d" stroke="#d6ad58" strokeOpacity=".7" />
          <circle cx="418" cy="378" r="2.5" fill="#d6ad58" />
          {/* left window */}
          <rect x="282" y="268" width="66" height="54" fill="#22231f" stroke="#d6ad58" strokeOpacity=".6" />
          <path d="M315 268V322M282 295H348" stroke="#d6ad58" strokeOpacity=".4" />
          {/* foundation line */}
          <path d="M250 408H550" stroke="#d6ad58" strokeOpacity=".3" />
        </g>

        {/* ---------- roof (roofing) ---------- */}
        <a href="/roofing#estimate" className="hmspot" aria-label="Roofing: leaks, missing shingles, storm damage">
          <path className="hmarea" d="M225 236L400 112L575 236Z" fill="url(#hmShingle)" stroke="#d6ad58" strokeWidth="1.5" />
          <path d="M225 236L400 112L575 236" fill="none" stroke="#d6ad58" strokeWidth="2" />
          {/* attic vent */}
          <path d="M386 196h28v18h-28z" fill="#0d0e0d" stroke="#d6ad58" strokeOpacity=".6" />
          <path d="M388 201h24M388 206h24M388 211h24" stroke="#d6ad58" strokeOpacity=".4" />
          {/* missing shingle */}
          <path d="M318 168l14 -9 8 12 -14 8z" fill="#0a0b0c" stroke="#d6ad58" strokeOpacity=".8" />
        </a>

        {/* ---------- sparkling window (cleaning) ---------- */}
        <a href="/cleaning#estimate" className="hmspot" aria-label="Cleaning: deep cleans, move-out, recurring">
          <rect className="hmarea" x="452" y="268" width="66" height="54" fill="#2a2a24" stroke="#d6ad58" strokeWidth="1.5" />
          <path d="M485 268V322M452 295H518" stroke="#d6ad58" strokeOpacity=".5" />
          <path d="M466 282l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#d6ad58" />
          <path d="M503 304l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" fill="#d6ad58" opacity=".7" />
        </a>

        {/* ---------- AC condenser (hvac) ---------- */}
        <a href="/hvac#estimate" className="hmspot" aria-label="Heating and cooling: no heat, no AC, strange noises">
          <rect className="hmarea" x="566" y="356" width="62" height="64" fill="#151614" stroke="#d6ad58" strokeWidth="1.5" />
          <circle cx="597" cy="384" r="20" fill="none" stroke="#d6ad58" strokeOpacity=".7" />
          <path d="M597 368v32M581 384h32M586 373l22 22M608 373l-22 22" stroke="#d6ad58" strokeOpacity=".45" />
          <path d="M566 410h62" stroke="#d6ad58" strokeOpacity=".5" />
          {/* pipe into the house */}
          <path d="M566 370H550" stroke="#d6ad58" strokeOpacity=".6" strokeWidth="2" />
        </a>

        {/* ---------- mouse at the foundation (pest) ---------- */}
        <a href="/pest#estimate" className="hmspot" aria-label="Pest control: mice, insects, termites">
          <rect className="hmarea" x="455" y="392" width="78" height="28" fill="transparent" />
          <ellipse cx="492" cy="410" rx="15" ry="9" fill="#a9aaa8" />
          <circle cx="505" cy="403" r="5" fill="#a9aaa8" />
          <circle cx="507" cy="398" r="3" fill="#c9c9c3" />
          <circle cx="509" cy="404" r="1.2" fill="#0a0b0c" />
          <path d="M477 412q-12 4 -20 -4" fill="none" stroke="#a9aaa8" strokeWidth="1.5" />
          {/* crack in the foundation */}
          <path d="M520 408l6 -6 4 5 6 -7" fill="none" stroke="#d6ad58" strokeOpacity=".7" />
        </a>

        {/* ---------- moving truck (moving) ---------- */}
        <a href="/moving#estimate" className="hmspot" aria-label="Moving: local moves, packing, heavy items">
          <rect className="hmarea" x="38" y="334" width="118" height="70" fill="#151614" stroke="#d6ad58" strokeWidth="1.5" />
          <path d="M156 358h34l20 24v22h-54z" fill="#151614" stroke="#d6ad58" strokeWidth="1.5" />
          <path d="M164 364h22l14 16h-36z" fill="#22231f" stroke="#d6ad58" strokeOpacity=".5" />
          <circle cx="70" cy="408" r="12" fill="#0a0b0c" stroke="#d6ad58" strokeWidth="1.5" />
          <circle cx="180" cy="408" r="12" fill="#0a0b0c" stroke="#d6ad58" strokeWidth="1.5" />
          <path d="M54 352h28v20h-28zM88 352h22v20h-22zM60 376h40v18h-40z" fill="none" stroke="#d6ad58" strokeOpacity=".45" />
        </a>

        {/* ---------- pins + labels ---------- */}
        {SPOTS.map((s) => {
          const lx = s.side === "right" ? s.x + 18 : s.x - 18;
          const anchor = s.side === "right" ? "start" : "end";
          return (
            <a key={s.slug} href={`/${s.slug}#estimate`} className="hmpin" aria-hidden="true" tabIndex={-1}>
              <circle className="hmpulse" cx={s.x} cy={s.y} r="11" />
              <circle cx={s.x} cy={s.y} r="7" fill="#d6ad58" stroke="#0a0b0c" strokeWidth="2" />
              <text x={lx} y={s.y - 2} textAnchor={anchor} className="hmlabel">{s.label}</text>
              <text x={lx} y={s.y + 13} textAnchor={anchor} className="hmhint">{s.hint}</text>
            </a>
          );
        })}
      </svg>
    </div>
  );
}
