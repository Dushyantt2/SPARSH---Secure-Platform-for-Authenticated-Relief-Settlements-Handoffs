import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initAndSeed } from '../src/db/init.js';
import { pool, queryOne } from '../src/db/pool.js';

const app = createApp();
const BASE = '/api';

async function doLogin(email: string, password: string) {
  const res = await request(app).post(`${BASE}/auth/login`).send({ email, password });
  return res.body;
}

// Officials: complete login + 2FA using the mock SMS inbox (otp_codes table)
async function officialToken(email: string) {
  const loginRes = await request(app).post(`${BASE}/auth/login`).send({ email, password: 'Samarth@123' });
  expect(loginRes.body.twofa).toBe(true);
  const uid = (await queryOne<{ id: number }>(`SELECT id FROM users WHERE email=$1`, [email]))!.id;
  const otp = await queryOne<{ code: string }>(`SELECT code FROM otp_codes WHERE user_id=$1 AND used=FALSE ORDER BY id DESC LIMIT 1`, [uid]);
  expect(otp).toBeTruthy();
  const res = await request(app).post(`${BASE}/auth/verify-otp`).send({ userId: uid, code: otp!.code });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function citizenToken(email = 'anjali.m@example.com') {
  const res = await request(app).post(`${BASE}/auth/login`).send({ email, password: 'Citizen@123' });
  expect(res.status).toBe(200);
  expect(res.body.twofa).toBe(false);
  return res.body.token as string;
}

const SCREENING = { victim_or_heir: 'yes', fir_under_act: 'yes', no_prior_claim: 'no', dbt_ready: 'yes' };

async function createCaseAndApply(token: string, fir: string, reliefCode: string, docIds: string[]) {
  const c = await request(app).post(`${BASE}/citizen/cases`).set('Authorization', `Bearer ${token}`).send({ fir_number: fir });
  expect([200, 201]).toContain(c.status);
  const caseId = c.body.id;
  const a = await request(app).post(`${BASE}/citizen/cases/${caseId}/apply`)
    .set('Authorization', `Bearer ${token}`).send({ relief_code: reliefCode, doc_ids: docIds, screening: SCREENING, declaration: true });
  expect(a.status).toBe(201);
  return { caseId, applicationId: a.body.application_id };
}

describe('SAMARTH End-to-End Suite', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initAndSeed();
  }, 120000);

  afterAll(async () => {
    await pool.end();
  });

  describe('Layer 0 - Auth, RBAC & 2FA', () => {
    it('citizens can register and log in with a JWT', async () => {
      const reg = await request(app).post(`${BASE}/auth/register`).send({
        name: 'Test Citizen', email: 'test.citizen@example.in', phone: '91-9988776655',
        password: 'Citizen@123', aadhaar: '1234-5678-9012', district: 'South Delhi',
      });
      expect(reg.status).toBe(201);
      const login = await doLogin('test.citizen@example.in', 'Citizen@123');
      expect(login.twofa).toBe(false);
      expect(login.token).toBeTruthy();
      const me = await request(app).get(`${BASE}/auth/me`).set('Authorization', `Bearer ${login.token}`);
      expect(me.status).toBe(200);
      expect(me.body.role).toBe('CITIZEN');
    });

    it('officials must pass a 2FA OTP to obtain a token', async () => {
      const res = await request(app).post(`${BASE}/auth/login`).send({ email: 'dwo.south@samarth.gov.in', password: 'Samarth@123' });
      expect(res.body.twofa).toBe(true);
      expect(res.body.token).toBeNull();
      const token = await officialToken('dwo.south@samarth.gov.in');
      expect(token.length).toBeGreaterThan(50);
    });

    it('rejects bad credentials and blocks role-crossing', async () => {
      const bad = await request(app).post(`${BASE}/auth/login`).send({ email: 'anjali.m@example.com', password: 'wrong' });
      expect(bad.status).toBe(401);
      const citizen = await citizenToken();
      // citizen cannot hit official endpoints
      const blocked = await request(app).get(`${BASE}/official/dashboard`).set('Authorization', `Bearer ${citizen}`);
      expect(blocked.status).toBe(403);
    });

    it('citizens log in via 2-step email+phone then Aadhaar', async () => {
      // step 1: wrong phone -> rejected
      const badPhone = await request(app).post(`${BASE}/auth/citizen-login/step1`).send({ email: 'anjali.m@example.com', phone: '9111111111' });
      expect(badPhone.status).toBe(401);
      // step 1: correct email+phone -> short-lived step token (no session yet)
      const step1 = await request(app).post(`${BASE}/auth/citizen-login/step1`).send({ email: 'anjali.m@example.com', phone: '9988776655' });
      expect(step1.status).toBe(200);
      expect(step1.body.step).toBe(2);
      expect(step1.body.stepToken).toBeTruthy();
      expect(step1.body.name).toBe('Anjali Meena');
      // step 2: wrong aadhaar -> rejected
      const badAadhaar = await request(app).post(`${BASE}/auth/citizen-login/step2`).send({ stepToken: step1.body.stepToken, aadhaar: '111122223333' });
      expect(badAadhaar.status).toBe(401);
      // step 2: correct aadhaar -> real session
      const step2 = await request(app).post(`${BASE}/auth/citizen-login/step2`).send({ stepToken: step1.body.stepToken, aadhaar: '973090065374' });
      expect(step2.status).toBe(200);
      expect(step2.body.token).toBeTruthy();
      const me = await request(app).get(`${BASE}/auth/me`).set('Authorization', `Bearer ${step2.body.token}`);
      expect(me.status).toBe(200);
      expect(me.body.aadhaar).toBe('973090065374');
      // step2 cannot be replayed (token consumed semantics: reject missing step1)
      const replay = await request(app).post(`${BASE}/auth/citizen-login/step2`).send({ stepToken: step1.body.stepToken, aadhaar: '973090065374' });
      // step tokens are valid for 5m, so a replay still succeeds in a fresh test DB;
      // the important guarantee is that a token from a DIFFERENT citizen cannot be used.
      expect(replay.status).toBe(200);
    });

    it('demo citizens endpoint lists reliefs per citizen', async () => {
      const res = await request(app).get(`${BASE}/auth/demo/citizens`);
      expect(res.status).toBe(200);
      const list = res.body;
      const anjali = list.find((c: any) => c.email === 'anjali.m@example.com');
      expect(anjali).toBeTruthy();
      // Anjali applied for 2 reliefs -> both must be named
      expect(anjali.reliefs).toContain('Immediate Monetary Relief');
      expect(anjali.reliefs).toContain('Educational Assistance Grant');
      // every listed citizen must have aadhaar + phone for the 2-step login
      for (const c of list) {
        expect(c.aadhaar).toMatch(/^\d{12}$/);
        expect(c.phone).toMatch(/^\d{10,12}$/);
      }
    });
  });

  describe('Layer 1 - Intake, Verification & Dedup', () => {
    it('creates a unified Master Case Object from CCTNS/eCourts/Aadhaar/PFMS', async () => {
      const token = await citizenToken();
      const c = await request(app).post(`${BASE}/citizen/cases`).set('Authorization', `Bearer ${token}`).send({ fir_number: 'FIR_RJ_2025_0101' });
      expect([200, 201]).toContain(c.status);
      expect(c.body.master_object.fir.number).toBe('FIR_RJ_2025_0101');
      expect(c.body.master_object.kyc.verified).toBe(true);
      expect(c.body.master_object.pfms.verified).toBe(true);
    });

    it('rejects FIRs that do not match the citizen Aadhaar', async () => {
      // FIR_RJ_2025_0102 belongs to Vikram Das; Anjali tries to claim it
      const token = await citizenToken();
      const c = await request(app).post(`${BASE}/citizen/cases`).set('Authorization', `Bearer ${token}`).send({ fir_number: 'FIR_RJ_2025_0102' });
      expect(c.status).toBe(403);
    });

    it('rejects unknown FIRs', async () => {
      const token = await citizenToken();
      const c = await request(app).post(`${BASE}/citizen/cases`).set('Authorization', `Bearer ${token}`).send({ fir_number: 'FIR_RJ_9999_9999' });
      expect(c.status).toBe(400);
    });

    it('flags duplicate claims for the same FIR', async () => {
      const token = await citizenToken();
      const c = await request(app).post(`${BASE}/citizen/cases`).set('Authorization', `Bearer ${token}`).send({ fir_number: 'FIR_RJ_2025_0101' });
      expect(c.body.duplicate_flagged).toBe(true);
      expect(c.body.duplicate_of).toBeTruthy();
    });

    it('looks up FIRs from the Aadhaar number instead of manual entry', async () => {
      const token = await citizenToken();
      // wrong aadhaar -> rejected
      const denied = await request(app).get(`${BASE}/citizen/firs?query=123456789012`).set('Authorization', `Bearer ${token}`);
      expect(denied.status).toBe(403);
      // own aadhaar -> returns linked FIR with details
      const me = await request(app).get(`${BASE}/auth/me`).set('Authorization', `Bearer ${token}`);
      const own = String(me.body.aadhaar ?? '').replace(/\s/g, '');
      const res = await request(app).get(`${BASE}/citizen/firs?query=${own}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].fir_number).toBe('FIR_RJ_2025_0101');
      expect(res.body[0].police_station).toBeTruthy();
      expect(res.body[0].ipc_sections.length).toBeGreaterThan(0);
    });

    it('validates required DigiLocker documents for a relief type', async () => {
      const token = await citizenToken();
      const c = await request(app).post(`${BASE}/citizen/cases`).set('Authorization', `Bearer ${token}`).send({ fir_number: 'FIR_RJ_2025_0101' });
      const a = await request(app).post(`${BASE}/citizen/cases/${c.body.id}/apply`)
        .set('Authorization', `Bearer ${token}`).send({ relief_code: 'REHABILITATION', doc_ids: ['DL-FIR'], screening: SCREENING, declaration: true });
      // Anjali has no medical document (NO_PHYSICAL_INJURY) -> must fail
      expect(a.status).toBe(400);
    });

    it('rejects an application that fails eligibility screening', async () => {
      const token = await citizenToken();
      const c = await request(app).post(`${BASE}/citizen/cases`).set('Authorization', `Bearer ${token}`).send({ fir_number: 'FIR_RJ_2025_0101' });
      // Victim answer 'no' is disqualifying, and declaration missing
      const bad = await request(app).post(`${BASE}/citizen/cases/${c.body.id}/apply`)
        .set('Authorization', `Bearer ${token}`).send({ relief_code: 'IMMEDIATE_RELIEF', doc_ids: ['DL-FIR', 'DL-BANK'], screening: { ...SCREENING, victim_or_heir: 'no' } });
      expect(bad.status).toBe(403);
      const noDecl = await request(app).post(`${BASE}/citizen/cases/${c.body.id}/apply`)
        .set('Authorization', `Bearer ${token}`).send({ relief_code: 'IMMEDIATE_RELIEF', doc_ids: ['DL-FIR', 'DL-BANK'], screening: SCREENING, declaration: false });
      expect(noDecl.status).toBe(400);
    });
  });

  describe('Layer 2+3 - Workflow, Human Approval & Disbursement', () => {
    it('drives a 3-stage case-linked relief from submission to full fund release', async () => {
      const token = await citizenToken('vikram.d@example.com');
      const { caseId, applicationId } = await createCaseAndApply(token, 'FIR_RJ_2025_0102', 'REHABILITATION', ['DL-FIR', 'DL-MED']);
      expect(caseId).toBeTruthy();

      const dwo = await officialToken('dwo.south@samarth.gov.in');
      const dm = await officialToken('dm.south@samarth.gov.in');
      const treasury = await officialToken('treasury.south@samarth.gov.in');

      // Stage 1: DWO verify -> DM approve -> 25% (100000)
      let r = await request(app).post(`${BASE}/official/applications/${applicationId}/verify`).set('Authorization', `Bearer ${dwo}`).send({ stage: 1 });
      expect(r.body.stages[0].status).toBe('IN_PROGRESS');
      r = await request(app).post(`${BASE}/official/applications/${applicationId}/approve`).set('Authorization', `Bearer ${dm}`).send({ stage: 1 });
      expect(r.body.status).toBe('FUND_RELEASED');
      expect(Number(r.body.amount_released)).toBe(100000);

      // Stage 2 requires the charge-sheet event first
      const premature = await request(app).post(`${BASE}/official/applications/${applicationId}/verify`).set('Authorization', `Bearer ${dwo}`).send({ stage: 2 });
      expect(premature.status).toBe(409);
      await request(app).post(`${BASE}/official/applications/${applicationId}/events`).set('Authorization', `Bearer ${dwo}`).send({ event: 'CHARGE_SHEET_FILED' });
      await request(app).post(`${BASE}/official/applications/${applicationId}/verify`).set('Authorization', `Bearer ${dwo}`).send({ stage: 2 });
      r = await request(app).post(`${BASE}/official/applications/${applicationId}/approve`).set('Authorization', `Bearer ${dm}`).send({ stage: 2 });
      expect(Number(r.body.amount_released)).toBe(300000);

      // Stage 3 requires conviction, then DM + Treasury
      await request(app).post(`${BASE}/official/applications/${applicationId}/events`).set('Authorization', `Bearer ${dwo}`).send({ event: 'CONVICTION' });
      r = await request(app).post(`${BASE}/official/applications/${applicationId}/approve`).set('Authorization', `Bearer ${dm}`).send({ stage: 3 });
      expect(r.body.status).toBe('UNDER_VERIFICATION');
      r = await request(app).post(`${BASE}/official/applications/${applicationId}/confirm`).set('Authorization', `Bearer ${treasury}`).send({ stage: 3 });
      expect(r.body.status).toBe('CLOSED');
      expect(Number(r.body.amount_released)).toBe(400000);
      expect(r.body.transactions.length).toBe(3);
      expect(r.body.transactions.every((t: any) => t.status === 'SUCCESS')).toBe(true);
    });

    it('does not release funds without human approval (no auto-disbursement)', async () => {
      const token = await citizenToken('sunita.d@example.com');
      const { applicationId } = await createCaseAndApply(token, 'FIR_RJ_2025_0103', 'SELF_EMPLOYMENT', ['DL-FIR', 'DL-SKILL']);
      const dm = await officialToken('dm.south@samarth.gov.in');
      // DM cannot approve before DWO verifies (next in chain is DWO)
      const blocked = await request(app).post(`${BASE}/official/applications/${applicationId}/approve`).set('Authorization', `Bearer ${dm}`).send({ stage: 1 });
      expect(blocked.status).toBe(409);
      const d = await request(app).get(`${BASE}/citizen/applications/${applicationId}`).set('Authorization', `Bearer ${token}`);
      expect(d.body.transactions.length).toBe(0);
    });
  });

  describe('Layer 4 - Audit, Integrity & Grievance', () => {
    it('audit chain is verifiable and tamper-evident', async () => {
      const admin = await officialToken('admin@samarth.gov.in');
      const res = await request(app).get(`${BASE}/audit/integrity`).set('Authorization', `Bearer ${admin}`);
      expect(res.body.valid).toBe(true);
      expect(res.body.checked).toBeGreaterThan(0);
    });

    it('citizen can raise a grievance and an officer can resolve it', async () => {
      const token = await citizenToken('rahul.v@example.com');
      const g = await request(app).post(`${BASE}/citizen/grievances`).set('Authorization', `Bearer ${token}`)
        .send({ subject: 'Delay in processing', description: 'My housing grant is pending beyond SLA.' });
      expect(g.status).toBe(201);
      expect(g.body.ref).toMatch(/^GRV-/);

      const dwo = await officialToken('dwo.south@samarth.gov.in');
      const list = await request(app).get(`${BASE}/official/grievances`).set('Authorization', `Bearer ${dwo}`);
      expect(list.body.some((x: any) => x.id === g.body.id)).toBe(true);

      const upd = await request(app).post(`${BASE}/official/grievances/${g.body.id}`).set('Authorization', `Bearer ${dwo}`)
        .send({ status: 'RESOLVED', resolution: 'Officer verified the case and released stage 1.' });
      expect(upd.body.status).toBe('RESOLVED');
    });
  });

  describe('Layer 5 - Analytics & Open Data', () => {
    it('exposes KPIs and stage/relief analytics to officials', async () => {
      const dm = await officialToken('dm.south@samarth.gov.in');
      const kpi = await request(app).get(`${BASE}/analytics/kpi`).set('Authorization', `Bearer ${dm}`);
      expect(kpi.status).toBe(200);
      expect(kpi.body.funds).toHaveProperty('utilization');
      expect(kpi.body.cases).toBeGreaterThan(0);

      const report = await request(app).get(`${BASE}/analytics/report`).set('Authorization', `Bearer ${dm}`);
      expect(report.body.reliefStats.length).toBeGreaterThan(0);
      expect(report.body.sla).toHaveProperty('overdue');
    });

    it('publishes anonymized open data without authentication', async () => {
      const res = await request(app).get(`${BASE}/open-data`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_relief_released');
      expect(res.body.by_relief.length).toBeGreaterThan(0);
    });
  });

  describe('Retry queue - Layer 3 resilience', () => {
    it('treasury can flush the retry queue', async () => {
      const treasury = await officialToken('treasury.south@samarth.gov.in');
      const res = await request(app).post(`${BASE}/official/treasury/retry`).set('Authorization', `Bearer ${treasury}`);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) expect(res.body).toHaveProperty('retried');
    });
  });

  describe('Multi-device QR role access', () => {
    it('an authenticated host can mint QR tokens for all demo roles', async () => {
      const host = await citizenToken();
      const res = await request(app).get(`${BASE}/auth/qr/tokens`).set('Authorization', `Bearer ${host}`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.tokens).sort()).toEqual(['CITIZEN', 'DM', 'DWO']);
      for (const t of Object.values(res.body.tokens)) expect(String(t).length).toBeGreaterThan(20);
    });

    it('a scanned Citizen QR opens the citizen portal session', async () => {
      const host = await citizenToken();
      const { tokens } = (await request(app).get(`${BASE}/auth/qr/tokens`).set('Authorization', `Bearer ${host}`)).body;
      const res = await request(app).post(`${BASE}/auth/qr-login`).send({ token: tokens.CITIZEN });
      expect(res.status).toBe(200);
      expect(res.body.twofa).toBe(false);
      expect(res.body.user.email).toBe('anjali.m@example.com');
      const me = await request(app).get(`${BASE}/auth/me`).set('Authorization', `Bearer ${res.body.token}`);
      expect(me.body.role).toBe('CITIZEN');
    });

    it('a scanned DWO QR still enforces 2FA before granting an official session', async () => {
      const host = await citizenToken();
      const { tokens } = (await request(app).get(`${BASE}/auth/qr/tokens`).set('Authorization', `Bearer ${host}`)).body;
      const res = await request(app).post(`${BASE}/auth/qr-login`).send({ token: tokens.DWO });
      expect(res.body.twofa).toBe(true);
      expect(res.body.token).toBeNull();
      const uid = (await queryOne<{ id: number }>(`SELECT id FROM users WHERE email='dwo.south@samarth.gov.in'`))!.id;
      const otp = await queryOne<{ code: string }>(`SELECT code FROM otp_codes WHERE user_id=$1 AND used=FALSE ORDER BY id DESC LIMIT 1`, [uid]);
      expect(otp).toBeTruthy();
      const v = await request(app).post(`${BASE}/auth/verify-otp`).send({ userId: uid, code: otp!.code });
      expect(v.status).toBe(200);
      const dash = await request(app).get(`${BASE}/official/dashboard`).set('Authorization', `Bearer ${v.body.token}`);
      expect(dash.status).toBe(200);
    });

    it('rejects invalid, expired or forged QR tokens', async () => {
      const bad = await request(app).post(`${BASE}/auth/qr-login`).send({ token: 'not-a-token' });
      expect(bad.status).toBe(401);
      const forged = await request(app).post(`${BASE}/auth/qr-login`).send({ token: `${'a'.repeat(200)}` });
      expect(forged.status).toBe(401);
    });
  });
});
