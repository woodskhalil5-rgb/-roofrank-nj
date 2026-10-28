# Jersey Home Pros — working notes

Read this before changing anything. It carries the decisions that are not
obvious from the code, and the ones that were expensive to learn.

Operator: Khalil Woods, South Jersey (856). Camden, Gloucester, Burlington
counties. Destiny Marketing Group.

## Standing instructions from Khalil

- Preserve the current site design. Don't redesign unasked.
- **Never expose secret keys or commit them.** Service-role key, Resend key and
  anything like them live in Vercel env vars only.
- Explain anything that needs his authorization before doing it.
- Diagnose before asking him to redo work.
- Don't nag him to test things.

### "We G" — his status check

When Khalil writes **"We G"** (or "we g?"), he is asking two questions and
wants both answered:

1. **Is the site fine?** Check it, do not answer from memory. Deployment
   state, `GET /api/health/alerts?token=$HEALTH_CHECK_TOKEN&send=0` for the
   alert config and backlog, and the database for anything stuck.
2. **Is there anything he needs to do that Claude cannot?** The things only
   he can do: third-party dashboards (Resend, Namecheap, Supabase auth
   settings, Google), anything needing a card or a signature, and recruiting
   actual contractors. List these specifically, or say plainly that there is
   nothing.

Answer both every time, briefly. If nothing needs him, say so — do not invent
work to fill the second half.

## The rule everything else follows

**Describe what is true now, never what will always be true.** Every feature
sold on a promise must be enforced by the software, and the software must say
so in writing where the person affected will read it.

This has decided most of the real design choices here:

- The lead email states the *real* number of other companies that received the
  request, computed from the match count. It is never assumed.
- The contractor's email carries a CONTACT PERMISSION block that says EMAIL
  ONLY when the homeowner withheld phone consent. That is wired to a database
  column, not a policy page.
- The privacy notice says more than one company *may* receive a request. That
  is the outer bound of what is permitted; the pitch describes what happens
  today. Do not tighten the policy into a promise.
- Nothing claims background checks, because none are run.
- Cost guides quote published figures with the source named and dated, and say
  plainly that they are national where they are national. No invented numbers.

A claim the software contradicts is the failure mode to watch for. It has come
up repeatedly and it is always worth stopping for.

## Architecture

**Adding a trade is one entry in `lib/trades.ts` plus widening two CHECK
constraints.** The homepage grid, trade pages, static params, sitemap, footer,
consent wording, join form and admin filters all read `TRADE_SLUGS`. If you
find yourself hardcoding a trade list anywhere, that is a bug — it has already
happened twice (the footer, the sitemap).

- `lib/trades.ts` — every trade. The only place a trade is defined.
- `lib/site.ts` — brand only, no trade specifics.
- `lib/consent.ts` — consent wording, versioned. Changing wording means
  bumping `CONSENT_VERSION`.
- `lib/guides.ts` — homeowner answer pages and cost pages, same config pattern.
- `lib/server.ts` — service-role client, admin auth, all outbound email.
- `supabase/schema.sql` — the rebuild path. Keep it matching the live database.

**Access model:** RLS is on with *no policies*, deliberately. Nothing reaches
the tables with the anon key; everything goes through the server with the
service-role key. This is not an oversight.

## Gotchas that cost real time

- **No npm install in the agent sandbox** — no DNS to the registries. You
  cannot build or typecheck locally. Vercel is the compiler: push and read the
  deployment status. Plan for that; don't fight it.
- **Vercel applies env vars at build time.** Adding one does nothing until a
  redeploy. This has bitten twice.
- **Supabase auth config is dashboard-only** via MCP. Site URL and Redirect
  URLs cannot be changed from here.
- **Magic links are single-use** and the built-in mailer is rate limited to a
  couple an hour. Admin sign-in uses a password first, email as backup.
- `cube` and `earthdistance` live in the `extensions` schema. `match_lead`
  pins `search_path` to `public, extensions` — don't remove that.
- Filtering a line array with `.filter(l => l !== '')` strips the blank lines
  that separate paragraphs. Spread optional lines in conditionally instead.
  This shipped broken twice in email bodies.
