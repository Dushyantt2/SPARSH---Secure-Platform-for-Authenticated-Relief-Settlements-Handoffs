# SAMARTH / SPARSH — Project Context File

This document is the single source of context for anyone (human or agent) working on
this repository. It explains **what** the system is, **how** the code is organised,
**how** each piece works, **how to run and test it**, known observations, and the
planned **future work** so that new changes can be made consistently with the
existing design.

---

## 1. What This Project Is

**SAMARTH** (branded in the UI as **SPARSH** — *Secure Platform for Authenticated
Relief Settlement & Handoffs*) is a **web-based, human-in-the-loop Direct Benefit
Transfer (DBT) system** for disbursing relief under two Indian laws:

- **The Protection of Civil Rights (PCR) Act, 1955**
- **The Scheduled Castes and Scheduled Tribes (Prevention of Atrocities / PoA) Act, 1989**

The system digitises the entire lifecycle of a relief claim:

1. **Citizen** registers their case by pulling the **CCTNS FIR** against their
   Aadhaar, verified against **eCourts**, **Aadhaar eKYC** and **PFMS** bank data.
2. Citizen answers an **eligibility-screening questionnaire**, selects the relief
   type, attaches **DigiLocker** documents and self-declares.
3. A **stage-wise workflow** moves the application through officers in a strict
   chain: **DWO verifies** → **DM approves** → **Treasury confirms** → **PFMS
   disburses** stage-wise tranches.
4. Everything is recorded in an **append-only, hash-chained audit log**, SLAs are
   tracked with **automatic escalations**, citizens can raise **grievances**, and
   officials get **analytics/insights** plus an anonymised **open-data** feed.

> Note on naming: the top-level `package.json` calls the project `samarth-dbt`; the
> backend package is `samarth-server`; the frontend package is `samarth-web`; the
> runtime/branding (landing page, UI) is **SPARSH**. Both names refer to the same
> product and are used interchangeably in the code.

### Demo nature
All external government "DPI" systems (CCTNS, eCourts, UIDAI/Aadhaar, DigiLocker,
PFMS, SMS gateway) are **mocked, deterministic and offline** so the MVP runs
anywhere. The data they return is derived from a `data.zip` seed dump, not
hardcoded demo values. See Section 7.

---

## 2. System Architecture

