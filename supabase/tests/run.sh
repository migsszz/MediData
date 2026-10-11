#!/usr/bin/env bash
# Applies every migration to a scratch Postgres database and runs the SQL
# tests against it. Needs a reachable Postgres 15+ with pg_trgm and pgcrypto
# (plain Postgres is fine; the Supabase pieces are mocked in 00_mock_supabase.sql).
#
#   PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
#
# Uses (and recreates) a database called medidata_test.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=medidata_test
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$1"; }

run tests/00_mock_supabase.sql
migrations=(migrations/*.sql)
run "${migrations[0]}"            # baseline
run tests/01_legacy_fixture.sql   # legacy-shaped rows to exercise the backfill
for m in "${migrations[@]:1}"; do run "$m"; done
for t in tests/[1-9]*.sql; do echo "== $t"; run "$t"; done
echo "All SQL tests passed."
