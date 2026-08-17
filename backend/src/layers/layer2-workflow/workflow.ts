import { query, queryOne, tx, type QueryFn } from '../../db/pool.js';
import { RELIEF_TYPES } from './catalogue.js';
import { auditLog } from '../layer4-audit-grievance/audit.js';
import { disburseStage } from '../layer3-disbursement/disbursement.js';
import { notify } from '../layer4-audit-grievance/notifications.js';
import type { Role, ReliefTypeRow } from '../../types.js';

export async function getReliefType(code: string): Promise<ReliefTypeRow | null> {
  const row = await queryOne<ReliefTypeRow>(
    `SELECT * FROM relief_types WHERE code = $1`, [code]
  );
  return row;
}

export async function listReliefTypes() {
  return query(`SELECT * FROM relief_types ORDER BY id`);
}

// ----- create workflow stages for an application ------------------
export async function createStages(q: QueryFn, appId: number, reliefType: ReliefTypeRow) {
  for (const s of reliefType.stages) {
    await q(
      `INSERT INTO workflow_stages
         (application_id, stage_number, name, amount_percent, trigger_event, sla_due_at)
       VALUES ($1,$2,$3,$4,$5,
         CASE WHEN $5 IN ('FIR_REGISTERED','APPLICATION') THEN now() + make_interval(days => $6::int) ELSE NULL END)`,
      [appId, s.stage, s.name, s.percent, s.trigger, reliefType.sla_days]
    );
  }
}

// ----- start a stage (set IN_PROGRESS + SLA deadline) --------------
export async function startStage(appId: number, stageNumber: number) {
  const stage = await queryOne<any>(
    `SELECT ws.*, rt.sla_days FROM workflow_stages ws
       JOIN relief_applications ra ON ra.id = ws.application_id
       JOIN relief_types rt ON rt.id = ra.relief_type_id
     WHERE ws.application_id=$1 AND ws.stage_number=$2`, [appId, stageNumber]
  );
  if (!stage) throw Object.assign(new Error('Stage not found'), { status: 404 });
  await query(
    `UPDATE workflow_stages SET status='IN_PROGRESS', started_at=now(),
        sla_due_at = now() + make_interval(days => $2::int)
      WHERE id=$1 AND status='PENDING'`,
    [stage.id, stage.sla_days]
  );
  await query(`UPDATE relief_applications SET status='UNDER_VERIFICATION', current_stage=$2, updated_at=now() WHERE id=$1`,
    [appId, stageNumber]);
}

// ----- generic action guard ---------------------------------------
async function getStageContext(appId: number, stageNumber: number) {
  const stage = await queryOne<any>(
    `SELECT ws.*, rt.stages AS relief_stages, rt.name AS relief_name
     FROM workflow_stages ws
       JOIN relief_applications ra ON ra.id=ws.application_id
       JOIN relief_types rt ON rt.id=ra.relief_type_id
     WHERE ws.application_id=$1 AND ws.stage_number=$2`,
    [appId, stageNumber]
  );
  if (!stage) throw Object.assign(new Error('Stage not found'), { status: 404 });
  const rule = (stage.relief_stages as any[]).find((s: any) => s.stage === stageNumber);
  if (!rule) throw Object.assign(new Error('Stage rule missing'), { status: 500 });
  return { stage, approvals: rule.approvals as Role[] };
}

const APPROVAL_COLUMN: Record<string, string> = {
  DWO: 'dwo_verification',
  DM: 'dm_approval',
  TREASURY: 'treasury_confirmation',
};

function nextPendingApproval(stage: any, approvals: Role[]): Role | null {
  for (const role of approvals) {
    if (!stage[APPROVAL_COLUMN[role]]) return role;
  }
  return null;
}

async function ensureTriggerAndStart(stage: any, appId: number, stageNumber: number) {
  if (stage.trigger_event && !stage.trigger_met) {
    throw Object.assign(new Error(`Stage trigger '${stage.trigger_event}' not yet met`), { status: 409 });
  }
  if (stage.status === 'PENDING') await startStage(appId, stageNumber);
}

