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

## Verify, don't assume

Everything shipped here was checked against reality before being called done:
HTML read back from the deployment, emails rendered and eyeballed, SQL run
inside a rolled-back transaction, video frames extracted and inspected, audio
transcribed to confirm it said what the script said. When a check is not
possible — audio cannot be heard from this sandbox — say so plainly rather
than implying it was verified.

## Current state

Live at jerseyhomepros.com. Five trades: roofing, hvac, pest, moving,
cleaning. Ten guide pages. `/join` for contractors, `/admin` for the operator,
`/receptionist` for the unbuilt missed-call product (deliberately unlinked).

Supabase project `fpvvadcyuzcnjuzyhaav`. Vercel project `jersey-home-pros`,
root directory `sites/jerseyhomepros` in a monorepo.

Known outstanding: `leads@` forwarding not set up; Supabase Site URL still
points at the retired domain; three superseded Vercel projects not deleted;
an "emailed ✓" marker for the admin dashboard is deferred until there is a
real pest contractor (the API already returns `welcomed`).
