# Jersey Home Pros integration — current state

**Status: not verified, not configured, not transmitting.**

This document exists so nobody mistakes a proposal for a working integration.

## What has been established

- JHP's public website is <https://jerseyhomepros.com/>.
- JHP runs on separate infrastructure. There is a separate Vercel project named
  `jersey-home-pros` under the same account. **It has not been inspected,
  modified or connected to**, and must not be merged with this platform.

## What has NOT been established

Everything that matters for an integration:

- [ ] Whether JHP exposes an API for inbound leads at all
- [ ] The base URL and endpoint path
- [ ] The authentication scheme (bearer token, HMAC signature, mTLS, something else)
- [ ] The request schema and required fields
- [ ] The response schema, including whether a reference ID is returned
- [ ] Idempotency support — whether `Idempotency-Key` or `external_id` is honoured
- [ ] Rate limits
- [ ] Error codes and which are retryable
- [ ] Whether JHP can report lead outcomes back (booked, completed, revenue)
- [ ] Who administers it and who authorises data sharing

**No endpoint has been invented in production code paths.** `src/lib/jhp.ts`
contains a *proposed* payload shape, and the module refuses to send anything
unless `JHP_INTEGRATION_ENABLED=true` with a real base URL and key. Until then
every consented request is recorded, held with status `queued`, logged as an
attempt with the reason, and shown in the dashboard.

## Proposed payload (to be confirmed with JHP, not assumed)

```json
{
  "external_id": "<our idempotency key>",
  "source": "destiny-marketing-group/real-estate-platform",
  "customer": { "name": "...", "email": "...", "phone": "..." },
  "service_address": { "street": "...", "city": "...", "state": "NJ", "postal_code": "07030" },
  "service": { "category": "roofing", "details": "...", "preferred_timing": "..." },
  "consent": { "granted": true, "purpose": "home_service_referral" }
}
```

Sent as `POST {JHP_API_BASE_URL}/leads` with `Authorization: Bearer <key>` and
`Idempotency-Key: <external_id>`, 15-second timeout.

### Data minimisation

Only the fields above are sent. Explicitly **not** sent: agent records,
brokerage CRM data, contacts, other homeowners' data, analytics, or anything
about which agent profile the visitor happened to view.

## Consent

- A request cannot exist in the database without a `consent_record` whose
  `granted` is true and which has not been revoked. A trigger enforces this; it
  has been tested.
- The exact disclosure text shown to the visitor is stored verbatim with each
  consent record, along with its version (`jhp-referral-v1`), IP, user agent and
  the page it was given on.
- Visiting an agent profile never creates a request. The form is a separate,
  opt-in page.

## Failure handling

- Each attempt is written to `service_request_attempt` with the exact payload,
  response status, body and duration.
- Failures retry with exponential backoff (capped at 3 hours) up to
  `max_attempts` (5), then stop with `next_attempt_at` cleared and remain
  visible.
- Duplicates are prevented by a unique `idempotency_key`
  (email + ZIP + category + day). A repeat submission returns the existing
  request instead of creating a second one.
- `POST /api/jobs/drain` retries everything due; administrators can also retry a
  single request from the dashboard.

## Before switching this on

1. Get the real integration contract from JHP's administrator and replace the
   proposed payload with the confirmed one.
2. Confirm who at JHP is authorised to receive this data and on what basis.
3. Test against non-production records end to end, including a deliberate
   failure and a deliberate duplicate.
4. Only then set `JHP_INTEGRATION_ENABLED=true` in production.

## Open compliance questions

These need an answer from a qualified adviser before the affected workflow runs
in production. They are listed, not resolved:

- Whether passing homeowner contact details to JHP for a fee constitutes a
  referral arrangement requiring specific disclosure under New Jersey real
  estate or consumer protection rules.
- Whether the disclosure wording satisfies applicable consent requirements for
  sharing contact details with a third party for marketing or service purposes.
- Retention periods for consent records and service requests, and a documented
  deletion workflow on request.
- Whether any state-specific telemarketing or written-consent requirements apply
  to calls JHP makes as a result of a request submitted here.

A tick-box is not a legal opinion, and nothing in this platform should be
treated as one.