- Generated images can contain spurious burned-in text. **Look at them.** An
  unnoticed one propagated through an entire video build.
- WebFetch caches for 15 minutes. After a deploy, verify against the
  deployment-specific URL, not the live domain.
- **The agent sandbox cannot reach jerseyhomepros.com** — curl is refused by
  the egress proxy. To exercise a live route, use the Vercel MCP's
  `web_fetch_vercel_url`, which is GET-only. That is why the alert self-test
  is a GET with a token rather than a POST.
- **The Resend API key is send-only.** `GET /emails/{id}` returns 401
  `restricted_api_key`. Nothing can poll for delivery; it has to arrive via
  the webhook. Do not "fix" this by asking for a broader key.
- **`operator_notified_at` is not proof of delivery.** It means Resend
  returned 2xx. Mail to a domain with no mailbox is accepted and bounces
  minutes later. Delivery lives in `email_events`, fed by the webhook.
- **Never put several recipients in one Resend `to` array.** One unroutable
  address fails the request for everyone on it. `sendEmail` now issues one
  request per recipient for exactly this reason.
- `leads@jerseyhomepros.com` is the verified **From** address and has **no
  inbox**. Never put it in an alert recipient list. Alerts go to
  `LEAD_ALERT_EMAILS`.

## Verify, don't assume

Everything shipped here was checked against reality before being called done:
HTML read back from the deployment, emails rendered and eyeballed, SQL run
inside a rolled-back transaction, video frames extracted and inspected, audio
transcribed to confirm it said what the script said. When a check is not
possible — audio cannot be heard from this sandbox — say so plainly rather
than implying it was verified.

## Current state

Live at jerseyhomepros.com. Eight trades: roofing, hvac, pest, moving,
cleaning, landscaping, hardscaping (added 2026-10-26, separate per Khalil),
windows ("Windows & Doors", added 2026-10-26). Khalil intends to cover all
home-service trades eventually. Brutal-honest advice given him: add a trade
once there is a company for it — a trade with no provider is a dead end for
every homeowner who uses it. Ten guide pages. `/join` for contractors, `/admin` for the operator,
`/receptionist` for the unbuilt missed-call product (deliberately unlinked).

Supabase project `fpvvadcyuzcnjuzyhaav`. Vercel project `jersey-home-pros`,
root directory `sites/jerseyhomepros` in a monorepo.

Two approved providers (checked against the database 2026-10-24), both
listed in the directory and sent dashboard invites that day:

- Adams Moving Services LLC — moving, ZIPs 08045, 08066, 08085, 08096, 08234,
  100-mile radius.
- Jackie Purely Polished — cleaning, ZIP 08021, 25-mile radius.

Both were sent the welcome email (`welcomed_at` set, no `welcome_error`).
They cluster around Camden and Gloucester counties.

**Roach Be Gone was Khalil's test account, not a real company** (its email is
his Gmail). Rejected 2026-10-24 so real pest requests stop being reported to
homeowners as "sent to 1 company". Do not re-approve it.

Roofing, hvac and pest are live on the site with **no** approved provider, so those
requests match nobody and the operator alert is the only thing that surfaces
them. Supply, not traffic, is the bottleneck: recruiting a roofer and an HVAC
company is Khalil's job and nothing technical substitutes for it.

Analytics (since 2026-10-26): GA4 property "Jersey Home Pros" in account
"Destiny Marketing Group", owned by admin@destinymarketinggroup.com (NOT his
personal Gmail). Measurement ID `G-6LE5838F0S` (zero before the S) is in
`NEXT_PUBLIC_GA_ID`; layout.tsx loads gtag directly. "Modeling
contributions" data sharing was turned off. A successful request form
fires `generate_lead` with `trade` and `from_profile` only (no PII) — mark
it as a key event in GA4 so it counts as a conversion.

### Directory and contractor dashboard (shipped 2026-10-24)

