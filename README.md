# MediData

A data entry app with analytics for medical records — patients, encounters (visits/vitals), and medications — built with Angular and Supabase. Works as a responsive web app and installable PWA.

## Stack

- **Angular 21** (standalone components, signals) + **Tailwind CSS 4 / DaisyUI 5**, with **Angular CDK** for dialogs and the mobile drawer
- **TanStack Query** for server-state caching and invalidation; **ng2-charts / Chart.js** for the dashboard
- **Angular Service Worker** for the installable PWA shell
- **Supabase** (Postgres + Auth) as the backend. Business rules live in the database: row-level security, triggers, and SQL functions

## Setup

1. Create a project at [supabase.com](https://supabase.com) (or run one locally, see below).
2. Apply the migrations in [`supabase/migrations/`](supabase/migrations) in filename order: `npx supabase link --project-ref <ref> && npx supabase db push`, or paste them into the SQL editor one by one. They are written to be applied on top of a database created with the old `schema.sql`, and migrate its data (see "Upgrading" below).
3. To enable guest/demo mode, go to Authentication > Sign In / Providers and turn on **Allow anonymous sign-ins**. Skip this and "Try the demo" will show an error; everything else still works.
4. (Optional but recommended) Run [`supabase/expire-guest-data.sql`](supabase/expire-guest-data.sql) to schedule hourly cleanup of guest workspaces older than 24h via `pg_cron` (hosted projects only).
5. Copy the **Project URL** and **anon public key** (Project Settings > API) into `src/environments/environment.ts` and `environment.prod.ts`, starting from [`environment.template.ts`](src/environments/environment.template.ts). Both real files are gitignored.
6. `npm install && npm start`, open `http://localhost:4200`, sign up, sign in.

### Local development with the Supabase CLI

`npx supabase start` runs Postgres/Auth/Studio in Docker. `supabase db reset` applies everything in `supabase/migrations/` automatically. `supabase start` prints a local API URL and anon key for your `environment.ts`.

### Upgrading from the pre-migration schema

Migration 1 is the old `schema.sql` unchanged, so an existing project can run all seven in order. What happens to existing data:

- every user who created rows gets a personal organization (they become its admin) and their rows move into it; rows with no owner (invisible before) go to an "Unassigned (legacy)" organization with no members, so nothing is lost
- vitals become `observations`, the free-text diagnosis becomes an `encounter_diagnoses` row (matched to ICD-10 where it recognizably is one), comma-separated allergies become `allergies` rows, and medication names are linked to RxNorm where they match exactly
- **migration 5 then drops the old columns** (`encounters.diagnosis`, the vitals columns, `patients.allergies`). Out-of-range legacy vitals (e.g. a 500 mmHg typo) are skipped rather than migrated. Take a backup before running migration 5.

## Architecture

```
supabase/migrations/   schema, RLS, audit, RPCs (applied in order)
supabase/tests/        SQL tests: run.sh applies migrations to a scratch Postgres and asserts
src/app/data/          ClinicalApi (the one typed data layer), OrgService (org + role), OfflineQueue
src/app/forms/         shared validators (vital ranges, date logic, blood pressure pair)
src/app/components/    pages: dashboard, patient list, patient chart, settings
e2e/                   Playwright smoke tests against a mocked Supabase
```

### Data model

- **Organizations and roles.** Every row belongs to an organization. A user is a member with a role: `admin` (everything, incl. members and the audit log), `clinician` (read, create, update, archive) or `viewer` (read only). New users, guests included, get a personal workspace automatically. RLS enforces roles; the UI only hides controls to match.
- **Structured clinical data.** Vitals are `observations` keyed by LOINC code with plausible-range checks in the database; diagnoses are ICD-10 coded (or free text); medications link to RxNorm; allergies are rows with a category, severity and reaction. The ICD-10 and RxNorm tables ship with a small starter set: bulk-import the full vocabularies for real use.
- **Archive, don't delete.** The app archives (soft delete, `deleted_at`). Permanent deletion is an admin-only database operation, not offered in the UI. There is no restore screen yet: restoring is `update <table> set deleted_at = null` by a clinician or admin.
- **Audit log.** Every insert/update/archive/restore/delete on clinical tables is recorded with the actor and before/after snapshots. It is append-only (even `UPDATE`/`DELETE` by a superuser is blocked, apart from the service-role `purge_audit_log()` retention function) and readable only by admins. Guest workspaces are not audited.
- **Server-side logic.** `search_patients` (keyset-paged name search), `dashboard_stats`, the hypertension and overdue-follow-up cohorts, and `record_encounter` (atomic and idempotent) are SQL functions that run with the caller's permissions, so RLS applies to them.

### Types

`src/app/data/database.types.ts` is written by hand in the shape of `supabase gen types typescript`. Once you have a database, run `npm run gen:types` (needs `supabase start`) and fix whatever the compiler flags; the app-specific narrowing (e.g. `Sex`) lives in `src/app/models/`.

## Offline

Encounters, medications and allergies can be recorded without a connection. They are saved to IndexedDB with a client-generated id and sent when the browser is back online (and on a 30s retry); the server treats a replayed id as already done, so a flaky connection can't create duplicates. The header shows a sync badge and a panel listing anything waiting or rejected.

What this deliberately does not do:

- **Edits and archives need a connection.** There is no silent last-write-wins on clinical records.
- **Reads are cached in memory only**, so charts you already opened stay visible while offline, but a reload while offline shows nothing.
- **Queued writes are plaintext on the device** (IndexedDB), scoped to the user who made them, and are *not* cleared on sign-out, because the 10-minute idle timeout must not destroy unsynced work. On a shared workstation, treat unsynced data as sitting on that machine until the user signs in again. In-progress encounter drafts use `sessionStorage` (gone when the tab closes).

## Tests

```bash
npm run test:sql                                   # migrations + RLS/audit/RPC tests (needs a Postgres: PGHOST/PGUSER)
npm test -- --watch=false --browsers=ChromeHeadlessCI   # unit + component tests
npx playwright test                                # end-to-end smoke tests (mocked Supabase)
```

CI (`.github/workflows/ci.yml`) runs all three. The e2e tests need `environment.ts` to point at `http://localhost:54321`; they intercept every request to it.

## Before using this with real patient data

The app now has the building blocks (per-organization isolation, roles, an immutable audit trail, idle sign-out) but is **not** compliance-ready by itself. You still need to work through, at minimum: a signed BAA/DPA with Supabase and your hosting provider, encryption and backup policy, an audit-log retention policy (`purge_audit_log`), enforced MFA and password policy, an access-review process, breach procedures, and a legal review for HIPAA/GDPR in your jurisdiction. Email-based staff invitations (only existing users can be added today) and a restore-from-archive screen are not built yet.

## Notes

- Requires Node.js 20.19+, 22.12+, or 24+ (Angular CLI 21). If your system Node is older, this repo ships a project-scoped Node runtime — see [`.tools/README.md`](.tools/README.md) and use `./dev.ps1` instead of `npm`/`ng` directly (e.g. `./dev.ps1` for `npm start`, `./dev.ps1 run build`).
