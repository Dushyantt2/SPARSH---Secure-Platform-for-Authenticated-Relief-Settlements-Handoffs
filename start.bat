@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM SPARSH / SAMARTH - one-command local runner (Windows)
REM
REM   start.bat [--reset]
REM
REM Ensures the `samarth` database exists, installs dependencies, seeds the
REM schema + demo data, then starts backend (:4000) and frontend (:5173).
REM ===========================================================================
cd /d "%~dp0"

REM ---- configuration (overridable via env) ----------------------------------
if "%PGHOST%"=="" set PGHOST=127.0.0.1
if "%PGPORT%"=="" set PGPORT=5432
if "%PGUSER%"=="" set PGUSER=postgres
if "%PGPASSWORD%"=="" set PGPASSWORD=postgres
if "%PGDATABASE%"=="" set PGDATABASE=samarth
if "%PORT%"=="" set PORT=4000

set "DB_SOCKET=%~d0\root" 2>NUL

REM ---- check if DATABASE_URL is set or in .env -------------------------------
set "HAS_DATABASE_URL="
if not "%DATABASE_URL%"=="" set HAS_DATABASE_URL=1
if exist .env (
  findstr /i "DATABASE_URL" .env >nul 2>&1
  if not errorlevel 1 set HAS_DATABASE_URL=1
)

REM ---- 1. prerequisites ------------------------------------------------------
where node >NUL 2>NUL || (
  echo [setup] ERROR: Node.js not found. Install Node 18+ from https://nodejs.org and re-run.
  exit /b 1
)
if "%HAS_DATABASE_URL%"=="" (
  where psql >NUL 2>NUL
  if errorlevel 1 (
    echo [setup] ERROR: psql not found. Install PostgreSQL 12+ and ensure it is on PATH.
    exit /b 1
  )
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo [setup] ERROR: Node 18+ required. Upgrade Node and re-run.
  exit /b 1
)
echo [setup] Node OK

REM ---- 2. database: create `samarth` if missing ------------------------------
if "%HAS_DATABASE_URL%"=="" (
  set "CREATEDB_CHECK="
  for /f "delims=" %%r in ('psql -h %PGHOST% -p %PGPORT% -U %PGUSER% -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='%PGDATABASE%'" 2^>NUL') do set CREATEDB_CHECK=%%r
  if "%CREATEDB_CHECK%"=="1" (
    echo [setup] Database '%PGDATABASE%' already exists
  ) else (
    echo [setup] Creating database '%PGDATABASE%'...
    psql -h %PGHOST% -p %PGPORT% -U %PGUSER% -d postgres -c "CREATE DATABASE %PGDATABASE%"
    if errorlevel 1 (
      echo [setup] ERROR: could not create database. Check PGPASSWORD / PostgreSQL service.
      exit /b 1
    )
    echo [setup] Created database '%PGDATABASE%'
  )
) else (
  echo [setup] Using database specified in DATABASE_URL / .env - skipping local db checks
)

REM ---- 3. dependencies --------------------------------------------------------
if exist node_modules\* if exist backend\node_modules\* if exist frontend\node_modules\* (
  echo [setup] Dependencies already installed
) else (
  echo [setup] Installing dependencies - first run takes a while...
  call npm install --no-audit --no-fund || exit /b 1
  pushd backend  && call npm install --no-audit --no-fund && popd || exit /b 1
  pushd frontend && call npm install --no-audit --no-fund && popd || exit /b 1
  echo [setup] Dependencies installed
)

REM ---- 4. schema + seed ---------------------------------------------------------
if "%1"=="--reset" (
  echo [setup] Rebuilding and reseeding the database --reset...
  pushd backend && call npm run db:init -- --force && popd || exit /b 1
) else (
  echo [setup] Initialising schema + seed data...
  pushd backend && call npm run db:init && popd || exit /b 1
)
echo [setup] Database ready

REM ---- 5. run backend + frontend -----------------------------------------------
echo.
echo SPARSH is starting...
echo   Frontend UI  - http://localhost:5173
echo   Backend API  - http://localhost:%PORT%  (health: /api/health)
echo   Press Ctrl+C to stop both.
echo.
call npm run dev