Khalil's decisions, in his answers: profiles are public, but contact goes
through the JHP request form (no phone on profiles); stats are profile
views, estimate/website clicks and leads; "ask for more" means more leads or
DMG marketing; contractors sign in with email + password.

- `/pros` directory (trade + ZIP search via `directory_search`, the same
  radius test as `match_lead`) and `/pros/<slug>` profiles. Only providers
  with `status='approved' AND listed AND slug IS NOT NULL` appear. `listed`
  defaults to **false**: applying for leads is not consent to a public page.
  Admin "List in directory" or the contractor's own toggle turns it on.
- Profile clicks go through `/pros/<slug>/request` and `/pros/<slug>/website`
  redirects, which count and forward. Views are counted by a client beacon to
  `/api/pros/view` so crawlers and link previews don't count, one per
  visitor per day. `visitor` is a daily-salted IP hash; no IP is stored.
- A request started from a profile sets `leads.requested_roofer_id`.
  **Attribution only — matching is unchanged.** If the chosen company doesn't
  cover the ZIP, the homeowner is told so in the confirmation.
- `nj_zips.city` and `county` are empty for every row, so profiles show ZIPs;
  unclaimed listings carry their own `roofers.city`.
- `/account` contractor dashboard. Accounts are set up from a one-time link
  (`/account/setup?token=`) that WE email through Resend; only the token's
  SHA-256 is stored, 72-hour expiry. This deliberately avoids Supabase's
  mailer (rate-limited, and the Site URL still points at the retired domain).
  `roofers.auth_user_id` links the login. Admin "Invite to dashboard" sends it.
- "Ask for more" writes `service_requests` and alerts the operator; it shows
  in the admin "Pro requests" tab.
- `/api/admin` no longer selects `*` from roofers, so the token hash never
  reaches the browser. Keep it that way.

### Unclaimed listings, claims, paid access (shipped 2026-10-24)

Khalil's model: pre-list real companies (roofing and HVAC first) from public
records, show a state registration check they can't get elsewhere, and give
them no leads from JHP traffic until they claim AND pay.

- `roofers.status = 'unclaimed'` + `source = 'public_records'`. The page
  says it isn't a member; requests from it go to participating companies
  covering the ZIP, **never to the listed company**, and the form and the
  confirmation both say so. Every unclaimed page offers removal by email.
- Registration badge renders only when `license_checked_at` is set, always
  with the date and a link to newjersey.mylicense.com. **The sandbox cannot
  reach that site and WebFetch can't drive its search form** — checks run in
  Khalil's browser (built-in browser pane) when his computer is online. Never
  set `license_checked_at` without an actual lookup.
- `leads_enabled` gates `match_lead`. Claimed companies start false; admin
  "Start requests (paid)" flips it and sends the welcome/contact-rules email.
  No card billing exists yet — payment is handled by Khalil outside the site.
  Adams and Jackie were left at true (pre-existing access).
- `receivesRequests(p)` = approved AND leads_enabled. Use it, not `status`,
  anywhere the site says whether a request reaches a company.
- `area_demand(roofer_id, days)` = real non-spam leads in the trade within
  the company's radius. The only number a claim pitch may quote.
- Claims (`claims` table) are verified by the operator by calling the number
  on the company's own website/registration before approval.
- **First batch pre-listed 2026-10-26:** 12 roofing + 12 HVAC companies in
  Camden/Gloucester/Burlington, taken straight from the state HIC registry
  (wildcard name search `%ROOF%`, `%HEATING%`, `%AIR COND%`, `%HVAC%` by
  town, Active only; waterproofing and franchise DBAs skipped). Lookups ran
  in Khalil's built-in browser via same-origin fetch POSTs to
  `/verification/Search.aspx?facility=Y` (ASP.NET form; include
  `sch_button`). `services` is just the trade name — nothing else is known.
  Second batch same day: 10 landscaping, 8 hardscaping, 5 windows, 2 pest
  (49 unclaimed total). Moving and cleaning had no HIC registrants; pest is
  really licensed by NJDEP and movers by DCA (phone-only check), and neither
  has a public online lookup — so those trades can't carry a badge from here.
