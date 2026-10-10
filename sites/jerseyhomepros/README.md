# Jersey Home Pros

One New Jersey homeowner-to-contractor referral site covering several trades.
Operated by Destiny Marketing Group LLC.

## How the trades work

`lib/trades.ts` is the only place a trade is defined: its slug, nouns, hero copy,
service list and provider service list. Everything else reads from it.

- `/` lists the trades and routes the homeowner to one.
- `/[trade]` is a full landing page per trade with its own form.
- Every lead and provider row stores a `trade`, and `match_lead` filters on it,
  so a request can never reach a company in a different trade.

Adding a trade:
1. Add an entry to `TRADES` in `lib/trades.ts`.
2. Add the same slug to the `leads_trade_check` and `roofers_trade_check`
   constraints in the database.

That is the whole change. No new project, database or domain.

## Notes

- The providers table is still named `roofers` for historical reasons. A rename
  was prepared but the hosted SQL console blocks destructive statements; the
  application layer calls them providers throughout.
- RLS is enabled on every table with zero policies. Nothing is reachable with the
  anon key; all access goes through server routes holding the service-role key.
- `match_lead` is SECURITY DEFINER and has EXECUTE revoked from anon/authenticated,
  so it cannot be invoked over the public REST API.
- Consent wording lives in `lib/consent.ts` and is stored on each lead alongside
  IP, user agent and version, so what a consumer saw can be reproduced later.
  Bump `CONSENT_VERSION` whenever the wording changes.
