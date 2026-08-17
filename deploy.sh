#!/usr/bin/env bash
#
# =====================================================================
# deploy.sh -- build and publish the course file portal, ON THE SERVER.
#
# Run this on the server, from the repo root, after the code has landed
# there. It replaces the old routine of building on a laptop and copying
# a dist/ directory up by hand.
#
# It is safe to re-run: every step either checks first or is idempotent.
#
# WHY bash AND NOT POSIX sh
#   `set -o pipefail` is a bash feature. dash exits with "Illegal option
#   -o pipefail" the moment it reads that line, so the shebang has to be
#   bash. Nothing else here needs more than bash 4.
#
# NO SECRETS LIVE IN THIS FILE.
#   The database password, the Google client id and the API hostname are
#   all read at RUN TIME out of the two env files below. Nothing is
#   echoed: the password is passed to mysql through a mode-600 option
#   file that is deleted on exit, never on a command line where `ps`
#   would show it, and the API URL is grepped for without being printed.
#
# WHAT IT NEEDS TO BE RUN AS
#   Whichever user owns the pm2 daemon that runs the API, AND that can
#   write /var/www. pm2 is per-user: running this under sudo when pm2
#   belongs to someone else would reload a different (empty) daemon and
#   report success while the old code kept serving. So this script never
#   invokes sudo itself -- it checks up front that it can do both jobs
#   and stops with a clear message if it cannot.
# =====================================================================

set -euo pipefail

# ---------------------------------------------------------------------
# Paths and names. The repo root is taken from where THIS FILE sits
# rather than hardcoded, so a checkout somewhere else still works; on the
# production box it resolves to /opt/course-file-portal.
# ---------------------------------------------------------------------
REPO_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
SELF="$REPO_ROOT/$(basename -- "$0")"

CLIENT_DIR="$REPO_ROOT/client"
SERVER_DIR="$REPO_ROOT/server"
CLIENT_ENV="$CLIENT_DIR/.env.production"
SERVER_ENV="$SERVER_DIR/.env"
MIGRATIONS_DIR="$SERVER_DIR/db/migrations"
DIST_DIR="$CLIENT_DIR/dist"

WEB_ROOT="/var/www/course-file"
WEB_PREV="/var/www/course-file.prev"
WEB_NEW="/var/www/course-file.new"

PM2_APP="course-file-api"
REQUIRED_BRANCH="main"

# The three variables the production build cannot be made without.
REQUIRED_CLIENT_VARS="VITE_API_URL VITE_GOOGLE_CLIENT_ID VITE_ALLOW_DEMO_LOGIN"

# ---------------------------------------------------------------------
# Migrations to skip, space separated, by exact filename.
#
# EMPTY BY DEFAULT: every file in db/migrations runs, in filename order,
# which is what a deploy of this repo is defined to do. They are all
# guarded (CREATE TABLE IF NOT EXISTS, information_schema-checked ALTERs,
# NOT EXISTS-guarded inserts), so re-running them changes nothing.
#
# READ THIS BEFORE A DEPLOY ONTO AN EMPTY DATABASE.
#   007_seed_sample_data.sql, 009_seed_documents.sql and
#   011_seed_internal_marks.sql are TEST seeds -- the header of
#   006_faculty_and_allocations.sql says they are "skipped in a
#   production install". On a database that already has them (which is
#   the case for the current server) re-running them is a no-op and the
#   default below is correct. On a FRESH production database they would
#   insert sample staff, students and marks. Set this then, e.g.
#
#     SKIP_MIGRATIONS="007_seed_sample_data.sql 009_seed_documents.sql \
#                      011_seed_internal_marks.sql" ./deploy.sh
#
# Override from the environment; never edited into this file.
# ---------------------------------------------------------------------
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-}"

# ---------------------------------------------------------------------
# Output helpers. One heading per step, so the log reads as a checklist.
# ---------------------------------------------------------------------
step() {
  printf '\n=====================================================================\n'
  printf '  %s\n' "$1"
  printf '=====================================================================\n'
}
info() { printf '   %s\n' "$1"; }
ok()   { printf '   OK   %s\n' "$1"; }
warn() { printf '   WARN %s\n' "$1" >&2; }

die() {
  printf '\n---------------------------------------------------------------------\n' >&2
  printf 'DEPLOY ABORTED: %s\n' "$1" >&2
  shift || true
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  printf '---------------------------------------------------------------------\n' >&2
  exit 1
}

