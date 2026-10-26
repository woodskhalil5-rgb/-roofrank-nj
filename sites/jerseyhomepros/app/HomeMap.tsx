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
  /** Pin position in drawing coordinates (visible area y 130–480). */
  x: number;
  y: number;
  /** Which side of the pin the label chip sits on. */
  side: "left" | "right";
};

const SPOTS: Spot[] = [
  { slug: "roofing", label: "Roofing", hint: "Leaks, shingles, storm damage", x: 500, y: 206, side: "left" },
  { slug: "cleaning", label: "Cleaning", hint: "Deep cleans, move-out", x: 470, y: 262, side: "left" },
  { slug: "hvac", label: "Heating & Cooling", hint: "No heat, no AC", x: 652, y: 350, side: "right" },
  { slug: "pest", label: "Pest Control", hint: "Mice, insects, termites", x: 532, y: 432, side: "right" },
  { slug: "moving", label: "Moving", hint: "Local moves, packing", x: 112, y: 322, side: "right" },
];

/** Rough text widths for the chip backgrounds (Arial, bold 14 / regular 11). */
function chipWidth(s: Spot): number {
  return Math.round(Math.max(s.label.length * 8.6, s.hint.length * 6.1) + 26);
}

export default function HomeMap() {
  return (
    <div className="homemap">
      <div className="homemaphead">
        <div className="eyebrow dark"><i></i> TAP THE PROBLEM</div>
        <p>Not sure who to call? Point at the part of the house that needs help.</p>
      </div>
      <svg viewBox="0 130 860 350" role="group" aria-label="Choose what your home needs by tapping part of the house">
        <defs>
          <linearGradient id="hmSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7dbbe8" />
            <stop offset="1" stopColor="#d8eefb" />
          </linearGradient>
          <linearGradient id="hmLawn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7cc35a" />
            <stop offset="1" stopColor="#4e9a36" />
          </linearGradient>
          <linearGradient id="hmGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#bfe3f7" />
            <stop offset=".55" stopColor="#6fa9cf" />
            <stop offset="1" stopColor="#3f6f92" />
          </linearGradient>
          <linearGradient id="hmRoof" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b4248" />
            <stop offset="1" stopColor="#2a2f34" />
          </linearGradient>
          <linearGradient id="hmWood" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#b9814f" />
            <stop offset="1" stopColor="#9a6438" />
          </linearGradient>
          <linearGradient id="hmTruck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e3e6e8" />
          </linearGradient>
          <filter id="hmShadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity=".22" />
          </filter>
        </defs>

        {/* ---------- sky ---------- */}
        <rect width="860" height="480" fill="url(#hmSky)" />
        <circle cx="790" cy="178" r="26" fill="#ffe08a" />
        <circle cx="790" cy="178" r="40" fill="#ffe08a" opacity=".25" />
        <g fill="#fff" opacity=".9">
          <ellipse cx="130" cy="186" rx="40" ry="13" />
          <ellipse cx="160" cy="177" rx="26" ry="15" />
          <ellipse cx="104" cy="180" rx="20" ry="11" />
          <ellipse cx="690" cy="160" rx="30" ry="10" />
          <ellipse cx="712" cy="153" rx="20" ry="12" />
        </g>

        {/* ---------- distant hills + trees ---------- */}
        <path d="M0 352 C120 318 230 330 330 342 C430 326 560 318 680 336 C760 326 820 330 860 336 V420 H0Z" fill="#9fd07f" />
        <g fill="#5fa645">
          <circle cx="40" cy="338" r="22" /><circle cx="70" cy="330" r="18" />
          <circle cx="800" cy="330" r="20" /><circle cx="832" cy="338" r="18" />
        </g>
        {/* big tree, right */}
        <rect x="760" y="300" width="10" height="100" fill="#7a5233" />
        <circle cx="765" cy="276" r="40" fill="#4f9a3a" />
        <circle cx="740" cy="298" r="26" fill="#5aa843" />
        <circle cx="792" cy="296" r="26" fill="#5aa843" />

        {/* ---------- lawn ---------- */}
        <rect x="0" y="398" width="860" height="82" fill="url(#hmLawn)" />
        <g stroke="#3f8a2c" strokeWidth="1.4" strokeLinecap="round" opacity=".55">
          <path d="M28 430l3-7M34 430l-2-8M300 452l3-7M306 452l-2-8M640 440l3-7M646 440l-2-8M720 466l3-7M726 466l-2-8M820 424l3-7M826 424l-2-8M560 470l3-7M566 470l-2-8" />
        </g>
        {/* driveway + walkway */}
        <path d="M318 402 H412 L470 480 H200 Z" fill="#d9d6cf" />
        <path d="M318 402 H412 L470 480 H200 Z" fill="none" stroke="#c4c0b7" />
        <path d="M553 402 H583 L600 480 H540 Z" fill="#d9d6cf" />

        {/* ---------- house ---------- */}
        <g className="hmhouse">
          {/* garage wing: wood-clad box with a flat roof slab */}
          <rect x="300" y="292" width="130" height="110" fill="url(#hmWood)" />
          <g stroke="#7f5230" strokeOpacity=".45">
            <path d="M310 292V402M322 292V402M334 292V402M346 292V402M358 292V402M370 292V402M382 292V402M394 292V402M406 292V402M418 292V402" />
          </g>
          <rect x="292" y="282" width="146" height="11" fill="#2a2f34" />
          {/* garage door */}
          <rect x="318" y="318" width="94" height="84" fill="#5b636a" />
          <g stroke="#454c52"><path d="M318 335H412M318 352H412M318 369H412M318 386H412" /></g>
          <rect x="318" y="318" width="94" height="16" fill="url(#hmGlass)" opacity=".8" />

          {/* main two-storey volume */}
          <rect x="430" y="232" width="200" height="170" fill="#f6f5f1" />
          <rect x="430" y="232" width="200" height="170" fill="none" stroke="#dedbd3" />
          {/* side window */}
          <rect x="562" y="252" width="48" height="56" fill="url(#hmGlass)" stroke="#2a2f34" strokeWidth="3" />
          {/* front door with sidelight */}
          <rect x="553" y="326" width="30" height="76" fill="url(#hmWood)" stroke="#2a2f34" strokeWidth="2" />
          <rect x="586" y="326" width="10" height="76" fill="url(#hmGlass)" stroke="#2a2f34" strokeWidth="2" />
          <circle cx="577" cy="366" r="2.2" fill="#2a2f34" />
          {/* lower picture window */}
          <rect x="446" y="330" width="88" height="56" fill="url(#hmGlass)" stroke="#2a2f34" strokeWidth="3" />
          <path d="M490 330V386" stroke="#2a2f34" strokeWidth="2" />
          {/* wall light + house number */}
          <rect x="604" y="336" width="6" height="10" rx="2" fill="#ffd36b" />
          {/* foundation */}
          <rect x="296" y="400" width="338" height="6" fill="#9a968d" />
          {/* shrubs */}
          <g fill="#3f8f2f">
            <circle cx="444" cy="400" r="10" /><circle cx="458" cy="396" r="12" /><circle cx="474" cy="401" r="9" />
            <circle cx="616" cy="398" r="11" /><circle cx="632" cy="401" r="9" />
          </g>
          <g fill="#59ad44">
            <circle cx="452" cy="394" r="6" /><circle cx="620" cy="393" r="6" />
          </g>
        </g>

        {/* ---------- roof (roofing) ---------- */}
        <a href="/roofing#estimate" className="hmspot" aria-label="Roofing: leaks, shingles, storm damage">
          <path className="hmarea" d="M418 236 L530 168 L642 236 Z" fill="url(#hmRoof)" />
          <g stroke="#4c545b" strokeWidth="1.3">
            <path d="M446 219V236M474 202V236M502 185V236M530 168V236M558 185V236M586 202V236M614 219V236" />
          </g>
          <path d="M414 238 L530 166 L646 238" fill="none" stroke="#1f2327" strokeWidth="4" strokeLinejoin="round" />
        </a>

        {/* ---------- upstairs picture window (cleaning) ---------- */}
        <a href="/cleaning#estimate" className="hmspot" aria-label="Cleaning: deep cleans, move-out">
          <rect className="hmarea" x="446" y="250" width="96" height="60" fill="url(#hmGlass)" stroke="#2a2f34" strokeWidth="3" />
          <path d="M494 250V310" stroke="#2a2f34" strokeWidth="2" />
          <path d="M452 304 L478 256 L486 256 L460 304Z" fill="#fff" opacity=".35" />
          <path d="M520 262l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#fff" />
          <path d="M507 288l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" fill="#fff" opacity=".85" />
        </a>

        {/* ---------- AC condenser (hvac) ---------- */}
        <a href="/hvac#estimate" className="hmspot" aria-label="Heating and cooling: no heat, no AC">
          <rect x="640" y="400" width="62" height="6" fill="#bdbab2" />
          <rect className="hmarea" x="644" y="354" width="54" height="46" rx="3" fill="#e9ebec" stroke="#9aa1a6" strokeWidth="1.5" />
          <circle cx="671" cy="377" r="15" fill="#c9cdd0" stroke="#7d858b" />
          <path d="M671 364v26M658 377h26M662 368l18 18M680 368l-18 18" stroke="#7d858b" strokeWidth="1.2" />
          <path d="M630 372H644" stroke="#7d858b" strokeWidth="3" strokeLinecap="round" />
        </a>

        {/* ---------- mouse at the foundation (pest) ---------- */}
        <a href="/pest#estimate" className="hmspot" aria-label="Pest control: mice, insects, termites">
          <rect className="hmarea" x="482" y="390" width="56" height="24" fill="transparent" />
          <rect x="500" y="399" width="14" height="7" fill="#3a3a36" />
          <ellipse cx="520" cy="406" rx="11" ry="6.5" fill="#8d8f92" />
          <circle cx="530" cy="401" r="4" fill="#8d8f92" />
          <circle cx="531" cy="397" r="2.5" fill="#b8babd" />
          <circle cx="533" cy="401.5" r="1" fill="#111" />
          <path d="M509 407q-10 4 -15 -3" fill="none" stroke="#8d8f92" strokeWidth="1.4" />
        </a>

        {/* ---------- moving truck (moving) ---------- */}
        <a href="/moving#estimate" className="hmspot" aria-label="Moving: local moves, packing">
          <rect className="hmarea" x="58" y="330" width="136" height="80" rx="3" fill="url(#hmTruck)" stroke="#b9c0c5" strokeWidth="1.5" />
          <rect x="58" y="380" width="136" height="9" fill="#d6ad58" />
          <path d="M194 352 H230 L254 378 V410 H194 Z" fill="url(#hmTruck)" stroke="#b9c0c5" strokeWidth="1.5" />
          <path d="M202 358 H228 L244 376 H202 Z" fill="url(#hmGlass)" />
          <rect x="246" y="396" width="8" height="6" fill="#ffd36b" />
          <circle cx="92" cy="412" r="13" fill="#2a2f34" /><circle cx="92" cy="412" r="5" fill="#a7adb2" />
          <circle cx="222" cy="412" r="13" fill="#2a2f34" /><circle cx="222" cy="412" r="5" fill="#a7adb2" />
          {/* boxes on the lawn */}
          <rect x="262" y="390" width="26" height="22" fill="#c99a62" stroke="#a87b48" />
          <rect x="268" y="372" width="18" height="18" fill="#d4a870" stroke="#a87b48" />
          <path d="M262 401H288M268 381H286" stroke="#a87b48" />
        </a>

        {/* ---------- pins + label chips ---------- */}
        {SPOTS.map((s) => {
          const w = chipWidth(s);
          const cx = s.side === "right" ? s.x + 16 : s.x - 16 - w;
          const cy = s.y - 19;
          return (
            <a key={s.slug} href={`/${s.slug}#estimate`} className="hmpin" aria-hidden="true" tabIndex={-1}>
              <circle className="hmpulse" cx={s.x} cy={s.y} r="10" />
              <circle cx={s.x} cy={s.y} r="7" fill="#d6ad58" stroke="#fff" strokeWidth="2.5" />
              <g className="hmchip" filter="url(#hmShadow)">
                <rect x={cx} y={cy} width={w} height="38" rx="6" fill="#fff" />
              </g>
              <text x={cx + 13} y={cy + 16} className="hmlabel">{s.label}</text>
              <text x={cx + 13} y={cy + 30} className="hmhint">{s.hint}</text>
            </a>
          );
        })}
      </svg>
      {/* On a phone the drawing is too small for readable labels, so the
          pins stay on the drawing and the names move into tappable buttons. */}
      <div className="homemaplegend">
        {SPOTS.map((s) => (
          <a key={s.slug} href={`/${s.slug}#estimate`}><i></i>{s.label}</a>
        ))}
      </div>
    </div>
  );
}