The architecture mirrors a **6-layer** design and the code, database schema and
folder layout follow the same separation:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UI (React SPA) — /frontend                                             │
│  Citizen portal, Officer portal, QR multi-device access, landing page   │
└─────────────────────────────────────────────────────────────────────────┘
                                   │  HTTP /api/* (Vite proxy → :4000)
┌─────────────────────────────────────────────────────────────────────────┐
│  Express API — /backend/src/app.ts                                       │
├───────────────┬─────────────────────────────────────────────────────────┤
│ Layer 0       │ Access & Identity  → auth.ts, middleware.ts (JWT, RBAC, │
│               │                    2FA/OTP, 2-step citizen login, QR)    │
│ Layer 1       │ Ingestion          → intake.ts, mockDpi.ts, dataRegistry│
│               │                    (FIR, eCourts, Aadhaar, PFMS,        │
│               │                    DigiLocker, dedup, screening)         │
│ Layer 2       │ Workflow           → catalogue.ts, workflow.ts,          │
│               │                    officer.ts (stages, SLA, escalation)  │
│ Layer 3       │ Disbursement       → disbursement.ts (PFMS, retry queue, │
│               │                    treasury ledger)                       │
│ Layer 4       │ Audit & Grievance  → audit.ts (hash chain),              │
│               │                    grievance.ts, notifications.ts         │
│ Layer 5       │ Analytics          → analytics.ts (KPI, report,          │
│               │                    open-data)                             │
├───────────────┴─────────────────────────────────────────────────────────┤
│  PostgreSQL (pg pool) — schema.sql: users, cases, relief_applications,  │
│  workflow_stages, transactions, treasury_ledger, audit_logs, grievances │
└─────────────────────────────────────────────────────────────────────────┘
```

Key invariants of the design:

- **Human-in-the-loop**: nothing is auto-approved. Every stage must be verified
  by the DWO, approved by the DM, and (where configured) confirmed by Treasury
  before PFMS is called. Tests explicitly assert "no fund release without human
  approval" (`backend/test/e2e.test.ts:236`).
- **Chain-aware visibility**: an officer can only see/act on an application when
  they are the *next pending approver* on the current stage. Nothing reaches the
  DM before DWO verification, nothing reaches Treasury before DM approval.
- **Event-gated stages**: case-linked reliefs wait for external events
  (`CHARGE_SHEET_FILED`, `CONVICTION`, `HOUSING_COMPLETED`) before the next stage
  can be worked on. Events are simulated by officers in the demo.
- **Append-only audit**: every significant action is written to `audit_logs` as a
  SHA-256 hash of the previous hash + payload, forming a tamper-evident chain.
- **Resilient payments**: PFMS transfers retry 3x synchronously; any remaining
  failure is queued as `FAILED`/`RETRY` and can be flushed by Treasury.

---

## 3. Tech Stack

| Concern | Technology |
|---|---|
| Backend | Node.js, TypeScript (ESM), Express 4 |
| Database | PostgreSQL (via `pg` Pool) |
| Frontend | React 18, TypeScript, Vite 6, React Router 6, TailwindCSS 3 |
| UI animation | framer-motion, lucide-react icons |
| Charts | recharts |
| QR codes | qrcode (client-side generation) |
| Auth | jsonwebtoken (JWT), bcryptjs, mock OTP (DB-backed) |
| API testing | vitest + supertest |
| Dev tooling | tsx (run/watch TS), concurrently (root dev script) |
| Node runtime | `>= 18`-style modern Node (ESM, `node:` imports) |

### Ports & proxy
- Backend: `http://localhost:4000` (configurable via `PORT`).
- Frontend dev server: `http://localhost:5173`.
- `frontend/vite.config.ts` proxies `/api` → `http://localhost:4000`, so the SPA
  calls `/api/...` relative paths. `allowedHosts` already includes
  `.monkeycode-ai.live` for the hosted preview environment.

---

## 4. Repository Layout

```
/workspace
├── CONTEXT.md                  ← this file
├── package.json                root scripts: setup, db:init, dev, build, test, e2e
├── start.sh / start.bat        one-command local runner (DB + backend + frontend)
├── requirements.txt            system prerequisites for local setup
├── Architecture_explanation.pdf  supporting design doc (deliverable artifact)
├── data.zip                    raw seed dump (Aadhaar/CCTNS/eCourts/PFMS) → backend/data
├── landing_page.zip            original static landing page source (ported into React)
├── backend/
│   ├── package.json            samarth-server scripts (dev, build, test, e2e, db:init)
│   ├── tsconfig.json
│   ├── data/                   Aadhaar_mock, cctns_mock, ecourt_mock, pfms_mock
│   ├── test/e2e.test.ts        full end-to-end test suite (supertest + vitest)
│   └── src/
│       ├── index.ts            bootstrap (init db → seed → listen)
│       ├── app.ts              Express app factory + route mounting + error handler
│       ├── config.ts           env-driven configuration
│       ├── types.ts            shared domain types (Role, ReliefType, statuses…)
│       ├── db/                 pool.ts, schema.sql, init.ts, seed.ts
│       ├── http/               middleware.ts + routes/{auth,citizen,official,analytics}.ts
│       └── layers/
│           ├── layer0-access/auth.ts
│           ├── layer1-ingestion/intake.ts + dpi/{mockDpi.ts,dataRegistry.ts}
│           ├── layer2-workflow/catalogue.ts, workflow.ts, officer.ts
│           ├── layer3-disbursement/disbursement.ts
│           ├── layer4-audit-grievance/audit.ts, grievance.ts, notifications.ts
│           └── layer5-analytics/analytics.ts
└── frontend/
    ├── package.json            samarth-web scripts (dev, build, preview)
    ├── vite.config.ts          dev server + /api proxy + allowedHosts
    ├── index.html
    ├── tailwind.config.js      custom ink/slate/brand/saffron/tealx palette, light theme
    ├── postcss.config.js
    ├── public/                 ashoka_emblem.* , qr/*.png (static brand assets)
    └── src/
        ├── main.tsx            React entry
        ├── App.tsx             routes + role guards
        ├── index.css           Tailwind + custom component classes (glass, btn-*, input…)
        ├── landing.css         scoped styles for the landing page
        ├── api/client.ts       fetch wrapper (JWT header, 401 handling) + api object
        ├── api/types.ts        API response types
        ├── context/AuthContext.tsx  auth state + login flows
        ├── lib/usePolling.ts   poll-on-interval + on-focus hook
        ├── components/         Shell (nav shell), ui.tsx (shared primitives), dash.tsx,
        │                       ESign.tsx (signature pad/stamp), LivePulse
        └── pages/
            ├── Landing.tsx, Login.tsx, QrLogin.tsx, Devices.tsx (unrouted)
            ├── citizen/  CitizenOverview, CitizenCases, CaseDetail, CitizenGrievances
            └── official/ OfficialDashboard, OfficialCases, OfficialCaseDetail,
                          Treasury, OfficialGrievances, Audit, Analytics
```

---

## 5. Database Schema (`backend/src/db/schema.sql`)

Applied idempotently (`CREATE TABLE IF NOT EXISTS`) on every boot; extended by
`seed`. Tables:

| Table | Purpose | Key columns |
|---|---|---|
| `users` | All identities (citizens + officials) | `role`, `district`, `aadhaar`, `enabled`, `password_hash` |
| `otp_codes` | Mock 2FA tokens | `code`, `purpose`, `used`, `expires_at` |
| `relief_types` | Catalogue of 8 reliefs | `code`, `category`, `required_docs`, `sla_days`, `stages (jsonb)` |
| `cases` | Unified case per FIR | `case_number`, `fir_number`, `master_object (jsonb)`, `is_duplicate` |
| `relief_applications` | One per case × relief | `status`, `current_stage`, `amount_total/released`, `screening`, `declaration` |
| `documents` | DigiLocker/manual docs per application | `doc_type`, `source`, `hash`, `status` |
| `workflow_stages` | Stage rows per application | `stage_number`, `status`, `amount_percent`, `trigger_event`, `dwo_verification/dm_approval/treasury_confirmation (jsonb)`, `sla_due_at` |
| `escalations` | SLA breach escalations | `level` (COLLECTOR/STATE_SECRETARY), `status` |
| `notifications` | In-app notifications | `channel`, `read` |
| `transactions` | PFMS payment attempts | `txid`, `status` (PENDING/SUCCESS/FAILED/RETRY), `attempt_count` |
| `treasury_ledger` | District × relief allocation/utilisation | `allocated`, `utilized` (UNIQUE district+relief_type) |
| `audit_logs` | Append-only hash chain | `prev_hash`, `hash` (UNIQUE), `action`, `entity_*`, `detail (jsonb)` |
| `grievances` | Citizen complaints | `ref`, `status`, `assigned_role`, `resolution` |

Supporting indexes exist for application status/case, stages, transactions, audit
entity lookup and grievances by citizen.

---

## 6. Backend Walkthrough

### 6.1 Bootstrap (`index.ts` → `db/init.ts`)
- `initDatabase()` executes `schema.sql`.
- `runSeed()`:
  - Upserts the **8 relief types** from `catalogue.ts` (with stage rules as JSONB).
  - Seeds **6 official accounts** (ADMIN + DWO×2 + DM×2 + TREASURY) for
    district Jodhpur, password `Samarth@123`. (The former AUDITOR role was
    removed — every action is written to the automatic hash-chained audit log,
    so no dedicated auditor viewer role is needed; the seed deletes any stale
    `AUDITOR` user rows on boot.)
  - Seeds **citizens** from the Aadhaar data dump (password `Citizen@123`).
  - Seeds `treasury_ledger` allocations (DEFAULT_RELIEF_AMOUNT × 50 per district).
  - Seeds 5 demo cases/applications (from data FIRs) **starting at stage 1 awaiting
    DWO** — deliberately nothing is pre-approved, so every role has genuine work.
  - Seeds one example grievance.
- `npm run db:init -- --force` drops + rebuilds + reseeds (`resetDatabase`).

### 6.2 Config (`config.ts`)
Env-driven with dev defaults: `PORT` (4000), `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`,
`JWT_SECRET`, `QR_SECRET`, `NODE_ENV`, `DATA_DIR`. `jwtExpiresIn = 12h`.

### 6.3 HTTP layer
- `app.ts` mounts `/api/health`, `/api/relief-types`, `/api/open-data`, plus
  routers: `/api/auth`, `/api/citizen`, `/api/official`, `/api/analytics`,
  `/api/audit`. Central error handler returns `{ error }` with status from
  `err.status` (default 500).
- `middleware.ts`:
  - `authRequired` — validates `Bearer` JWT and attaches `req.user` (TokenPayload).
  - `roleRequired(...roles)` — role gate (403 otherwise).
  - `ensureEnabled` — checks the `users.enabled` flag on each request.

### 6.4 Auth flows (`layer0-access/auth.ts` + `http/routes/auth.ts`)
- **Officer login**: email+password → if role requires 2FA (`requires2fa`:
  DWO/DM/TREASURY/ADMIN) an OTP is issued (stored in `otp_codes`,
  "sent" via mock SMS = `console.log`), response includes `devOtp` for demo.
  `verify-otp` completes login → real JWT (validates `userId`/`code`; invalid
  input returns 400 rather than crashing). No 2FA for citizens.
- **Citizen 2-step login**: step 1 = email + mobile match → short-lived 5-minute
  `stepToken` (no session). Step 2 = Aadhaar match → full JWT. Step tokens are
  one-purpose; replay of another citizen's token is rejected server-side by the
  Aadhaar bind.
- **Aadhaar login**: `aadhaar-login` finds user by 12-digit Aadhaar (officials
  still pass 2FA).
- **Register**: citizens self-register with Aadhaar in `XXXX-XXXX-XXXX` format.
- **Demo endpoints**: `GET /auth/demo/citizens` (list + reliefs) and
  `GET /auth/dev-otp/:userId` (ADMIN or self, returns latest OTP).
- **QR role access**: `GET /auth/qr/tokens` mints 10-minute signed tokens for
  roles CITIZEN/DWO/DM (mapped to fixed demo accounts in `QR_ROLE_USERS`).
  `POST /auth/qr-login` exchanges a token for a session; officials still require
  2FA.

### 6.5 Layer 1 — Ingestion (`intake.ts`, `dpi/mockDpi.ts`, `dpi/dataRegistry.ts`)
- `createCase(citizen, { fir_number })`:
  1. `cctnsGetFir` — validates FIR from the CCTNS registry.
  2. Verifies the FIR's victim Aadhaar == the logged-in citizen's Aadhaar (403).
  3. `ecourtsGetCase` — court stage.
  4. `aadhaarVerify` — eKYC.
  5. `pfmsValidateBeneficiary` — DBT readiness.
  6. **Dedup**: one active case per FIR; duplicate → returns existing case flagged
     `duplicate_flagged` + audit `DUPLICATE_DETECTED`.
  7. Builds the **unified Master Case Object** (FIR + eCourts + KYC + PFMS +
     DigiLocker consent + deterministic fingerprint), inserts `cases` row, audits.
- `applyRelief(citizen, { case_id, relief_code, doc_ids, screening, declaration })`:
  1. Validates ownership of the case.
  2. Runs the **eligibility screening** against `SCREENING_QUESTIONS`
     (every question answered; a disqualifying answer → 403).
  3. Requires the self-declaration checkbox.
  4. Enforces one application per (case, relief).
  5. Validates the selected DigiLocker docs exist and cover all
     `REQUIRED_BY_TYPE[relief]`; stores documents with SHA-256 hashes.
  6. Inserts the application + creates stage rows (`createStages`), starts stage 1
     if its trigger is `FIR_REGISTERED`/`APPLICATION`.
- `mockDpi.ts` — deterministic, offline DPI simulators. `pfmsExecutePayment`
  deliberately fails every 7th call to exercise the retry queue.
- `dataRegistry.ts` — parses the raw dump files in `backend/data/` into citizens,
  FIRs, courts and PFMS accounts (the single source of truth; no hardcoded demo
  data). Handles the commented/nested JSON shapes of the mock dumps.

### 6.6 Layer 2 — Workflow (`catalogue.ts`, `workflow.ts`, `officer.ts`)
- `catalogue.ts` defines 8 reliefs with `stages` (percent tranches, triggers,
  approval chain) and screening questions. `DEFAULT_RELIEF_AMOUNTS`:
  IMMEDIATE_RELIEF ₹1,00,000 · COMPENSATION ₹6,00,000 · REHABILITATION ₹4,00,000 ·
  EDUCATIONAL_GRANT ₹50,000 · HOUSING_ASSISTANCE ₹3,00,000 · SELF_EMPLOYMENT
  ₹1,50,000 · INTER_CAST_MARRIAGE ₹1,00,000 · FUNERAL_ASSISTANCE ₹20,000.
- `workflow.ts`:
  - `createStages` / `startStage` — create stage rows, set SLA deadlines.
  - `officerAct(appId, stage, action, actor, note?, reason?, signature?)` — the core
    **chain-aware action dispatcher**:
    - Guards stage state; requires trigger met before action.
    - Resolves the *next* pending approver from the stage rule (`approvals`).
    - Only that role may act (REJECT by current next approver; VERIFY=DWO,
      APPROVE=DM, CONFIRM=TREASURY).
    - Records the action into the stage's approval JSONB column (including the
      officer's eSign signature path when provided), audits it.
    - When the chain completes, finalises the stage and calls Layer 3
      `disburseStage`.
  - `fireEvent(appId, event, actor)` — advances workflow on external events
    (charge-sheet, conviction, housing completion) for multi-stage reliefs.
  - `refreshEscalations()` — marks overdue `IN_PROGRESS` stages → COLLECTOR
    escalation; if still open >48h later → STATE_SECRETARY. Called lazily from
    dashboard/analytics/KPI and via an ADMIN endpoint.
  - `resetAllCaseProgress()` — ADMIN demo utility: transactionally resets every
    application back to stage 1 awaiting DWO, rebuilds stage rows from the relief
    catalogue, deletes `transactions` + `escalations`, zeroes
    `treasury_ledger.utilized`, and posts a `RESET_ALL_PROGRESS` audit entry
    (actor ROLE `SYSTEM`).
  - `getApplicationDetail` — joined detail payload (application + relief + case +
    citizen + stages + documents + transactions).
- `officer.ts` — dashboard aggregates (`officialDashboard`: totals, pending by
  SLA with `visibleToRole` + `nextApproverOf`, escalations, overdue), role-scoped
  case lists (`listCasesForOfficial`), and `officerActions` (verify/approve/
  confirm/reject wrappers).
- **Visibility rule** (`visibleToRole`): ADMIN sees all; others only when
  they are the current next approver or have already acted on the stage.

### 6.7 Layer 3 — Disbursement (`disbursement.ts`)
- `disburseStage(appId, stageNumber)`: computes stage amount
  (`amount_total × amount_percent/100`), attempts `pfmsExecutePayment` up to 3x,
  records a `transactions` row, and on success:
  - updates `amount_released`, marks stage approved, appends PFMS receipt to
    `treasury_confirmation`, increments `treasury_ledger.utilized`.
  - sets application `FUND_RELEASED`, or `CLOSED` if it was the final stage.
  - notifies the citizen.
  On failure sets `FAILED`/`RETRY` and leaves the application `UNDER_VERIFICATION`.
- `retryFailedTransactions()` — Treasury can flush the queue; successes update
  ledger/amounts and notify.
- `treasuryStatus()` — ledger + transaction rollups.

### 6.8 Layer 4 — Audit & Grievance
- `audit.ts`:
  - `auditLog(entry)` — SHA-256 of `{ts, actorId, actorRole, actorName, action,
    entityType, entityId, detail, prevHash}` chained to the previous row's hash.
  - `verifyAuditChain()` — walks the chain verifying `prev_hash` continuity.
  - `listAudit(filter)` — paginated/entity-filtered log listing.
- `grievance.ts` — create (auto-assigned DWO), list by role/citizen, update
  (status + resolution), escalate to DM.
- `notifications.ts` — simple `notify(userId, title, body, channel='INAPP')`
  insert; citizens read via `/auth/notifications`.

### 6.9 Layer 5 — Analytics (`analytics.ts`)
- `kpiOverview()` — case/application counts, pending stages, fund totals +
  utilisation %, open escalations, grievance statuses.
- `analyticsPayload()` — relief-wise throughput, average days per stage, SLA
  adherence, by-district, by-stage, officer efficiency, monthly trend.
- `openData()` — public, **unauthenticated**, anonymised statistics (total relief
  released, per-relief aggregates) for transparency.

### 6.10 HTTP routes summary
| Method & path | Access | Purpose |
|---|---|---|
| `GET /api/health` | public | liveness + DB check |
| `GET /api/relief-types` | public | relief catalogue (with stage rules) |
| `GET /api/open-data` | public | anonymised stats |
| `POST /api/auth/register` | public | citizen signup |
| `POST /api/auth/login` | public | login (2FA for officials) |
| `POST /api/auth/aadhaar-login` | public | Aadhaar login |
| `POST /api/auth/verify-otp` | public | complete 2FA |
| `POST /api/auth/citizen-login/step1/step2` | public | 2-step citizen login |
| `GET /api/auth/demo/citizens` | public | demo helper |
| `GET /api/auth/dev-otp/:userId` | auth | latest OTP |
| `GET /api/auth/me` | auth | current user |
| `GET /api/auth/notifications` | auth | my notifications (marks read) |
| `GET /api/auth/qr/tokens` | auth | mint QR tokens |
| `POST /api/auth/qr-login` | public | exchange QR token |
| `GET /api/citizen/screening` | citizen | screening questions |
| `GET /api/citizen/firs?query=aadhaar` | citizen | CCTNS lookup by own Aadhaar |
| `GET /api/citizen/digilocker` | citizen | my vault docs |
| `POST/GET /api/citizen/cases[/:id]` | citizen | create/list/get cases |
| `GET /api/citizen/applications/:id` | citizen | my application detail |
| `POST /api/citizen/cases/:id/apply` | citizen | submit relief application |
| `GET/POST /api/citizen/grievances` | citizen | my grievances / raise |
| `GET /api/official/dashboard` | DWO+ | dashboard aggregate |
| `GET /api/official/cases[/:id]` | DWO+ | case list / case detail (visible only) |
| `POST /api/official/applications/:id/{verify,approve,reject,confirm}` | role-gated | officer actions (verify/approve accept an optional eSign `signature`) |
| `POST /api/official/applications/:id/events` | DWO/DM/ADMIN | simulate external event |
| `POST /api/official/reset-progress` | ADMIN | reset all case progress (demo utility) |
| `GET /api/official/treasury` | TREASURY+ | ledger + tx rollups |
| `POST /api/official/treasury/retry` | TREASURY+ | flush retry queue |
| `GET/POST /api/official/grievances[/:id]` | DWO/DM/ADMIN | handle grievances |
| `GET /api/analytics/kpi` | DWO+ | KPI overview |
| `GET /api/analytics/report` | DWO+ | full analytics payload |
| `POST /api/analytics/refresh-escalations` | ADMIN | run escalation sweep |
| `GET /api/audit` | ADMIN/DM | audit log stream |
| `GET /api/audit/integrity` | ADMIN | hash-chain verification |

---

## 7. Data Layer (`data.zip` → `backend/data/`)

`data.zip` contains raw mock dumps that are unpacked into `backend/data/`:

- **Aadhaar_mock** — JSON map of Aadhaar → personal identity (name, dob, gender,
  phone, email), address, KYC meta, photo URL, biometric flags.
- **cctns_mock** — commented multi-document JSON of FIR records (IIF1 header,
  complainant, victims, accused, IO, acts & sections, final report).
- **ecourt_mock** — court cases keyed by CNR (case details, status, hearing
  history, parties).
- **pfms_mock** — beneficiary accounts (holder, mobile, branch IFSC, status, KYC,
  Aadhaar-seeding, DBT layer, ledger balance).

`dataRegistry.ts` parses these into typed `citizens/firs/courts/pfms` maps and
cross-links them (victim → Aadhaar by name; FIR → court by FIR id; PFMS → citizen
by mobile/name). `mockDpi.ts` then derives deterministic DigiLocker vaults, CCTNS
FIR lookups, eKYC, PFMS validation and payment outcomes from the registry. **The
registry is the only place that must change to load different data.**

Demo identities to know:
- Citizens: Anjali Meena, Vikram Das, Sunita Devi, Rahul Verma, Amit Gupta.
- Officials: dwo.south/dm.south/treasury.south/admin
  (`@samarth.gov.in`) + dwo.north/dm.north. Password `Samarth@123`.
- Citizen password: `Citizen@123`.
- Demo FIRs: `FIR_RJ_2025_0101` … `0105` (Jodhpur 2025 records).

---

## 8. Frontend Walkthrough

### 8.1 Routing & guards (`App.tsx`)
- Public: `/` (Landing), `/login?portal=citizen|officer`, `/qr-login?role=&token=`.
- Citizen zone (`/citizen/*`): Overview, Cases, CaseDetail, Grievances.
- Official zone (`/official/*`): Dashboard, Cases, CaseDetail, Treasury, Grievances,
  Audit, Analytics.
- The **Devices / multi-device QR host page was removed** from navigation and
  routes; QR login still works end-to-end through `/qr-login?role=&token=`
  (tokens are minted server-side by `/auth/qr/tokens`), so the multi-device
  story remains demo-able without the dedicated tab.
- `Guard` component redirects unauthenticated users to `/login` and prevents
  citizens/officials from crossing zones.

### 8.2 Auth state (`context/AuthContext.tsx`)
- Stores JWT in `localStorage` (`sparsh_token`), exposes `user`/`loading` and
  login flows (officer login+OTP, citizen 2-step, QR login, logout, refresh).
- On mount calls `/auth/me`; listens for the global `sparsh:unauthorized` event
  (dispatched by `api/client.ts` on 401) to clear state.

### 8.3 API client (`api/client.ts`)
- Thin `fetch` wrapper: injects `Authorization: Bearer`, JSON body, throws
  `ApiError(status, message)` from `{ error }` responses, and on 401 clears token
  + dispatches `sparsh:unauthorized`.

### 8.4 Live updates (`lib/usePolling.ts`)
- `usePolling(fn, intervalMs=4000)` re-runs on mount, every interval, and on
  window focus/visibility — dashboards thus feel live without websockets.
  `LivePulse` shows a green pulsing "last synced" indicator.

### 8.5 Pages in brief
- **Landing** — marketing page ported verbatim from `landing_page.zip`; styles in
  `landing.css` are scoped under `.sparsh-landing` to avoid leaking. Includes
  particle canvases, animated counters, stepper, section scroll-spy, wave
  dividers. Its stat numbers are decorative demo figures (not live data).
- **Login** — portal switcher; citizen 2-step (email+mobile → Aadhaar) with demo
  account quick-select; officer login with demo accounts + mock-SMS OTP box.
- **QrLogin** — exchanges a scanned QR token for a session; official roles still
  prompt for OTP.
- **Devices** — the "multi-device demo" host page: mints 10-minute role QR codes
  (CITIZEN/DWO/DM) from `/auth/qr/tokens`, renders them, lets you copy the
  `…/qr-login?role=&token=` deep-link.
- **CitizenOverview** — time-aware gradient hero, animated stat cards, tab bar
  (Overview/Applications/Documents/Activity), status donut + relief-funds bar,
  application progress cards, SLA countdown chips, DigiLocker vault, notification
  timeline + grievances feed.
- **CitizenCases** — case cards + "Register new relief" modal that does
  Aadhaar-based FIR lookup from CCTNS and handles duplicates.
- **CaseDetail** — case identity header (eKYC/PFMS), relief application cards,
  and the 3-step apply wizard (relief type → eligibility screening → DigiLocker
  docs + self-declaration). Application cards expand to show stages, documents,
  transactions, rejection reason.
- **CitizenGrievances** — list + raise-grievance modal.
- **OfficialDashboard** — role-aware command centre (per-role tone/label/hints):
  animated totals, status donut + funds bar + animated SLA ring, pending-by-SLA
  table, escalations, role shortcuts; polls every 4s. ADMIN-only "Demo controls"
  card exposes the reset-all-progress utility.
- **OfficialCases** — hero + stats strip + filterable case table with relief
  counts and duplicate flags.
- **OfficialCaseDetail** — brand hero, stage timeline with approval-chain chips
  (rendering stored eSign signatures), officer action panel (verify/approve/
  confirm/reject + simulate event) where DWO/DM actions open the **eSign modal**,
  documents and transfers.
- **Treasury** — teal hero, animated money stats, ledger utilisation bars,
  transaction status rollup, retry-queue flush button. Access restricted to
  TREASURY/ADMIN client-side (server enforces too).
- **OfficialGrievances** — assigned tickets; mark in-progress/resolve/escalate.
- **Audit** — violet hero, hash-chained audit stream with action filters and an
  integrity check button (ADMIN only; DM can read the stream).
- **Analytics** — violet hero + animated KPIs + recharts (status pie, relief bar,
  stage-timing bar, district bar) + officer efficiency table.

### 8.6 Styling conventions
- Light theme with a custom reversed `slate` scale (low index = dark text, high
  index = light surfaces) plus `brand` (gov blue), `saffron`, `tealx` palettes.
- Shared component classes in `index.css`: `glass`, `btn-primary/ghost/success/
  danger`, `input`, `label`, `chip`, `card-title`, `th`/`td`, `text-grad`,
  `.aurora`, `.bg-grid`, `.grad-border`.
- Shared React primitives in `components/ui.tsx`: `Spinner`, `Loading`,
  `EmptyState`, `Modal`, `PageHeader`, `StatusBadge`, `StatCard`, `ToastProvider`
  + `useToast`.

---

## 9. Running, Building, Testing

Prerequisites: Node.js (modern, ESM-capable) and PostgreSQL running locally with
a database/user matching `config.ts` defaults (or env vars).

### One-command local run

```bash
# From repo root:
./start.sh              # Linux / macOS / WSL / Git Bash (Windows: start.bat)

# Optional flags / env:
./start.sh --reset      # drop + rebuild + reseed the database before starting
FORCE_RESET=1 ./start.sh
PGPASSWORD=secret ./start.sh   # if your postgres password differs
```

`start.sh` does everything automatically: checks Node 18+/PostgreSQL, starts
PostgreSQL if it is installed but not running, creates the `samarth` database if
missing, installs npm dependencies (only when not already installed), runs
`db:init`, and then starts backend + frontend together (Ctrl+C stops both).
System prerequisites are documented in `requirements.txt`.

### Manual steps (equivalent to what the script does)

```bash
# From repo root:
npm install                       # installs root deps
cd backend && npm install         # backend deps
cd ../frontend && npm install     # frontend deps

# Prepare DB (schema + seed):
npm run db:init                    # or: npm run db:init -- --force to rebuild
# Alternative full reset:
cd backend && npm run db:init -- --force

# Run dev (two servers):
npm run dev                        # concurrently: backend :4000 + frontend :5173
# or separately: npm run dev:server  /  npm run dev:web

# Production build:
npm run build                      # tsc backend + tsc/vite build frontend

# Tests (needs PostgreSQL; resets + reseeds the DB):
npm test                           # backend vitest run
npm run e2e                        # backend/test/e2e.test.ts only
```

Env vars (backend): `PORT`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
`PGDATABASE`, `JWT_SECRET`, `QR_SECRET`, `NODE_ENV`, `DATA_DIR`.

### Tests coverage (`backend/test/e2e.test.ts`)
- Layer 0: registration/login, 2FA enforcement, bad credentials + role crossing,
  2-step citizen login (wrong phone/Aadhaar rejected), demo citizens endpoint.
- Layer 1: Master Case Object assembly, FIR/Aadhaar mismatch (403), unknown FIR
  (400), duplicate flagging, Aadhaar-based FIR lookup, required-doc validation,
  disqualifying screening + missing declaration.
- Layer 2+3: full 3-stage relief to fund release (event gating verified: a
  premature stage-2 action is 409), and no-disbursement-without-human-approval.
- Layer 4: audit chain integrity, grievance raise/resolve.
- Layer 5: KPI/report, unauthenticated open-data.
- Resilience: treasury retry queue flush.
- Multi-device QR: token minting, citizen QR session, DWO QR still requires 2FA,
  forged tokens rejected.

---

## 10. Observations & Known Issues (current state)

These are things to keep in mind when changing code:

1. **Escalation sweep is lazy.** `refreshEscalations()` only runs when an official
   hits dashboard/KPI/report or an ADMIN manually calls
   `POST /api/analytics/refresh-escalations`. There is no scheduler. SLA breaches
   will not appear until someone opens a dashboard (see Future Work #2).
2. **`seed.ts` idempotence relies on empty `cases`.** If any case row exists, the
   whole demo-case seeding is skipped (count guard). Officials/citizens are
   upserted independently, so a partially seeded DB can behave unexpectedly.
3. **`intake.ts:111-112` has a dead call** — `digilockerList('')` with its result
   discarded (`void vault`) before the real lookup below. Harmless but removable.
4. **`mockDpi.pfmsExecutePayment` failure counter is module-global** — every 7th
   call fails across the whole process. Tests accept both 200/500 on the retry
   flush because of this nondeterminism.
5. **OTP has no rate-limit / throttling** and is retrievable via
   `/auth/dev-otp/:userId` (demo-only). `otp_codes` rows for a user are deleted
   before issuing a new OTP. (`verify-otp` now validates `userId`/`code` and
   returns 400 instead of letting a bad id reach Postgres and crash the process.)
6. **Payments are synchronous** (3 inline attempts). There is no real async job
   queue; the "queue" is just `transactions` rows in FAILED/RETRY state.
7. **Officer efficiency analytics** (`officerEfficiency`) joins `users ×
   workflow_stages` on `TRUE` — it counts stage actions attributed to every
   officer role who has any action; verification counts are stage-level, not
   per-user attribution.
8. **Frontend filters/lists are client-side or capped** — audit uses `limit=200`,
   pending list slices to 50, cases to 100. There is no server pagination.
9. **No refresh tokens / token revocation** — JWT is valid 12h; logout is purely
   client-side token removal.
10. **`findUserByAadhaar`** loads all users then filters in JS (fine for demo,
    should be a SQL lookup for scale).
11. **Demo/landing figures are static** (e.g., "247.5 Cr disbursed") — not wired
    to `/api/open-data`.
12. **Grievances have no SLA/escalation timer**; escalation is manual.
13. **Manual document upload is not implemented** — `documents.source` supports
    `MANUAL`, but only `DIGILOCKER` is exercised.
14. **The data files in `backend/data/` are copied from `data.zip`** — if the zip
    changes, they must be re-unpacked (see `config.dataDir`).
15. **eSign is demo-only.** DWO verify / DM approve capture a freehand signature
    whose SVG path is stored in the stage approval JSONB and audit detail. It is
    not a digital signature certificate; production would need DSC/HSM (see
    Future Work #6).

---

## 11. Future Work / Roadmap

The items below are the agreed-upon backlog for improving SPARSH/SAMARTH. They are
listed roughly in priority order and should be implemented as follow-up tasks. Any
new task should update this section and reference the relevant existing modules.

### High priority
1. **Scheduled background jobs (cron).** Introduce a scheduler (e.g. `node-cron`)
   to run `refreshEscalations()` and `retryFailedTransactions()` on a timer
   instead of relying on lazy dashboard calls. Add a small admin endpoint to view
   the last run status. Touches `workflow.ts`, `disbursement.ts`, `index.ts`.
2. **DB migrations & versioned schema.** Replace the monolithic idempotent
   `schema.sql` replay with a migration runner (e.g. `node-pg-migrate`) so schema
   changes are tracked/rollbackable. Preserve `npm run db:init` behaviour.
3. **Server pagination.** Add `limit`/`offset` (and filters) to cases, audit log,
   grievances, transactions, and the official dashboard pending list instead of
   the current client-side caps.
4. **Real SMS/email gateway abstraction.** Replace mock OTP/logged "SMS" with a
   provider interface (channel adapters) while keeping the mock for demo. Applies
   to `auth.ts`, `notifications.ts`.
5. **Real DPI integration stubs.** Define clean interfaces behind `mockDpi.ts`
   (CCTNS, eCourts, UIDAI, DigiLocker, PFMS) so production adapters can be
   dropped in without changing Layer 1/3 callers.

### Medium priority
6. **Real eSign integration (certificate-based).** A demo freehand eSign is done
   (DWO verify / DM approve draw + store an SVG signature path in the stage
   approval JSONB and audit log; rendered back on the approval chips). Production
   would replace the freehand path with a DSC/HSM-backed signature reference in
   the same fields.
7. **Rate limiting & auth hardening.** Add request rate limiting (esp. login/OTP),
   JWT refresh + revocation, secret rotation, and move OTP to a proper TOTP/HSM
   design for non-demo operation.
8. **Async payment job queue.** Convert `disburseStage` to enqueue a background
   job (BullMQ/in-process) with proper idempotency keys so `txid` generation and
   retry are deduplicated; keep the synchronous path for tests/demo.
9. **Grievance SLA & auto-escalation.** Add `sla_due_at` on grievances and a sweep
   that escalates OPEN → DM → COLLECTOR automatically; wire into the cron from #1.
10. **Manual document upload flow.** Implement `MANUAL` source uploads (multipart)
    with re-verification by DWO and hash storage; extend the apply wizard.
11. **i18n / multilingual UI (Bhashini).** The landing page claims 12 languages +
    voice assistance; add an i18n layer and a language switcher as a first step.

### Lower priority / polish
12. **Live updates via SSE/WebSockets.** Replace 4-second polling
    (`usePolling`) on dashboards with server-sent events for a snappier demo.
13. **Docker Compose** for PostgreSQL + backend + frontend so the project runs
    with one command anywhere.
14. **Observability.** Structured logging (pino), request IDs, Prometheus-style
    metrics for the audit chain size, disbursement totals, escalation counts.
15. **Admin user-management UI** to create/disable officers and reset passwords
    (backend support partially exists via `enabled`).
16. **Data export for RTI/officials** — CSV/JSON export endpoints for audit logs
    and disbursement summaries.
17. **Improve `officerEfficiency` analytics** to attribute actions per officer
    accurately (store actor id on stage approval JSONB, already present).
18. **SQL-ify `findUserByAadhaar`** and remove the in-memory full-table scan.
19. **Wire landing page stats to live `/api/open-data`** so marketing figures
    reflect real (anonymised) data.
20. **Unit tests per layer** in addition to the e2e suite (workflow guards,
    escalation logic, retry idempotency, hash-chain integrity).

---

*Generated context snapshot — kept up to date as the codebase evolves. When adding
features, update Section 11 and note any design changes in Sections 2/6/7/8.*