# ---------------------------------------------------------------------
# Read one value out of a dotenv-style file.
#
# Deliberately NOT `. file`: sourcing runs the file as shell, so a value
# containing a space, a quote or a $ would either break or execute. This
# takes the line verbatim, strips one matched pair of surrounding quotes
# the way dotenv does, and drops a trailing CR so a file saved on Windows
# still reads correctly. Prints nothing when the key is absent.
# ---------------------------------------------------------------------
env_value() {
  local key="$1" file="$2" line value
  line="$(grep -m1 -E "^[[:space:]]*${key}[[:space:]]*=" -- "$file" 2>/dev/null || true)"
  [ -n "$line" ] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  case "$value" in
    '"'*'"') value="${value#\"}"; value="${value%\"}" ;;
    "'"*"'") value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$value"
}

# Escape a value for a MySQL option file, where # starts a comment and a
# bare value cannot hold one. Quoted values honour \" and \\ escapes.
esc_cnf() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

MYSQL_CNF=""
cleanup() {
  local rc=$?
  if [ -n "$MYSQL_CNF" ] && [ -f "$MYSQL_CNF" ]; then rm -f -- "$MYSQL_CNF"; fi
  # Only ever present if the swap in step (j) did not finish.
  if [ -d "$WEB_NEW" ]; then rm -rf -- "$WEB_NEW"; fi
  return $rc
}
trap cleanup EXIT

printf 'Deploying from %s\n' "$REPO_ROOT"

# =====================================================================
# STEP 0 -- PREFLIGHT: is every tool we will need actually here?
#
# Before (a) on purpose. Discovering that pm2 is missing AFTER the new
# bundle has replaced the old one would leave the site half-deployed.
# =====================================================================
step "STEP 0/12  Preflight: tools, pm2 app, and write access"

for tool in git npm node mysql curl pm2; do
  command -v "$tool" >/dev/null 2>&1 || die "\`$tool\` is not on PATH."
done
ok "git, npm, node, mysql, curl, pm2 all present"
info "node $(node --version), npm $(npm --version)"

pm2 describe "$PM2_APP" >/dev/null 2>&1 || die \
  "pm2 has no app called '$PM2_APP' for user '$(id -un)'." \
  "pm2 is per-user. Either you are not the user that owns the API process," \
  "or the app has never been started. Check with:  pm2 list" \
  "Do NOT re-run this under sudo unless pm2 belongs to root -- it would" \
  "reload a different daemon and report success while the old code served."
ok "pm2 app '$PM2_APP' found (user $(id -un))"

[ -w "$(dirname -- "$WEB_ROOT")" ] || die \
  "cannot write $(dirname -- "$WEB_ROOT") as user '$(id -un)'." \
  "The published bundle and its backup both live there."
ok "can write $(dirname -- "$WEB_ROOT")"

[ -d "$MIGRATIONS_DIR" ] || die "no migrations directory at $MIGRATIONS_DIR"

# =====================================================================
# STEP a -- the branch must be main
# =====================================================================
step "STEP 1/12 (a)  Confirm the checkout is on '$REQUIRED_BRANCH'"

cd -- "$REPO_ROOT"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die \
  "$REPO_ROOT is not a git working tree."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "$REQUIRED_BRANCH" ] || die \
  "on branch '$BRANCH', not '$REQUIRED_BRANCH'." \
  "Production is deployed from '$REQUIRED_BRANCH' only. Switch with:" \
  "  git checkout $REQUIRED_BRANCH"
ok "on $BRANCH"

# =====================================================================
# STEP b -- the client production env file must exist and be complete
# =====================================================================
step "STEP 2/12 (b)  Confirm client/.env.production exists and is complete"

if [ ! -f "$CLIENT_ENV" ]; then
  die "$CLIENT_ENV does not exist." \
    "Create it on the server -- it is gitignored and must NEVER be committed." \
    "It must contain exactly these variables:" \
    "" \
    "  VITE_API_URL             the public https origin of the API" \
    "  VITE_GOOGLE_CLIENT_ID    the Google OAuth client id for this app" \
    "  VITE_ALLOW_DEMO_LOGIN    false in production" \
    "" \
    "See deploy.README.md for the exact file to write."
fi

MISSING=""
for var in $REQUIRED_CLIENT_VARS; do
  if [ -z "$(env_value "$var" "$CLIENT_ENV")" ]; then
    MISSING="$MISSING $var"
  fi
done
if [ -n "$MISSING" ]; then
  die "$CLIENT_ENV is missing (or leaves empty) these variables:" \
    "  $MISSING" \
    "" \
    "All three are required. The build reads them at compile time and bakes" \
    "them into the bundle; an absent VITE_API_URL silently produces a DEMO" \
    "build that talks to no server at all."
fi
ok "all three variables present"