- **Preview deployments have no service-role key**, so every DB-backed page
  404s or shows empty there. Verify DB pages on production.

### Homepage "home scan" (2026-10-26)

`app/HomeMap.tsx`: an AI-generated house photo (`public/home-hud.webp/.jpg`,
generated by Khalil, tiny fake brand marks on the AC unit blurred out) with
a gold HUD layer — one-time scan sweep, brackets on 7 areas, each an SVG
link to that trade's form. Bracket coordinates are in the 2048x1360 crop of
the original. Tags NAME areas and must never claim a detection ("damage
found" etc.) — the page has no way to know. Phones hide the tags and show
numbered buttons under the photo.

Two scenes (since 2026-10-26): tapping the front door ("Go inside") zooms
toward the door and swaps to `public/home-inside.*` (Khalil's AI interior,
cropped 2048x1360 from y=280) with its own zones; "← Outside" goes back.
The left exterior window is Windows & Doors, not Cleaning; cleaning lives
inside on the kitchen. HomeMap is a client component for the scene state.
Tapping any area (or a phone legend button) opens the availability panel:
ZIP → ~1s loading bar → "N <companies> available in <ZIP>" from
`/api/availability` → `available_providers()` (same test as `match_lead`, so
unclaimed listings never count). Zero is said plainly and the request still
goes in; the ZIP carries to the form via `?zip=`. This is THE hook for reels
and ads (Khalil, Oct 26): ads may only quote counts this function returns.
Khalil asked for an "Iron Man / Jarvis"
feel: keep the style, never use Marvel names or marks.

### Problem search (2026-10-27)

Khalil wanted a search bar where people type the problem and see contractors.
Homepage hero form and `/pros?q=` map the words to a trade with a fixed
keyword list (`lib/problems.ts`, add words freely) — deliberately not AI, so
it can't invent a diagnosis. The results page says what it matched ("Showing
Roofing for …"), offers every other trade as one-tap chips, lists members
first, and with a ZIP shows the same live `available_providers` count as
Home Scan plus a "Send one request" button to the trade form.

### Homeowner accounts — the Home Board (2026-10-26)

Khalil's idea: homeowners get a board for to-dos and what JHP already helped
with; he also wants it to "tighten leads". Decisions: sign-in by emailed
one-time link (no password), reminder emails opt-in only, house-with-pins look.

- `/home`: sign-in (email → `/api/home/login`, 30-min link via Resend) or the
  board. `/home/verify?t=` spends the token only on a button POST
  (`/api/home/verify`) because mail scanners open links first. Session =
  random cookie `jhp_home` (HttpOnly, 60 days); only SHA-256 hashes of link and
  session tokens are stored (`homeowner_login_tokens`, `homeowner_sessions`).
- Board data `/api/home` (GET + POST actions), every write scoped to the
  signed-in homeowner. `home_todos.source` = custom | seasonal | request;
  status open | hired | done, set by the HOMEOWNER — the site never claims to
  know whether a job was hired or finished. Seasonal suggestions: `lib/seasonal.ts`.
- Sign-in links past requests with the same email (`linkPastRequests`). A
  lead sent while signed in with the same address sets `leads.homeowner_id`,
  `email_verified = true`, and the contractor email gets "✓ Email verified".
  That is the only "tighter lead" claim, and it is exactly what was checked.
- Reminders: `/api/cron/home-reminders` daily 14:00 UTC (vercel.json), open
  to-dos due within 3 days, once per to-do, only when `homeowners.reminders`;
  unsubscribe `/api/home/unsubscribe?t=<unsub_token>` + POSTAL_ADDRESS.
- After a successful request the form links to the board and prefills the
  email via sessionStorage (never in a URL). Privacy notice covers boards.

### Operator alert — how to check it

The alert had never run in production until 2026-10-17: every lead row had
both `operator_notified_at` and `operator_notify_error` null, because all of
them predated the alert code. Three faults were fixed then (commit 2a49706,
367b5b7): recipients batched into one Resend request, `LEAD_ALERT_EMAILS`
unset so alerts fell back to a list containing the inboxless `leads@`, and
nothing anywhere surfacing a failure.

**The path is confirmed working as of 2026-10-17.** Two self-tests were sent
to `admin@destinymarketinggroup.com` (06:34 UTC, resend id
`01a14891-eb9c-7cba-bf99-d9d7466cd223`) and Khalil confirmed both arrived in
the inbox. That is a human observation of delivery, which is the only kind
available until the webhook is wired up — do not weaken it back to an
assumption, and do not re-test it without a reason.

- `GET /api/health/alerts?token=$HEALTH_CHECK_TOKEN` sends a real alert down
  the production path and reports what happened. `&send=0` inspects config
  and backlog without sending. `&id=<resend id>` looks up one message.
- `/admin` shows a red banner whenever a live lead has no confirmed alert.
  **This is the warning that does not travel by email**, so it still works
  when email is the thing that broke. Keep it that way.
- Delivery events arrive at `/api/webhooks/resend` (Svix-signed, needs
  `RESEND_WEBHOOK_SECRET`) and land in `email_events`. A bounce is written
  back onto the row as `operator_notify_error`, which lights the banner.

Known outstanding: the Resend webhook endpoint and `RESEND_WEBHOOK_SECRET`
still need adding in the Resend dashboard. Delivery is confirmed by hand
today; the webhook is what makes it stay confirmed without anyone
checking — in particular it is what would catch the inbox going bad later.
`leads@` forwarding not set up (and is
not needed for alerts any more); Supabase Site URL still points at the
retired domain; three superseded Vercel projects not deleted; an "emailed ✓"
marker for the admin dashboard is deferred until there is real lead volume
(the API already returns `welcomed`); no GA4 property yet.

### Estimator + installable app (2026-10-27)

Khalil's model (his words, Oct 27): JHP or Khalil acts as the estimator for
partner contractors and is "in the deal". Two lanes: **A referral** (the
contractor signs the homeowner and pays JHP a % of the signed price, per a
written partner agreement) and **B JHP job** (JHP signs the homeowner and
subs the work, so JHP IS the contractor: HIC registration, $500k liability
insurance and NJ written-contract rules apply). Advice given: estimates only
on big-ticket jobs; one contractor per scoped job; never negotiate insurance
claims (public adjuster licence); no "vetted" claim: say what was checked.
He has NOT yet decided free vs paid estimates, nor the fee %.

- `/estimator` (admin accounts, same sign-in as /admin; installs as its own
  app "JHP Estimator" via `public/estimator.webmanifest`, gold icon). Jobs
  list with money summary, scope sheet (homeowner, trade, problem, measured
  lines × price book, adjustable range, photos, notes), homeowner's OK,
  send to ONE contractor, outcome (signed price, fee % or sub price, paid).
- Tables `price_book` (every price carries a `source`), `estimates`,
  `estimate_photos`; PRIVATE bucket `estimate-photos` (signed URLs only:
  1h in the app, 14 days in the contractor email). `provider_distances(zip,
  trade)` feeds the contractor picker.
- Sending is refused without `share_consent_at` (homeowner agreed to share
  with one contractor) and respects `contact_method` (EMAIL ONLY block, same
  pattern as leads). Estimate lines are copied at the time, so later price
  book edits never rewrite a given estimate. Local pricing = his price book +
  what signed jobs actually sold for (shown per trade). Never seed invented
  prices.
- PWA: `public/manifest.webmanifest`, icons, `public/sw.js` (no caching of
  pages or API, only an offline page), "Get the app" in the footer (real
  prompt on Android, Share → Add to Home Screen steps on iPhone). App Store /
  Play listing is a later step (Apple $99/yr, Google $25, in his name).

### Road Pros + free site visits (2026-10-27)

Khalil's decisions: estimates are FREE for homeowners (big-ticket trades
only); field reps are "JHP Road Pros", paid commission after the job; reps
should sell while the app handles the trade knowledge. Advice given: driver
collects, price comes from the price book (reps can't change it); ground
level only, roofs measured by satellite; every Road Pro background-checked
via a screening company (FCRA disclosure + consent); 1099 vs employee and
NJ minimum wage on commission → attorney; pay commission as a cut of JHP's
earnings, ideally part on deposit; 3-day cancellation notice on any JHP
contract signed at the home.

- `estimator_settings` (single row): `visits_on` (default FALSE: Khalil turns
  it on), `base_zip` 08034 + `radius_miles` 25, `visit_trades`, default
  `rep_commission_pct`. `visit_offered(zip, trade)` = on AND trade listed AND
  `visit_area(zip)` AND ≥1 active Road Pro with `bg_status='clear'`. The scan
  panel offer, `/api/availability` `visit` flag and `/api/visit` booking all
  go through it, so the site never takes a booking nobody can drive to.
- `road_pros` (bg_status pending|clear|not_clear gates assignment; invite via
  `/estimator/setup?token=`, same hashed one-time-token pattern as contractors;
  admin emails can't become reps). `lib/estimator-auth.ts requireEstimator`
  returns admin or rep. Reps: only `rep_id = them`, price-book lines at book
  prices (server re-prices), no range override, no send/outcome/fees; they see
  `rep_commission` (computed server-side).
- Bookings: `estimates.source='booking'`, `status='requested'`, consent text
  stored verbatim (`lib/consent.ts visitConsentText`, VISIT_CONSENT_VERSION).
  Operator alerted by email; assign emails the rep.
- `lib/visits.ts`: per-trade guided steps (ask/photo/measure/do) saved to
  `estimates.checklist`, plus TALK (opener, why JHP, close, never-say, 3-day
  rule). "I need help" and "Visit done" email `alertEmails()`.
- Commission: `rep_commission_pct` copied at assignment; `repCommission()` =
  % of `jhpEarnings()`; "due" once `fee_paid_at` is set; `rep_paid_at`.
- Ad line "Every Road Pro is background-checked" is only true while every
  active rep who does visits is `clear` — the assign gate enforces it.

### Hands-off automations (2026-10-28)

Khalil wants to spend his time recruiting Road Pros and calling contractors.

- **One daily cron, `/api/cron/daily` at 11:30 UTC** (replaced the
  home-reminders entry in BOTH vercel.json files to stay within cron limits;
  it still runs home reminders first). Then `lib/ops.ts`:
  `runChasers` — referral jobs (`lane A`, `sent`) get "did it sign? reply
  SIGNED/NOT YET/LOST" on day 3 and day 7 (`chase_count`, max 2); signed
  referral jobs with `fee_paid_at` null get a fee notice when signed then
  weekly (`fee_notice_count`, max 4). `sendBriefing` — one email to
  `alertEmails()`: NEEDS YOU (help, unassigned bookings, visits to price,
  silent contractors, unpaid after max notices, Road Pro commission to pay,
  unalerted leads), last 24h, DONE FOR YOU, CALL LIST (new applicants, new
  claims, pending contractor applications, 5 unclaimed roofing/hvac/
  hardscaping/windows rotated by `roofers.call_suggested_at` — unclaimed rows
  have no phone, he finds it on their site/registration).
- `sendEmail(to, subject, text, replyTo?)`: the From (leads@) has no inbox,
  so anything asking for a reply sets replyTo = `alertEmails()[0]`.
- Auto-assign: `estimator_settings.auto_assign` (default on),
  `max_assign_miles` 40; `nearest_rep(zip)` = active + clear + `home_zip`
  within range, fewest open visits then closest. `lib/assign.ts assignRep()`
  is the only assign path (gate + commission copy + rep email). Booking
  emails the homeowner a confirmation naming the Road Pro's first name.
- `/road-pros` recruiting page (footer + sitemap) → `/api/road-pros` →
  `road_pro_applications`; applicant gets next steps (call → screening
  company disclosure/consent → agreement + app invite), Khalil alerted;
  Estimator → Road Pros shows applicants with Add (creates rep, bg pending)
  / Decline (no email). Page promises no earnings figures.
- Not automated (his): calls, agreements, buying background checks, town
  solicitor permits, invoicing/payment (no Stripe), SMS (no provider).
