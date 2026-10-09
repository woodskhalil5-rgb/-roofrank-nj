# RoofRank NJ — custom-coded website starter

## Stack
- Next.js App Router + TypeScript
- Vercel deployment
- Supabase database for lead intake

## Deploy
1. Upload this project to a new private GitHub repository (or import the repository into Vercel).
2. In Vercel, choose **Add New → Project**, import the repository, and deploy.
3. Create a Supabase project. Run `supabase/schema.sql` in Supabase SQL Editor.
4. In Vercel → Project → Settings → Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase service_role key (server-side only; NEVER prefix this key with NEXT_PUBLIC_)
5. Redeploy after adding environment variables.
6. Connect `RoofRankNJ.com` in Vercel → Project → Settings → Domains and follow its exact DNS instructions at the domain registrar.

## Important current build status
- Homepage and responsive design are implemented.
- Lead form UI and server endpoint are implemented; actual submissions remain disabled until Supabase environment variables and schema are configured.
- Roofer application page is a UI starter; it does not persist applications yet.
- Admin dashboard, approval workflow, lead assignment, and public directory are not implemented in this first starter. Complete and test these before buying ads or publicly promising matching.
- Replace starter privacy/terms text with reviewed business-specific policies before public launch.
- No contractor is labeled verified/licensed/insured without a real verification process.