// Chain-aware officer action: VERIFY (DWO), APPROVE (DM), CONFIRM (TREASURY), REJECT (any next)
export async function officerAct(
  appId: number, stageNumber: number, action: 'VERIFY' | 'APPROVE' | 'CONFIRM' | 'REJECT',
  actor: { id: number; name: string; role: Role }, note?: string, reason?: string, signature?: string
) {
  const { stage, approvals } = await getStageContext(appId, stageNumber);
  if (!['IN_PROGRESS', 'PENDING'].includes(stage.status)) {
    throw Object.assign(new Error(`Stage ${stageNumber} already finalised (${stage.status})`), { status: 409 });
  }
  await ensureTriggerAndStart(stage, appId, stageNumber);

  const next = nextPendingApproval(stage, approvals);
  if (!next) throw Object.assign(new Error('Stage approval chain already complete'), { status: 409 });

  if (action === 'REJECT') {
    if (next !== actor.role) {
      throw Object.assign(new Error(`Stage currently awaiting ${next}; only they may act`), { status: 403 });
    }
    const col = APPROVAL_COLUMN[next];
    await query(
      `UPDATE workflow_stages SET ${col}=$2::jsonb, status='REJECTED', completed_at=now() WHERE id=$1`,
      [stage.id, JSON.stringify({ action: 'REJECTED', by: actor.name, byId: actor.id, ts: new Date().toISOString(), reason })]
    );
    await query(`UPDATE relief_applications SET status='REJECTED', rejection_reason=$2, updated_at=now() WHERE id=$1`, [appId, reason]);
    await auditLog({ actorId: actor.id, actorRole: actor.role, actorName: actor.name, action: `${next}_REJECT`, entityType: 'relief_application', entityId: appId, detail: { stage: stageNumber, reason } });
    const app = await queryOne<any>(`SELECT * FROM relief_applications WHERE id=$1`, [appId]);
    const citizen = await queryOne<any>(`SELECT u.id FROM cases c JOIN users u ON u.id=c.citizen_id WHERE c.id=$1`, [app.case_id]);
    await notify(citizen.id, 'Application Rejected', `Your relief application was rejected: ${reason}`);
    return getApplicationDetail(appId);
  }

  const roleForAction: Record<string, Role> = { VERIFY: 'DWO', APPROVE: 'DM', CONFIRM: 'TREASURY' };
  const role = roleForAction[action];
  if (next !== role) {
    throw Object.assign(new Error(`Stage currently awaiting ${next}; your ${role} action is not next`), { status: 409 });
  }
  const col = APPROVAL_COLUMN[role];
  await query(
    `UPDATE workflow_stages SET ${col}=$2::jsonb, status='IN_PROGRESS' WHERE id=$1`,
    [stage.id, JSON.stringify({ action: 'APPROVED', by: actor.name, byId: actor.id, ts: new Date().toISOString(), note: note ?? '', signature: signature ?? '' })]
  );
  await query(`UPDATE relief_applications SET status='UNDER_VERIFICATION', updated_at=now() WHERE id=$1`, [appId]);
  await auditLog({ actorId: actor.id, actorRole: actor.role, actorName: actor.name, action: `${role}_${action}`, entityType: 'relief_application', entityId: appId, detail: { stage: stageNumber, signature: signature ?? '' } });

  const updatedStage = await queryOne<any>(`SELECT * FROM workflow_stages WHERE id=$1`, [stage.id]);
  if (nextPendingApproval(updatedStage, approvals) === null) {
    // approval chain complete -> finalise stage and trigger Layer 3
    await query(`UPDATE workflow_stages SET status='APPROVED', completed_at=now() WHERE id=$1`, [stage.id]);
    await disburseStage(appId, stageNumber);
    const app = await queryOne<any>(`SELECT * FROM relief_applications WHERE id=$1`, [appId]);
    const citizen = await queryOne<any>(`SELECT u.id FROM cases c JOIN users u ON u.id=c.citizen_id WHERE c.id=$1`, [app.case_id]);
    const relief = await queryOne<any>(`SELECT rt.name FROM relief_types rt JOIN relief_applications ra ON ra.relief_type_id=rt.id WHERE ra.id=$1`, [appId]);
    await notify(citizen.id, 'Stage Approved & Disbursed', `Relief '${relief.name}' stage ${stageNumber} approved by all officers and disbursed.`);
  }
  return getApplicationDetail(appId);
}