# A stray `true` here cannot expose the demo picker while VITE_API_URL is
# set -- the frontend requires BOTH -- but it means the file was copied
# from the demo config, which is worth knowing about.
if [ "$(env_value VITE_ALLOW_DEMO_LOGIN "$CLIENT_ENV")" = "true" ]; then
  warn "VITE_ALLOW_DEMO_LOGIN is 'true'. Harmless while VITE_API_URL is set,"
  warn "but it should be 'false' in production. Continuing."
fi

# =====================================================================
# STEP c -- the server env file must exist
# =====================================================================
step "STEP 3/12 (c)  Confirm server/.env exists"

if [ ! -f "$SERVER_ENV" ]; then
  die "$SERVER_ENV does not exist." \
    "It is gitignored. Copy server/.env.example to server/.env and fill in:" \
    "  DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME" \
    "  GOOGLE_CLIENT_ID ALLOWED_EMAIL_DOMAIN" \
    "  JWT_SECRET   (generate a fresh one -- see .env.example)"
fi
ok "server/.env present"

# Everything the database steps need, read now so a gap stops the deploy
# before anything has been changed. Values are never printed.
DB_HOST="$(env_value DB_HOST "$SERVER_ENV")"
DB_PORT="$(env_value DB_PORT "$SERVER_ENV")"
DB_USER="$(env_value DB_USER "$SERVER_ENV")"
DB_PASSWORD="$(env_value DB_PASSWORD "$SERVER_ENV")"
DB_NAME="$(env_value DB_NAME "$SERVER_ENV")"
API_PORT="$(env_value PORT "$SERVER_ENV")"

[ -n "$DB_USER" ] || die "DB_USER is not set in $SERVER_ENV"
[ -n "$DB_NAME" ] || die "DB_NAME is not set in $SERVER_ENV"
[ -n "$DB_HOST" ] || DB_HOST="localhost"
[ -n "$DB_PORT" ] || DB_PORT="3306"
# index.js defaults to 5001 when PORT is unset; the health checks must match.
[ -n "$API_PORT" ] || API_PORT="5001"

[ -n "$(env_value JWT_SECRET "$SERVER_ENV")" ] || die \
  "JWT_SECRET is not set in $SERVER_ENV." \
  "The API refuses to start without it, so reloading pm2 would take the" \
  "site down. Generate one before deploying -- see server/.env.example."
ok "database settings and JWT_SECRET read from server/.env (not printed)"

HEALTH_URL="http://localhost:$API_PORT/api/health"
GUARDED_URL="http://localhost:$API_PORT/api/faculty"

# =====================================================================
# STEP d -- fast-forward the checkout
# =====================================================================
step "STEP 4/12 (d)  git pull --ff-only"

SELF_BEFORE="$(sha256sum -- "$SELF" | cut -d' ' -f1)"

git pull --ff-only

SELF_AFTER="$(sha256sum -- "$SELF" | cut -d' ' -f1)"
if [ "$SELF_BEFORE" != "$SELF_AFTER" ]; then
  printf '\n---------------------------------------------------------------------\n'
  printf 'STOPPING: that pull updated deploy.sh itself.\n'
  printf '\n'
  printf 'bash reads a script as it runs, so carrying on now would execute a\n'
  printf 'mixture of the old and new file. NOTHING has been changed yet.\n'
  printf '\n'
  printf 'Just run it again:   ./deploy.sh\n'
  printf '---------------------------------------------------------------------\n'
  exit 0
fi
ok "up to date, and deploy.sh itself is unchanged"

# =====================================================================
# STEP e -- server dependencies, production only
# =====================================================================
step "STEP 5/12 (e)  npm ci --omit=dev  (server)"

# npm ci deletes and recreates node_modules. The running API has already
# loaded its modules into memory, so it keeps serving until the reload in
# step (k) -- which is why the reload comes after this and not before.
( cd -- "$SERVER_DIR" && npm ci --omit=dev )
ok "server dependencies installed"

# =====================================================================
# STEP f -- client dependencies, dev tools included
# =====================================================================
step "STEP 6/12 (f)  npm ci  (client)"

# NOT --omit=dev: vite and the react plugin are devDependencies, and the
# build cannot run without them.
( cd -- "$CLIENT_DIR" && npm ci )
ok "client dependencies installed"

# =====================================================================
# STEP g -- migrations, in filename order, stopping at the first failure
# =====================================================================
step "STEP 7/12 (g)  Apply migrations to database '$DB_NAME'"

