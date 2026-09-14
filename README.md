# MediData

A data entry app with analytics for medical records — patients, encounters (visits/vitals), and medications — built with Angular and Supabase. Works as a responsive web app and installable PWA.

## Stack

- **Angular 21** (standalone components, signals) + **Tailwind CSS 4 / DaisyUI 5** for UI, with **Angular CDK** (Overlay, Dialog, A11y, BreakpointObserver) as the unstyled behavior layer for the dialog and mobile drawer
- **Angular Service Worker** for PWA/offline shell support
- **Supabase** (Postgres + Auth) as the backend
- **ng2-charts / Chart.js** for the analytics dashboard

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) to create the `patients`, `encounters`, and `medications` tables with row-level security enabled for authenticated users. This script is safe to re-run after future schema changes, it drops and recreates its own policies.
3. To enable the guest/demo mode (see below), go to Authentication > Sign In / Providers and turn on **Allow anonymous sign-ins**. Skip this and "Try the demo" on the login page will just show an error — everything else still works.
4. (Optional but recommended) Run [`supabase/expire-guest-data.sql`](supabase/expire-guest-data.sql) to schedule hourly cleanup of abandoned guest accounts, see [Session & guest data expiry](#session--guest-data-expiry) below.
5. In Supabase's Project Settings > API, copy the **Project URL** and **anon public key**.
6. Copy [`src/environments/environment.template.ts`](src/environments/environment.template.ts) to `environment.ts` and to `environment.prod.ts` (set `production: true` in the latter), then fill in your values. Both real files are gitignored since they hold your project's credentials.
7. Install dependencies and run:

   ```bash
   npm install
   npm start
   ```

8. Open `http://localhost:4200`, sign up for an account (Supabase Auth), then sign in.

## Local development with the Supabase CLI (optional)

Instead of a hosted Supabase project, you can run Postgres/Auth/Storage/Studio locally via Docker, using [`supabase/config.toml`](supabase/config.toml):

```bash
npx supabase start
```

`supabase/schema.sql` isn't applied automatically by `start` either paste it into the local Studio SQL editor (default `http://127.0.0.1:54323`) or move it under `supabase/migrations/` and run `npx supabase db reset`. `supabase start` prints a local API URL (`http://127.0.0.1:54321`) and anon key — put those into `src/environments/environment.ts` instead of a hosted project's values. Stop it with `npx supabase stop`.

## Session & guest data expiry

- **Idle session timeout**: `IdleTimeoutService` tracks mouse/keyboard/scroll/touch activity for every signed-in session (real or guest) and calls `supabase.auth.signOut()` — a genuine session/token revocation, not just a UI lock screen — after 10 minutes of no activity, redirecting to `/login` with a message explaining why. Change `IDLE_LIMIT_MS` in [`idle-timeout.service.ts`](src/app/services/idle-timeout.service.ts) to adjust.
- **Guest data expiry**: nothing client-side can clean up a guest who closes the tab and never comes back, so [`supabase/expire-guest-data.sql`](supabase/expire-guest-data.sql) schedules an hourly `pg_cron` job (hosted Supabase projects only — not available for local `supabase start`) that deletes anonymous `auth.users` rows older than 24 hours. `created_by` cascades on delete (see `supabase/schema.sql`), so removing the guest's auth user also removes their patients, encounters, and medications in one step. Real accounts are never touched. Re-run that file with a different interval to change the retention window.

## Data model

- **Patients** — demographics, contact info, blood type, allergies.
- **Encounters** — one per visit: reason, diagnosis, notes, and vitals (blood pressure, heart rate, temperature, SpO2, weight, height).
- **Medications** — name, dosage, frequency, start/end dates, active status.

## Dashboard

The dashboard aggregates all patients/encounters into: total patients, encounters this month, average patient age, encounters over the last 6 months, patient sex distribution, and top diagnoses.

## Theming

Light/dark themes are defined as custom DaisyUI themes (`medidata-light` / `medidata-dark`) in [`src/styles.css`](src/styles.css). `ThemeService` toggles the `data-theme` attribute on `<html>` and persists the choice to `localStorage`, defaulting to the OS preference on first visit. To restyle the app, edit the `--color-*` (and `--radius-*`) values in those two `@plugin 'daisyui/theme'` blocks — every component reads from them automatically.

## Notes

- Auth policy: data is isolated per practitioner. Every signed-in user (real or guest) can only see and modify the patients/encounters/medications they themselves created (`created_by = auth.uid()`) — no shared/clinic-wide visibility between practitioners for now, and guests stay separated from everyone else the same way.
- Requires Node.js 20.19+, 22.12+, or 24+ (Angular CLI 21). If your system Node is older, this repo ships a project-scoped Node runtime — see [`.tools/README.md`](.tools/README.md) and use `./dev.ps1` instead of `npm`/`ng` directly (e.g. `./dev.ps1` for `npm start`, `./dev.ps1 run build`).