// Backwards-compatible wrappers
export const dwoVerify = (appId: number, stageNumber: number, officer: { id: number; name: string }, note?: string) =>
  officerAct(appId, stageNumber, 'VERIFY', { ...officer, role: 'DWO' }, note);
export const dmApprove = (appId: number, stageNumber: number, officer: { id: number; name: string }, note?: string) =>
  officerAct(appId, stageNumber, 'APPROVE', { ...officer, role: 'DM' }, note);
export const dmReject = (appId: number, stageNumber: number, officer: { id: number; name: string }, reason: string) =>
  officerAct(appId, stageNumber, 'REJECT', { ...officer, role: 'DM' }, undefined, reason);
export const dwoReject = (appId: number, stageNumber: number, officer: { id: number; name: string }, reason: string) =>
  officerAct(appId, stageNumber, 'REJECT', { ...officer, role: 'DWO' }, undefined, reason);
export const treasuryConfirm = (appId: number, stageNumber: number, officer: { id: number; name: string }) =>
  officerAct(appId, stageNumber, 'CONFIRM', { ...officer, role: 'TREASURY' });

// ----- advance workflow on external event (charge-sheet, conviction) -----
export async function fireEvent(appId: number, event: string, actor: { id: number; name: string; role: Role }) {
  const app = await queryOne<any>(`SELECT * FROM relief_applications WHERE id=$1`, [appId]);
  if (!app) throw Object.assign(new Error('Application not found'), { status: 404 });
  const relief = await queryOne<any>(`SELECT * FROM relief_types WHERE id=$1`, [app.relief_type_id]);
  const nextStage = relief.stages.find((s: any) => s.stage === app.current_stage + 1 && s.trigger === event);
  if (!nextStage) {
    // if current stage still waiting for the event, mark it
    const cur = await queryOne<any>(`SELECT * FROM workflow_stages WHERE application_id=$1 AND stage_number=$2`, [appId, app.current_stage]);
    if (cur && cur.trigger_event === event) {
      await query(`UPDATE workflow_stages SET trigger_met=TRUE WHERE id=$1`, [cur.id]);
      await startStage(appId, cur.stage_number);
      await auditLog({ actorId: actor.id, actorRole: actor.role, actorName: actor.name, action: 'EVENT_TRIGGER', entityType: 'relief_application', entityId: appId, detail: { event, stage: cur.stage_number } });
      return getApplicationDetail(appId);
    }
    throw Object.assign(new Error(`No pending stage for event ${event}`), { status: 409 });
  }
  await startStage(appId, nextStage.stage);
  await query(
    `UPDATE workflow_stages SET trigger_met=TRUE WHERE application_id=$1 AND stage_number=$2`,
    [appId, nextStage.stage]
  );
  await auditLog({ actorId: actor.id, actorRole: actor.role, actorName: actor.name, action: 'EVENT_TRIGGER', entityType: 'relief_application', entityId: appId, detail: { event, stage: nextStage.stage } });
  return getApplicationDetail(appId);
}

// ----- reset all case progress (admin demo utility) ----------------
// Brings every application back to its initial state: stage 1 in progress
// and awaiting DWO verification. Clears stage approvals, disbursement
// transactions, treasury utilisation and escalations so the demo pipeline
// can be replayed from the top.
export async function resetAllCaseProgress() {
  const apps = await query<{ id: number; relief_type_id: number }>(
    `SELECT id, relief_type_id FROM relief_applications`
  );

  const count = await tx(async (q) => {
    const reliefMap: Record<number, ReliefTypeRow> = {};
    for (const a of apps) {
      if (!reliefMap[a.relief_type_id]) {
        const row = await queryOne<ReliefTypeRow>(`SELECT * FROM relief_types WHERE id=$1`, [a.relief_type_id]);
        if (row) reliefMap[a.relief_type_id] = row;
      }
    }

    for (const a of apps) {
      const relief = reliefMap[a.relief_type_id];
      if (!relief) continue;

      // rebuild the stage rows from the catalogue (stage 1 auto-starts)
      await q(`DELETE FROM workflow_stages WHERE application_id=$1`, [a.id]);
      await createStages(q, a.id, relief);

      // start stage 1: trigger pre-met, mark IN_PROGRESS with a fresh SLA deadline
      await q(`UPDATE workflow_stages SET trigger_met=TRUE WHERE application_id=$1 AND stage_number=1`, [a.id]);
      await q(
        `UPDATE workflow_stages SET status='IN_PROGRESS', started_at=now(),
            sla_due_at = now() + make_interval(days => $2::int)
          WHERE application_id=$1 AND stage_number=1 AND status='PENDING'`,
        [a.id, relief.sla_days]);

      // reset application to its initial submitted/under-verification state
      await q(
        `UPDATE relief_applications
            SET status='UNDER_VERIFICATION', current_stage=1,
                amount_released=0, rejection_reason=NULL, updated_at=now()
          WHERE id=$1`, [a.id]);
    }

    // clear disbursement + escalation history
    await q(`DELETE FROM transactions`);
    await q(`DELETE FROM escalations`);
    await q(`UPDATE treasury_ledger SET utilized=0, updated_at=now()`);

    // re-verify documents (as seeded: all VERIFIED at time of upload)
    await q(`UPDATE documents SET status='VERIFIED', verified_at=now()`);

    return apps.length;
  });

  await auditLog({
    actorId: null, actorRole: 'SYSTEM', actorName: 'admin',
    action: 'RESET_ALL_PROGRESS', entityType: 'workflow',
    detail: { applications: count },
  });
  return count;
}

