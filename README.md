# MediData

A data entry app with analytics for medical records — patients, encounters (visits/vitals), and medications — built with Angular and Supabase. Works as a responsive web app and installable PWA.

## Stack

- **Angular 21** (standalone components, signals) + **Angular Material** for UI
- **Angular Service Worker** for PWA/offline shell support
- **Supabase** (Postgres + Auth) as the backend
- **ng2-charts / Chart.js** for the analytics dashboard

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) to create the `patients`, `encounters`, and `medications` tables with row-level security enabled for authenticated users.
3. In Supabase's Project Settings > API, copy the **Project URL** and **anon public key**.
4. Copy [`src/environments/environment.template.ts`](src/environments/environment.template.ts) to `environment.ts` and to `environment.prod.ts` (set `production: true` in the latter), then fill in your values. Both real files are gitignored since they hold your project's credentials.
5. Install dependencies and run:

   ```bash
   npm install
   npm start
   ```

6. Open `http://localhost:4200`, sign up for an account (Supabase Auth), then sign in.

## Local development with the Supabase CLI (optional)

Instead of a hosted Supabase project, you can run Postgres/Auth/Storage/Studio locally via Docker, using [`supabase/config.toml`](supabase/config.toml):

```bash
npx supabase start
```

`supabase/schema.sql` isn't applied automatically by `start` — either paste it into the local Studio SQL editor (default `http://127.0.0.1:54323`) or move it under `supabase/migrations/` and run `npx supabase db reset`. `supabase start` prints a local API URL (`http://127.0.0.1:54321`) and anon key — put those into `src/environments/environment.ts` instead of a hosted project's values. Stop it with `npx supabase stop`.

## Data model

- **Patients** — demographics, contact info, blood type, allergies.
- **Encounters** — one per visit: reason, diagnosis, notes, and vitals (blood pressure, heart rate, temperature, SpO2, weight, height).
- **Medications** — name, dosage, frequency, start/end dates, active status.

## Dashboard

The dashboard aggregates all patients/encounters into: total patients, encounters this month, average patient age, encounters over the last 6 months, patient sex distribution, and top diagnoses.

## Notes

- Auth policy is currently "any signed-in user can read/write everything" (a shared clinic workspace). If you need per-clinician data isolation, tighten the RLS policies in `supabase/schema.sql` to filter on `created_by = auth.uid()`.
- Requires Node.js 20.19+, 22.12+, or 24+ (Angular CLI 21). If your system Node is older, this repo ships a project-scoped Node runtime — see [`.tools/README.md`](.tools/README.md) and use `./dev.ps1` instead of `npm`/`ng` directly (e.g. `./dev.ps1` for `npm start`, `./dev.ps1 run build`).
