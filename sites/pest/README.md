# PestRank NJ — vertical lead-routing site

Operated by Destiny Marketing Group LLC. Same engine as the other RoofRank-family
sites; **everything trade-specific lives in `lib/site.ts`.**

## Making another vertical

1. Copy this directory.
2. Edit `lib/site.ts` — brand, domain, copy, services, provider services.
3. Create a new Supabase project and run `supabase/schema.sql`.
4. Create a new Vercel project and set the environment variables below.
5. Point the new domain at Vercel and verify the sending domain in Resend.

No other file needs touching.

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key, safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses all RLS — never commit it |
| `ADMIN_EMAILS` | Comma-separated allowlist for /admin |
| `RESEND_API_KEY` | **Secret.** Sending email |
| `LEAD_FROM_EMAIL` | Must be on the Resend-verified domain |
| `CRON_SECRET` | **Secret.** Authenticates the daily follow-up job |
| `POSTAL_ADDRESS` | CAN-SPAM footer. Required before follow-ups send |

An environment change does nothing until the next deploy.

## After deploying

- Supabase → Authentication → URL Configuration: Site URL `https://pestranknj.com`, and add `https://pestranknj.com/**` to Redirect URLs. Without this the admin magic link points at localhost.
- Run `supabase/schema.sql`, then load the NJ ZIP table (see the Operations Record).
- Revoke execute on `match_lead` from `anon` and `authenticated`.

## Compliance notes baked into this code

- Phone/text consent is a **separate, optional, unchecked** box. Never make it required — TCPA forbids conditioning service on it.
- Each lead stores the verbatim consent wording, version, IP, user agent and timestamp. Keep 5 years.
- Notification emails tell the contractor whether they may call, and flag email-only leads **DO NOT CALL OR TEXT**.
- Homeowner follow-ups are marketing email: they carry one-click unsubscribe and the postal address.
- Make no vetting, ratings or guaranteed-volume claims in copy or ads.