// ----- SLA & escalation --------------------------------------------
export async function refreshEscalations() {
  // Any IN_PROGRESS stage past its SLA -> COLLECTOR escalation
  const overdue = await query<{ id: number; application_id: number; sla_due_at: Date }>(
    `SELECT id, application_id, sla_due_at FROM workflow_stages
     WHERE status='IN_PROGRESS' AND sla_due_at < now()`
  );
  for (const st of overdue) {
    const has = await queryOne(`SELECT id FROM escalations WHERE application_id=$1 AND level='COLLECTOR' AND status='OPEN'`, [st.application_id]);
    if (!has) {
      await query(
        `INSERT INTO escalations (application_id, level, reason) VALUES ($1,'COLLECTOR','SLA breached for stage (due $2)')`,
        [st.application_id, st.sla_due_at]
      );
      await auditLog({ actorId: null, actorRole: 'SYSTEM', action: 'ESCALATION', entityType: 'relief_application', entityId: st.application_id, detail: { level: 'COLLECTOR' } });
    } else {
      // >48h since breach -> STATE_SECRETARY
      const has2 = await queryOne(`SELECT id FROM escalations WHERE application_id=$1 AND level='STATE_SECRETARY' AND status='OPEN'`, [st.application_id]);
      if (!has2 && st.sla_due_at < new Date(Date.now() - 48 * 3600 * 1000)) {
        await query(
          `INSERT INTO escalations (application_id, level, reason) VALUES ($1,'STATE_SECRETARY','No action 48h after SLA breach')`,
          [st.application_id]
        );
        await auditLog({ actorId: null, actorRole: 'SYSTEM', action: 'ESCALATION', entityType: 'relief_application', entityId: st.application_id, detail: { level: 'STATE_SECRETARY' } });
      }
    }
  }
  return overdue.length;
}

// ----- application detail (joined) ----------------------------------
export async function getApplicationDetail(appId: number) {
  const app = await queryOne<any>(`SELECT * FROM relief_applications WHERE id=$1`, [appId]);
  if (!app) throw Object.assign(new Error('Application not found'), { status: 404 });
  const relief = await queryOne<any>(`SELECT * FROM relief_types WHERE id=$1`, [app.relief_type_id]);
  const cse = await queryOne<any>(`SELECT * FROM cases WHERE id=$1`, [app.case_id]);
  const citizen = await queryOne<any>(`SELECT id, name, phone, email, district, aadhaar FROM users WHERE id=$1`, [cse.citizen_id]);
  const stages = await query<any>(`SELECT * FROM workflow_stages WHERE application_id=$1 ORDER BY stage_number`, [appId]);
  const documents = await query<any>(`SELECT * FROM documents WHERE application_id=$1 ORDER BY id`, [appId]);
  const transactions = await query<any>(`SELECT * FROM transactions WHERE application_id=$1 ORDER BY id`, [appId]);
  return { ...app, relief, relief_name: relief?.name ?? null, case: cse, citizen, stages, documents, transactions };
}
