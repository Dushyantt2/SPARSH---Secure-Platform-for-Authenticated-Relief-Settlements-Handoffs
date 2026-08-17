#!/usr/bin/env bash
# =============================================================================
# SPARSH / SAMARTH — one-command local runner
#
#   ./start.sh [--reset]
#
# This script ensures PostgreSQL is running, creates the `samarth` database if
# missing, installs dependencies, seeds the schema + demo data, and then starts
# the backend API (:4000) and the frontend dev server (:5173) together.
#
# Env overrides (all optional):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PORT
#   FORCE_RESET=1   drop + rebuild + reseed the database on startup
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

# ---- configuration (overridable via env) -----------------------------------
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGDATABASE="${PGDATABASE:-samarth}"
PORT="${PORT:-4000}"
FORCE_RESET="${FORCE_RESET:-0}"

export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PORT

# ---- check if DATABASE_URL is set or in .env ---------------------------------
HAS_DATABASE_URL=0
if [ -n "${DATABASE_URL:-}" ]; then
  HAS_DATABASE_URL=1
elif [ -f .env ] && grep -q "DATABASE_URL" .env; then
  HAS_DATABASE_URL=1
fi

info() { printf "\033[36m[setup]\033[0m %s\n" "$*"; }
ok()   { printf "\033[32m[setup]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[setup]\033[0m %s\n" "$*"; }
fail() { printf "\033[31m[setup]\033[0m %s\n" "$*" >&2; }

# =============================================================================
# 1. Prerequisites: node + npm
# =============================================================================
command -v node >/dev/null 2>&1 || { fail "Node.js not found. Install Node 18+ from https://nodejs.org and re-run."; exit 1; }
command -v npm  >/dev/null 2>&1 || { fail "npm not found."; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node 18+ required (found $(node --version)). Upgrade Node and re-run."
  exit 1
fi
ok "Node $(node --version) + npm $(npm --version)"

# =============================================================================
# 2. PostgreSQL: running + reachable
# =============================================================================
if [ "$HAS_DATABASE_URL" = "0" ]; then
  command -v psql >/dev/null 2>&1 || { fail "psql not found. Install PostgreSQL (12+) and re-run."; exit 1; }

  if ! pg_isready -h "$PGHOST" -p "$PGPORT" -q 2>/dev/null; then
    info "PostgreSQL is not running on $PGHOST:$PGPORT — trying to start it…"
    if command -v service >/dev/null 2>&1; then
      service postgresql start 2>/dev/null || sudo -n service postgresql start 2>/dev/null || true
    elif command -v pg_ctlcluster >/dev/null 2>&1; then
      VER="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $1}')"
      [ -n "$VER" ] && (sudo -n pg_ctlcluster "$VER" main start 2>/dev/null || pg_ctlcluster "$VER" main start 2>/dev/null || true)
    fi
    sleep 3
  fi

  if ! pg_isready -h "$PGHOST" -p "$PGPORT" -q 2>/dev/null; then
    fail "PostgreSQL is not reachable at $PGHOST:$PGPORT. Start it manually, then re-run."
    fail "Hint: sudo systemctl start postgresql   (or: brew services start postgresql)"
    exit 1
  fi
  ok "PostgreSQL reachable at $PGHOST:$PGPORT"
fi

# =============================================================================
# 3. Database: create `samarth` if it does not exist
# =============================================================================
if [ "$HAS_DATABASE_URL" = "0" ]; then
  PGARGS=(-h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres)
  export PGPASSWORD

  if PGPASSWORD="$PGPASSWORD" psql "${PGARGS[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname='$PGDATABASE'" | grep -q 1; then
    ok "Database '$PGDATABASE' already exists"
  else
    info "Creating database '$PGDATABASE'…"
    PGPASSWORD="$PGPASSWORD" psql "${PGARGS[@]}" -c "CREATE DATABASE $PGDATABASE" >/dev/null
    ok "Created database '$PGDATABASE'"
  fi
else
  ok "Using database specified in DATABASE_URL / .env (skipping local db checks)"
fi

# =============================================================================
# 4. Dependencies: install only when missing
# =============================================================================
if [ -d node_modules ] && [ -d backend/node_modules ] && [ -d frontend/node_modules ]; then
  ok "Dependencies already installed"
else
  info "Installing dependencies (first run takes a while)…"
  npm install --no-audit --no-fund
  (cd backend && npm install --no-audit --no-fund)
  (cd frontend && npm install --no-audit --no-fund)
  ok "Dependencies installed"
fi

# =============================================================================
# 5. Schema + seed data
# =============================================================================
if [ "$FORCE_RESET" = "1" ] || [ "$#" -ge 1 ] && [ "$1" = "--reset" ]; then
  info "Rebuilding and reseeding the database (--reset)…"
  (cd backend && npm run db:init -- --force)
else
  info "Initialising schema + seed data…"
  (cd backend && npm run db:init)
fi
ok "Database ready"

# =============================================================================
# 6. Run backend + frontend together
# =============================================================================
echo
printf "\033[1mSPARSH is starting…\033[0m\n"
info "Frontend UI  -> http://localhost:5173"
info "Backend API  -> http://localhost:${PORT}  (health: /api/health)"
info "Press Ctrl+C to stop both."
echo

if [ -x node_modules/.bin/concurrently ]; then
  exec node_modules/.bin/concurrently -n server,web -c blue,magenta \
    "npm run dev:server" \
    "npm run dev:web"
fi

# Fallback when `concurrently` is unavailable: backend in background, frontend
# in foreground; Ctrl+C tears both down.
trap 'kill 0' EXIT INT TERM
(cd backend && npm run dev) &
wait