# A mode-600 option file, not -p on the command line: an argument is
# visible to every user on the box through `ps`. Removed by the EXIT trap
# however this script ends.
MYSQL_CNF="$(mktemp)"
chmod 600 -- "$MYSQL_CNF"
{
  printf '[client]\n'
  printf 'host="%s"\n'     "$(esc_cnf "$DB_HOST")"
  printf 'port=%s\n'       "$DB_PORT"
  printf 'user="%s"\n'     "$(esc_cnf "$DB_USER")"
  printf 'password="%s"\n' "$(esc_cnf "$DB_PASSWORD")"
} > "$MYSQL_CNF"

# No `--` before the database name: mysql's option parser does not treat it
# the way GNU tools do, and would read it as the schema to use.
mysql --defaults-extra-file="$MYSQL_CNF" -e 'SELECT 1' "$DB_NAME" >/dev/null \
  || die "cannot connect to database '$DB_NAME' with the credentials in server/.env." \
       "Nothing has been changed. Check DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME."
ok "connected to '$DB_NAME'"

# Plain glob order IS filename order here: the names are 001_ .. 013_,
# ASCII digits, which collate the same in every locale.
MIGRATIONS=()
for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$f" ] || continue
  MIGRATIONS+=("$f")
done
[ "${#MIGRATIONS[@]}" -gt 0 ] || die "no .sql files found in $MIGRATIONS_DIR"

info "${#MIGRATIONS[@]} migration file(s) found"
[ -z "$SKIP_MIGRATIONS" ] || info "SKIP_MIGRATIONS is set: $SKIP_MIGRATIONS"

APPLIED=0
SKIPPED=0
for f in "${MIGRATIONS[@]}"; do
  name="$(basename -- "$f")"

  case " $SKIP_MIGRATIONS " in
    *" $name "*)
      info "skip    $name  (listed in SKIP_MIGRATIONS)"
      SKIPPED=$((SKIPPED + 1))
      continue
      ;;
  esac

  printf '   apply   %s ... ' "$name"
  if mysql --defaults-extra-file="$MYSQL_CNF" "$DB_NAME" < "$f"; then
    printf 'ok\n'
    APPLIED=$((APPLIED + 1))
  else
    printf 'FAILED\n'
    die "migration '$name' failed." \
      "Migrations run in filename order and this one stopped the deploy," \
      "so no file after it was applied. The site is UNTOUCHED: the old" \
      "bundle is still being served and pm2 has not been reloaded." \
      "Fix the migration or the database, then re-run ./deploy.sh."
  fi
done
ok "$APPLIED applied, $SKIPPED skipped"

# =====================================================================
# STEP h -- build the client
# =====================================================================
step "STEP 8/12 (h)  npm run build -- --base=/"

# --base=/ because the Pages build uses a subdirectory base and this one
# is served from the domain root. Vite loads client/.env.production by
# itself for a production build; the variables are not passed here.
( cd -- "$CLIENT_DIR" && npm run build -- --base=/ )

[ -f "$DIST_DIR/index.html" ] || die \
  "the build produced no $DIST_DIR/index.html. Nothing was copied."
ok "built into $DIST_DIR"

# =====================================================================
# STEP i -- prove the bundle really carries VITE_API_URL
# =====================================================================
step "STEP 9/12 (i)  Verify the bundle contains the VITE_API_URL value"

# The one failure this catches is the quiet one. api.js decides mock mode
# purely on whether VITE_API_URL is set at BUILD time, so a build that
# missed the variable produces a working-looking site that talks to no
# server, shows sample data, and cannot sign anybody in. Checked BEFORE
# the copy, so a bad build never reaches /var/www.
API_URL_VALUE="$(env_value VITE_API_URL "$CLIENT_ENV")"

if grep -rqF -- "$API_URL_VALUE" "$DIST_DIR"; then
  ok "VITE_API_URL found in the built bundle (value not printed)"
else
  die "the built bundle does NOT contain the VITE_API_URL value." \
    "This build would behave as a DEMO build: sample data, no API, no" \
    "sign-in. Nothing has been copied and the live site is untouched." \
    "" \
    "Check that $CLIENT_ENV" \
    "sets VITE_API_URL, and that the file is named exactly" \
    "'.env.production' (vite only loads that name for a production build)."
fi

# =====================================================================
# STEP j -- back up the live bundle, then swap the new one in
# =====================================================================
step "STEP 10/12 (j)  Back up to $WEB_PREV and publish the new bundle"

# Staged then moved, rather than copied over the live directory: a copy
# in place would serve a half-written directory for the length of the
# copy, and would leave last release's hashed assets behind forever. Two
# renames instead, so the visible gap is milliseconds.
umask 022
rm -rf -- "$WEB_NEW"
mkdir -p -- "$WEB_NEW"
cp -a -- "$DIST_DIR/." "$WEB_NEW/"

