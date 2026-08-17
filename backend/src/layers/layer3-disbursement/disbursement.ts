import { query, queryOne } from '../../db/pool.js';
import { pfmsExecutePayment, pfmsValidateBeneficiary } from '../layer1-ingestion/dpi/mockDpi.js';
import { auditLog } from '../layer4-audit-grievance/audit.js';
import { notify } from '../layer4-audit-grievance/notifications.js';

// Layer 3 - PFMS disbursement with retry queue + treasury ledger.

export async function disburseStage(appId: number, stageNumber: number) {
  const app = await queryOne<any>(`SELECT * FROM relief_applications WHERE id=$1`, [appId]);
  if (!app) throw Object.assign(new Error('Application not found'), { status: 404 });
  const stage = await queryOne<any>(
    `SELECT * FROM workflow_stages WHERE application_id=$1 AND stage_number=$2`, [appId, stageNumber]);
  const relief = await queryOne<any>(`SELECT * FROM relief_types WHERE id=$1`, [app.relief_type_id]);
  const cse = await queryOne<any>(`SELECT * FROM cases WHERE id=$1`, [app.case_id]);
  const citizen = await queryOne<any>(`SELECT * FROM users WHERE id=$1`, [cse.citizen_id]);

  const amount = Number(app.amount_total) * (stage.amount_percent / 100);

  // attempt payment (up to 3 tries synchronously, then queue for retry)
  let outcome: { success: boolean; txid?: string; reason?: string } = { success: false, reason: 'not attempted' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    outcome = pfmsExecutePayment(amount, citizen.aadhaar);
    if (outcome.success) break;
  }

  const txid = outcome.txid ?? 'PFMS-FAIL-' + Date.now().toString(36).toUpperCase();

  const rows = await query(
    `INSERT INTO transactions (application_id, stage_number, amount, txid, status, failure_reason, attempt_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [appId, stageNumber, amount, txid, outcome.success ? 'SUCCESS' : 'FAILED',
     outcome.reason ?? null, 3]
  );
  const txn = rows[0];

  await auditLog({
    actorId: citizen.id, actorRole: 'SYSTEM', action: 'PFMS_TRANSFER',
    entityType: 'transaction', entityId: txn.id,
    detail: { application_id: appId, stage: stageNumber, amount, txid, status: txn.status },
  });

  if (outcome.success) {
    await query(
      `UPDATE transactions SET status='SUCCESS', confirmed_at=now() WHERE id=$1`, [txn.id]);
    await query(
      `UPDATE relief_applications SET amount_released = amount_released + $2, updated_at=now() WHERE id=$1`,
      [appId, amount]);
    // mark stage done (disbursed)
    await query(
      `UPDATE workflow_stages SET treasury_confirmation =
          COALESCE(treasury_confirmation,'{}'::jsonb) || $3::jsonb, status='APPROVED', completed_at=now()
       WHERE application_id=$1 AND stage_number=$2`,
      [appId, stageNumber, JSON.stringify({ pfms: outcome.txid, ts: new Date().toISOString() })]);
    // treasury ledger
    await query(
      `INSERT INTO treasury_ledger (district, relief_type_id, allocated, utilized)
       VALUES ($1,$2,0,$3)
       ON CONFLICT (district, relief_type_id) DO UPDATE
         SET utilized = treasury_ledger.utilized + EXCLUDED.utilized, updated_at=now()`,
      [cse.district, relief.id, amount]);
    await query(
      `UPDATE relief_applications SET status='FUND_RELEASED', updated_at=now() WHERE id=$1`, [appId]);

    // final stage? close application
    const maxStage = await queryOne<any>(
      `SELECT MAX(stage_number) AS m FROM workflow_stages WHERE application_id=$1`, [appId]);
    if (maxStage && Number(maxStage.m) === stageNumber) {
      await query(`UPDATE relief_applications SET status='CLOSED', updated_at=now() WHERE id=$1`, [appId]);
    }

    await notify(citizen.id, 'Fund Disbursed',
      `Relief '${relief.name}' stage ${stageNumber}: Rs.${amount.toLocaleString('en-IN')} credited. TXN ${outcome.txid}`);
    return { status: 'SUCCESS', txid: outcome.txid, amount };
  }

  await query(`UPDATE relief_applications SET status='UNDER_VERIFICATION', updated_at=now() WHERE id=$1`, [appId]);
  return { status: 'FAILED', reason: outcome.reason, txid };
}

// Retry all failed transactions
export async function retryFailedTransactions() {
  const failed = await query<any>(
    `SELECT * FROM transactions WHERE status IN ('FAILED','RETRY') ORDER BY id`);
  let retried = 0;
  for (const t of failed) {
    const app = await queryOne<any>(`SELECT * FROM relief_applications WHERE id=$1`, [t.application_id]);
    const cse = await queryOne<any>(`SELECT * FROM cases WHERE id=$1`, [app.case_id]);
    const citizen = await queryOne<any>(`SELECT * FROM users WHERE id=$1`, [cse.citizen_id]);
    const outcome = pfmsExecutePayment(Number(t.amount), citizen.aadhaar);
    if (outcome.success) {
      await query(`UPDATE transactions SET status='SUCCESS', confirmed_at=now(), attempt_count=attempt_count+1, failure_reason=NULL WHERE id=$1`, [t.id]);
      await query(`UPDATE relief_applications SET amount_released=amount_released+$2, updated_at=now() WHERE id=$1`, [t.application_id, t.amount]);
      const stageNum = t.stage_number;
      const maxStage = await queryOne<any>(`SELECT MAX(stage_number) AS m FROM workflow_stages WHERE application_id=$1`, [t.application_id]);
      if (maxStage && Number(maxStage.m) === stageNum) {
        await query(`UPDATE relief_applications SET status='CLOSED', updated_at=now() WHERE id=$1`, [t.application_id]);
      } else {
        await query(`UPDATE relief_applications SET status='FUND_RELEASED', updated_at=now() WHERE id=$1`, [t.application_id]);
      }
      await notify(citizen.id, 'Fund Disbursed (retry)', `Payment succeeded on retry. TXN ${outcome.txid}`);
      await auditLog({ actorId: citizen.id, actorRole: 'SYSTEM', action: 'PFMS_RETRY_SUCCESS', entityType: 'transaction', entityId: t.id, detail: { txid: outcome.txid } });
      retried++;
    } else {
      await query(`UPDATE transactions SET status='RETRY', attempt_count=attempt_count+1 WHERE id=$1`, [t.id]);
    }
  }
  return retried;
}

export async function treasuryStatus() {
  const accounts = await query(`SELECT * FROM treasury_ledger ORDER BY district`);
  const txns = await query(`SELECT status, COUNT(*)::int AS n, SUM(amount) AS total FROM transactions GROUP BY status`);
  return { ledger: accounts, transactions: txns };
}

export async function validateBeneficiary(aadhaar: string) {
  return pfmsValidateBeneficiary(aadhaar);
}
