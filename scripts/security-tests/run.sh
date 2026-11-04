#!/usr/bin/env bash
# Builds a throwaway local Postgres database shaped like Supabase, applies
# every migration, then tries to break tenant isolation (tests.sql).
#
# Needs a local PostgreSQL 15+ server you can reach as a superuser. Defaults
# match a stock install; override with PGHOST / PGPORT / PGUSER.
#   bash scripts/security-tests/run.sh
#
# This never touches Supabase.
set -euo pipefail
cd "$(dirname "$0")/../.."

export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
DB=qv_security_test
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
# Roles are cluster-wide; create them only once.
if ! "${PSQL[@]}" -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname = 'authenticator'" | grep -q 1; then
  "${PSQL[@]}" -d postgres -c "CREATE ROLE anon NOLOGIN" -c "CREATE ROLE authenticated NOLOGIN" \
    -c "CREATE ROLE service_role NOLOGIN BYPASSRLS" -c "CREATE ROLE authenticator LOGIN NOINHERIT" \
    -c "GRANT anon, authenticated, service_role TO authenticator" >/dev/null
fi
# The stub creates the roles too; skip those lines when they already exist.
grep -v -E '^(CREATE ROLE|GRANT anon, authenticated, service_role TO authenticator)' \
  scripts/security-tests/supabase-stub.sql | "${PSQL[@]}" -d $DB >/dev/null

echo "Applying migrations..."
"${PSQL[@]}" -d $DB -f src/utils/migration.sql >/dev/null 2>&1
for f in scripts/migrations/00*.sql scripts/migrations/010_*.sql; do
  "${PSQL[@]}" -d $DB -f "$f" >/dev/null 2>&1
done
"${PSQL[@]}" -d $DB -f scripts/security-tests/seed.sql
for f in scripts/migrations/01[1-9]_*.sql scripts/migrations/0[2-9][0-9]_*.sql; do
  [ -e "$f" ] || continue
  "${PSQL[@]}" -d $DB -f "$f" >/dev/null 2>&1
done
# Applying the latest migration twice must be harmless.
"${PSQL[@]}" -d $DB -f scripts/migrations/011_auth_rls.sql >/dev/null 2>&1

# Link the fixture logins (what the server function does in production).
"${PSQL[@]}" -d $DB -c "UPDATE company_users u SET auth_user_id = a.id FROM auth.users a
  WHERE a.email = u.email AND u.email <> 'legacy@alpha.test'" \
  -c "SELECT public.grant_platform_admin('admin@quantivra.test')" >/dev/null

echo "Running security tests..."
# Connect the way PostgREST does, so session_user is "authenticator".
"${PSQL[@]}" -U authenticator -d $DB -f scripts/security-tests/tests.sql
