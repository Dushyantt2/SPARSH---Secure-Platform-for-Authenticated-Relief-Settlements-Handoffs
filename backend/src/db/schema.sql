-- SAMARTH DBT System - Core Schema (PostgreSQL)
-- Mirrors the 6-layer architecture: UI/RBAC, Ingestion, Workflow, Disbursement, Audit, Analytics

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Layer 0: Users & Role-Based Access Control
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('CITIZEN','DWO','DM','TREASURY','ADMIN')),
  district      TEXT NOT NULL DEFAULT 'Jodhpur',
  aadhaar       TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT '2FA',
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Layer 1: Relief catalogue, cases, documents
-- ============================================================
CREATE TABLE IF NOT EXISTS relief_types (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('CASE_LINKED','BENEFIT_LINKED')),
  description   TEXT NOT NULL,
  required_docs TEXT[] NOT NULL DEFAULT '{}',
  sla_days      INTEGER NOT NULL DEFAULT 15,
  stages        JSONB NOT NULL -- [ {stage,name,percent,trigger,approvals,amountLabel} ]
);

CREATE TABLE IF NOT EXISTS cases (
  id             SERIAL PRIMARY KEY,
  case_number    TEXT NOT NULL UNIQUE,          -- unified Case ID
  citizen_id     INTEGER NOT NULL REFERENCES users(id),
  fir_number     TEXT NOT NULL,
  fir_date       DATE NOT NULL,
  district       TEXT NOT NULL,
  police_station TEXT NOT NULL,
  ipc_sections   TEXT[] NOT NULL DEFAULT '{}',
  master_object  JSONB NOT NULL DEFAULT '{}',   -- unified Master Case Object
  is_duplicate   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relief_applications (
  id                SERIAL PRIMARY KEY,
  case_id           INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  relief_type_id    INTEGER NOT NULL REFERENCES relief_types(id),
  status            TEXT NOT NULL DEFAULT 'SUBMITTED'
                    CHECK (status IN ('SUBMITTED','UNDER_VERIFICATION','APPROVED','REJECTED','FUND_RELEASED','CLOSED')),
  current_stage     INTEGER NOT NULL DEFAULT 1,
  amount_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_released   NUMERIC(14,2) NOT NULL DEFAULT 0,
  aadhaar_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  bank_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  screening         JSONB NOT NULL DEFAULT '{}',   -- eligibility questionnaire answers
  declaration       BOOLEAN NOT NULL DEFAULT FALSE, -- citizen self-declaration consent
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, relief_type_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES relief_applications(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  doc_type        TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('DIGILOCKER','MANUAL')),
  hash            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'UPLOADED'
                  CHECK (status IN ('UPLOADED','VERIFIED','INVALID')),
  verified_at     TIMESTAMPTZ,
  verified_by     INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Layer 2: Workflow stages, SLA, escalations, notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_stages (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES relief_applications(id) ON DELETE CASCADE,
  stage_number    INTEGER NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','IN_PROGRESS','APPROVED','REJECTED')),
  amount_percent  INTEGER NOT NULL DEFAULT 0,
  trigger_event   TEXT,
  trigger_met     BOOLEAN NOT NULL DEFAULT FALSE,
  dwo_verification JSONB,
  dm_approval      JSONB,
  treasury_confirmation JSONB,
  sla_due_at      TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  UNIQUE (application_id, stage_number)
);

CREATE TABLE IF NOT EXISTS escalations (
  id            SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES relief_applications(id) ON DELETE CASCADE,
  level         TEXT NOT NULL, -- COLLECTOR | STATE_SECRETARY
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'OPEN',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'INAPP', -- INAPP | SMS | EMAIL
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Layer 3: Financial disbursement (PFMS)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES relief_applications(id) ON DELETE CASCADE,
  stage_number    INTEGER NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  txid            TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','SUCCESS','FAILED','RETRY')),
  failure_reason  TEXT,
  attempt_count   INTEGER NOT NULL DEFAULT 1,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS treasury_ledger (
  id            SERIAL PRIMARY KEY,
  district      TEXT NOT NULL,
  relief_type_id INTEGER NOT NULL REFERENCES relief_types(id),
  allocated     NUMERIC(14,2) NOT NULL DEFAULT 0,
  utilized      NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (district, relief_type_id)
);

-- ============================================================
-- Layer 4: Audit (hash-chained, append-only) + Grievances
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    INTEGER REFERENCES users(id),
  actor_role  TEXT NOT NULL,
  actor_name  TEXT NOT NULL DEFAULT 'system',
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}',
  prev_hash   TEXT,
  hash        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS grievances (
  id              SERIAL PRIMARY KEY,
  ref             TEXT NOT NULL UNIQUE,
  citizen_id      INTEGER NOT NULL REFERENCES users(id),
  application_id  INTEGER REFERENCES relief_applications(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','ESCALATED')),
  assigned_role   TEXT,
  resolution      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Supporting indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_apps_status   ON relief_applications(status);
CREATE INDEX IF NOT EXISTS idx_apps_case     ON relief_applications(case_id);
CREATE INDEX IF NOT EXISTS idx_stages_app    ON workflow_stages(application_id);
CREATE INDEX IF NOT EXISTS idx_tx_app        ON transactions(application_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_griev_citizen ON grievances(citizen_id);