if [ -d "$WEB_ROOT" ]; then
  # Carry the live directory's ownership and mode onto the replacement,
  # so Nginx can still read it whoever ran this script.
  OWNER="$(stat -c '%U:%G' -- "$WEB_ROOT")"
  MODE="$(stat -c '%a' -- "$WEB_ROOT")"
  if chown -R -- "$OWNER" "$WEB_NEW" 2>/dev/null && chmod -- "$MODE" "$WEB_NEW"; then
    ok "ownership $OWNER and mode $MODE carried over"
  else
    warn "could not set ownership to $OWNER / mode $MODE on the new directory."
    warn "If Nginx starts returning 403, that is why -- fix with:"
    warn "  chown -R $OWNER $WEB_ROOT && chmod $MODE $WEB_ROOT"
  fi

  rm -rf -- "$WEB_PREV"
  mv -- "$WEB_ROOT" "$WEB_PREV"
  ok "previous bundle kept at $WEB_PREV"
else
  warn "$WEB_ROOT does not exist yet -- first deploy, so no backup was made."
fi

mv -- "$WEB_NEW" "$WEB_ROOT"
ok "published to $WEB_ROOT"

# =====================================================================
# STEP k -- reload the API
# =====================================================================
step "STEP 11/12 (k)  pm2 reload $PM2_APP"

pm2 reload "$PM2_APP"
ok "reload requested"

# =====================================================================
# STEP l -- prove the API came back, and came back protected
# =====================================================================
step "STEP 12/12 (l)  Health checks"

# Retried, not asked once: a graceful reload takes a moment to start
# listening, and a single immediate probe would race it.
# curl already writes 000 through -w when it cannot connect, and exits
# non-zero doing it -- so the failure is swallowed rather than appended to,
# which would produce "000000".
probe() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null)" || true
  [ -n "$code" ] || code="000"
  printf '%s' "$code"
}

HEALTH_CODE="000"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  HEALTH_CODE="$(probe "$HEALTH_URL")"
  if [ "$HEALTH_CODE" = "200" ]; then break; fi
  sleep 1
done

# Unauthenticated. 401 is the correct answer and 200 would mean the API
# is serving staff email addresses to the public internet.
GUARDED_CODE="$(probe "$GUARDED_URL")"

printf '   GET %-40s -> %s   (want 200)\n' "/api/health"  "$HEALTH_CODE"
printf '   GET %-40s -> %s   (want 401)\n' "/api/faculty" "$GUARDED_CODE"

if [ "$HEALTH_CODE" = "200" ] && [ "$GUARDED_CODE" = "401" ]; then
  step "DEPLOY OK"
  info "Frontend:  $WEB_ROOT   (previous release: $WEB_PREV)"
  info "API:       pm2 app '$PM2_APP' on port $API_PORT"
  exit 0
fi

printf '\n---------------------------------------------------------------------\n' >&2
printf 'DEPLOY FINISHED BUT THE CHECKS DID NOT PASS.\n' >&2
printf '\n' >&2
if [ "$HEALTH_CODE" != "200" ]; then
  printf '  /api/health returned %s, not 200. The API is not serving.\n' "$HEALTH_CODE" >&2
  printf '  000 means nothing answered on port %s at all.\n' "$API_PORT" >&2
fi
if [ "$GUARDED_CODE" = "200" ]; then
  printf '  /api/faculty returned 200 WITHOUT a token. Authentication is NOT\n' >&2
  printf '  being enforced -- staff email addresses are readable by anyone.\n' >&2
  printf '  Treat this as urgent.\n' >&2
elif [ "$GUARDED_CODE" != "401" ]; then
  printf '  /api/faculty returned %s, not 401.\n' "$GUARDED_CODE" >&2
fi
printf '\n' >&2
printf '  RESTORE THE PREVIOUS FRONTEND:\n' >&2
printf '    rm -rf %s.broken && mv %s %s.broken\n' "$WEB_ROOT" "$WEB_ROOT" "$WEB_ROOT" >&2
printf '    mv %s %s\n' "$WEB_PREV" "$WEB_ROOT" >&2
printf '\n' >&2
printf '  THEN READ THE API LOGS:\n' >&2
printf '    pm2 logs %s --lines 100\n' "$PM2_APP" >&2
printf '    pm2 describe %s\n' "$PM2_APP" >&2
printf '\n' >&2
printf '  A JWT_SECRET missing from server/.env is the most likely reason the\n' >&2
printf '  API failed to start; it refuses to boot without one.\n' >&2
printf '---------------------------------------------------------------------\n' >&2
exit 1
