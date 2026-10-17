# Destiny Marketing Group — Real Estate Intelligence Platform

An independent real estate discovery and brokerage marketing platform. It is a
standalone application with its own repository, database, authentication,
dashboard and credentials. **It shares nothing with Jersey Home Pros (JHP).**
JHP is reached, if at all, only through an authenticated API as a separate
system.

---

## What exists today

| Area | State |
| --- | --- |
| Database schema (28 tables, RLS on every one) | **Applied and verified** on Supabase project `destiny-realty-intel` |
| Publication gate (no profile publishes without recorded admin approval) | **Applied and tested in the database** |
| Consent gate (no service request without granted consent) | **Applied and tested in the database** |
| Next.js application (public site, admin dashboard, approval workflow, claims, consent form) | **Written**; see *Verification status* below |
| Automated agent research | **Not active.** No source has been authorised yet; runs fail visibly instead of inventing data |
| Email delivery | **Not configured.** Notifications queue durably and stay visible in the dashboard |
| Jersey Home Pros transmission | **Not configured and not verified.** Consented requests are held in a queue, never posted to a guessed endpoint |
| ChatGPT connector | Not started (Phase 7) |

### Verification status

Distinguish carefully:

- **Verified against the real database:** the schema, all RLS policies, the
  publication gate and the consent gate. Five negative tests were run directly
  against Postgres and all passed (see *Database gate tests*).
- **Written but not yet built or deployed:** the Next.js application. The build
  toolchain could not run in the environment where this code was written
  (the npm registry is blocked there), so `next build` has not executed and the
  application has not been served. Nothing in this README should be read as a
  claim that a page has been loaded in a browser.

---

## Architecture

- **Next.js 15 (App Router) + TypeScript**, no CSS framework dependency.
- **Supabase Postgres + Auth**, project ref `xicywfiquzqvlulwirln`
  (`destiny-realty-intel`, us-east-1). Entirely separate from JHP and from the
  `roofrank-nj` / `lead-intel-nj` projects.
- **Authorization is layered three times over:**
  1. Row Level Security on all 28 tables.
  2. A server-side role check (`requireStaff` / `requireAdmin`) on every
     internal page and server action.
  3. Database triggers that refuse an approval or publication that did not come
     from an administrator or that skipped the approved state.
- The service-role key is used **only** for work with no user session: public
  form submissions, audit writes, notification delivery and score computation.
  A signed-in user's actions always run through their own session so their
  permissions apply.

## Roles

| Role | Can do |
| --- | --- |
| `owner`, `admin` | Approve, reject, publish, verify claims, change roles, see revenue |
| `employee` | Research, create drafts, read the queue — **cannot** approve or publish |
| `readonly` | No internal access |

New sign-ups default to `readonly`. Elevated roles come only from the
`role_bootstrap` allowlist on first sign-up, or from an administrator.

---

## Approval workflow (mandatory)

1. Research or the manual draft form creates a profile with `status = 'draft'`.
2. Per-field evidence is recorded: value, source URL, retrieval time, and
   whether the fact is verified, self-reported, third-party or AI-generated.
3. The profile moves to `pending_review` and an `approval_request` is opened.
4. A notification is queued to `admin@destinymarketinggroup.com`.
5. The administrator opens the review page — **the email link is not
   authorization**; the page requires an authenticated admin session.
6. They approve and publish, approve only, request corrections, flag for extra
   verification, or reject. A note is mandatory for rejection and corrections.
7. Every decision is written to `audit_log`. An approval whose audit write
   fails is reported as failed rather than silently completing.

Nothing publishes on a timer, on an email open, or on a confidence score.

### Database gate tests

Run against the live database; all five passed:

```
PASS draft-profile-can-be-created
PASS blocked-create-as-published
PASS blocked-draft-to-published
PASS blocked-approval-without-approver
PASS blocked-service-request-without-consent
```

---

## Rankings

Agents are ordered by **how much of their professional record has been
verified**, never by sales performance. The active methodology (`v1.0`) is
published at `/methodology` and weights six evidence-backed criteria.

- No sales volume, transaction count or review score is used anywhere, because
  the platform holds no authorised source for them.
- Pages are labelled as a directory of local professionals, not a ranking of
  top performers.
- Paid placement lives in a separate `sponsored_placement` table, is never an
  input to the score, and is rendered with a visible "Sponsored" label.

---

## Jersey Home Pros

See `docs/jhp-integration.md`. In short: **no JHP endpoint, schema or
authentication scheme has been verified.** The integration refuses to transmit
until `JHP_INTEGRATION_ENABLED=true` with real credentials. Consented requests
are recorded, held and visible to administrators. The payload in `src/lib/jhp.ts`
is a proposal that must be confirmed against JHP's real contract before use.

---

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

### Required environment variables

| Variable | Where to get it | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project settings → API | App will not start |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page | App will not start |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, **secret** | Public forms, audit writes and notifications are disabled; pages still render |
| `NEXT_PUBLIC_SITE_URL` | Your deployment URL | Notification links point at localhost |
| `ADMIN_NOTIFICATION_EMAIL` | Defaults to `admin@destinymarketinggroup.com` | — |
| `JOB_SECRET` | `openssl rand -hex 32` | Scheduled retry route returns 503 |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Email provider | Notifications queue and are retained, not lost |
| `JHP_API_BASE_URL`, `JHP_API_KEY`, `JHP_INTEGRATION_ENABLED` | JHP's administrator | Requests are held in the queue |

The service-role key must never appear in client code. It is only imported by
modules marked `server-only`.

### First administrator

Create the user in Supabase → Authentication → Users with an address on the
`role_bootstrap` allowlist (`admin@destinymarketinggroup.com` or
`destinyaisupport@gmail.com`). The role is applied automatically by a trigger
on first sign-up. Then sign in at `/login`.

### Scheduled maintenance

`POST /api/jobs/drain` with `Authorization: Bearer $JOB_SECRET` retries queued
notifications and failed JHP deliveries. Schedule it hourly.

---

## Migrations

`supabase/migrations/` holds the applied schema in order. They have all been
applied to `destiny-realty-intel`.

```
0001_foundation_roles_audit.sql          roles, users, audit log
0002_agents_brokerages_evidence.sql      agents, brokerages, evidence, publication gate
0003_approval_claims_rankings.sql        approval queue, outbox, claims, rankings, sponsorship
0004_crm_proposals_revenue.sql           brokerage CRM, proposals, contracts, revenue
0005_consent_service_requests_analytics.sql  consent, service requests, events
0006_function_hardening.sql              advisory fixes
0007_public_evidence_view.sql            citation-only public view
```

---

## Known open items

1. **No GitHub remote.** The repository could not be created from the
   environment this was built in. Create an empty private repo and push.
2. **`SUPABASE_SERVICE_ROLE_KEY` not yet supplied**, so public forms are
   inactive.
3. **The application has not been built or deployed.** See *Verification
   status*.
4. **No authorised research source.** Until licence-register and brokerage-site
   terms are reviewed and recorded, use the manual draft form.
5. **Compliance questions outstanding** — see `docs/jhp-integration.md` and the
   source registry. These are not legal advice, and several need a lawyer's
   answer before the affected workflow is switched on in production.
6. **`citext` is installed in the `public` schema** (Supabase advisory). Low
   risk, left in place because columns already depend on it; move it only with
   a planned migration.
