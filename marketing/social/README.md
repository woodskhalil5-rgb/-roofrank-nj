# Jersey Home Pros: weekly social posts (Facebook + Instagram)

Organic only, for now (Khalil, 2026-10-26). Four posts a week. Each week's
graphics and captions are generated every Sunday and handed to Khalil, who
bulk-schedules them in Meta Business Suite. Nothing here posts to Meta
directly. Auto-posting through the Graph API is a later step and needs
Khalil to create a Meta developer app.

## The look (keep it identical every week; it IS the brand)
- Real house photo on top, gold corner brackets + numbered tag on the thing
  being talked about, "HOME SCAN · …" status pill top-left.
- Copy panel below: gold eyebrow, Georgia headline with a gold italic second
  line, one-sentence sub, "JERSEY HOME PROS / jerseyhomepros.com".
- Built by `make_posts.js` from a JSON spec. Photos come from
  `sites/jerseyhomepros/public` (`home-hud.jpg` outside, `home-inside.jpg`
  inside; both 1600x1062). Crops ≈ 4:3. Render, then LOOK at every image
  before sending (brackets on target, nothing clipped, no overlaps).

Useful source rectangles (1600x1062 px):
- Outside (home-hud.jpg): roof 430,247,704,153 · left window 263,391,145,383 ·
  AC unit 491,782,105,95 · front door 715,609,98,188 · garage 1128,681,253,155 ·
  lawn 47,912,844,134 · driveway 1125,869,453,178 · whole house crop 130,40,1340,1018
- Inside (home-inside.jpg): ceiling vent 625,16,258,117 · thermostat 552,520,72,66 ·
  back windows 680,469,594,195 · kitchen 1330,600,240,260 · island 1047,703,328,258 ·
  moving boxes 47,703,234,234

## Weekly mix
1. One "Home Scan" post (the tool itself: tap it, step inside).
2. Two seasonal South Jersey checklist posts tied to a trade (link to /<trade>).
3. One fun / timely post (holiday, weather event), still tied to a trade.
Trades: roofing, hvac, pest, moving, cleaning, landscaping, hardscaping,
windows. Rotate so every trade shows up at least once a month. Favour trades
with a paying provider (check `roofers` where status='approved' and
leads_enabled) for posts that push requests.

## Rules (same honesty rules as the site)
- Never claim a detection, inspection or finding. The brackets NAME areas.
- Never feature or endorse a company that hasn't joined. Unclaimed listings
  are never named in posts.
- No invented numbers. A data post ("most-requested this week") may only use
  real counts from the `leads` table (status <> 'spam', last 7 days), and only
  when the count is big enough not to identify a homeowner (≥ 5). Otherwise skip it.
- No prices unless sourced. No "guaranteed", "licensed and insured", "best".
- Never automate posting into Facebook groups.

## Output each week
`weeks/<monday>.json`, `weeks/<monday>-captions.md` (feed + story image names,
link, caption, 5–9 hashtags with South Jersey towns), images rendered with
`node make_posts.js weeks/<monday>.json <outdir>`.

## Reels (since 2026-10-26: this is the main format now)
Khalil disliked the static photo graphics; he wants funny, family-friendly
reels. Workflow: the Sunday task writes 4 Higgsfield (AI video) prompts to
`reels/<monday>.md`; Khalil generates the 8-second 720x1280 clips and sends
them back in chat; we add a white meme caption box at the top, a gold
bracket + "01 TAP <TRADE>" tag popping in at the punchline, and a 2.6s
end card (dark gold-gradient, brackets, "Skip the …" serif line, JERSEY HOME
PROS / jerseyhomepros.com). Overlays are rendered as transparent PNGs with
Playwright and composited with ffmpeg; `reels/couch-overlays.js` is the first
one (moving-couch clip, Oct 26) and the template to copy. Keep the clip's own
audio; Khalil adds a trending sound in the Instagram app.

### The series: "Hired the wrong contractor again?" (Khalil, 2026-10-26)
Every reel is a funny fictional contractor/DIY fail. Caption pattern "Hired the
wrong ___ … again? 😩"; end card "Wrong contractor again? / Tap the problem.
Compare local pros. You choose." Never imply our pros are vetted,
background-checked, guaranteed or "the right one" — none of that is done.
The true promise is comparing and choosing.

### TV-ad style (v3, Oct 26): the current template
Khalil wants reels to feel like funny TV ads: native-style outlined caption
(white, black stroke, y≈300, never in the top 250px), then at ~3s an animated
Home Scan (dim + grid, gold sweep line, brackets lock on, typed joke
readouts, "TAP ▸ MOVING" tag) with synthesized computer SFX (power-up, sweep,
lock beeps, data chatter, confirm chime, whoosh), then a 6s end card with the
tagline "Because 'my cousin can do it' isn't a plan." Files: reels/scan.js
(HUD frames), reels/cards.js (captions + end cards), SFX via numpy (see the
couch reel build), reels/voiceover-script.md. Readouts must NARRATE the joke
("PROBLEM ... THIS COUCH"), never pretend the site analyses a room — Home Scan
is a tap, not a camera. No TTS engine exists in the sandbox; the female
announcer VO comes from Khalil (ElevenLabs/CapCut) and is mixed in with ducking.
