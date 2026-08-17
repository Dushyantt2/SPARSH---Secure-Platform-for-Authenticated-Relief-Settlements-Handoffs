import { query } from '../../db/pool.js';
import { refreshEscalations } from '../layer2-workflow/workflow.js';

// Layer 5 - Analytics & Insights over the operational warehouse.

export async function kpiOverview() {
  await refreshEscalations();
  const appStatus = await query(
    `SELECT status, COUNT(*)::int AS n FROM relief_applications GROUP BY status`);
  const pending = await query(
    `SELECT ws.status AS stage_status, COUNT(DISTINCT ws.application_id)::int AS n
     FROM workflow_stages ws JOIN relief_applications ra ON ra.id=ws.application_id
     WHERE ra.status IN ('SUBMITTED','UNDER_VERIFICATION','APPROVED','FUND_RELEASED')
     GROUP BY ws.status`);
  const fund = await query(
    `SELECT COALESCE(SUM(amount_total),0) AS total, COALESCE(SUM(amount_released),0) AS released
     FROM relief_applications`);
  const funds = fund[0];
  return {
    cases: (await query(`SELECT COUNT(*)::int AS n FROM cases`))[0].n,
    applications: appStatus.reduce((m: any, r) => ({ ...m, [r.status]: r.n }), {}),
    pending_stages: pending,
    funds: { total: Number(funds.total), released: Number(funds.released), utilization: Number(funds.total) ? Number(((funds.released / funds.total) * 100).toFixed(1)) : 0 },
    escalations: (await query(`SELECT COUNT(*)::int AS n FROM escalations WHERE status='OPEN'`))[0].n,
    grievances: (await query(`SELECT status, COUNT(*)::int AS n FROM grievances GROUP BY status`)),
  };
}

export async function analyticsPayload() {
  await refreshEscalations();

  // Stage-wise / relief-wise throughput + average time
  const reliefStats = await query(
    `SELECT rt.code, rt.name, rt.category,
            COUNT(ra.id)::int AS applications,
            COALESCE(SUM(CASE WHEN ra.status='CLOSED' THEN 1 ELSE 0 END),0)::int AS closed,
            COALESCE(SUM(ra.amount_total),0) AS allocated,
            COALESCE(SUM(ra.amount_released),0) AS released
     FROM relief_applications ra JOIN relief_types rt ON rt.id=ra.relief_type_id
     GROUP BY rt.code, rt.name, rt.category ORDER BY rt.code`);

  // Average days per stage (from start to approval) by relief
  const stageTimings = await query(
    `SELECT rt.code AS relief_code, rt.name AS relief_name,
            ws.stage_number,
            ROUND(AVG(EXTRACT(EPOCH FROM (ws.completed_at - ws.started_at))/86400.0)::numeric, 1) AS avg_days
     FROM workflow_stages ws
       JOIN relief_applications ra ON ra.id=ws.application_id
       JOIN relief_types rt ON rt.id=ra.relief_type_id
     WHERE ws.completed_at IS NOT NULL AND ws.started_at IS NOT NULL
     GROUP BY rt.code, rt.name, ws.stage_number
     ORDER BY rt.code, ws.stage_number`);

  const slaRow = await query(
    `SELECT
       COUNT(*)::int AS total_stages,
       SUM(CASE WHEN completed_at IS NOT NULL AND completed_at <= sla_due_at THEN 1 ELSE 0 END)::int AS on_time,
       SUM(CASE WHEN completed_at IS NULL AND sla_due_at < now() THEN 1 ELSE 0 END)::int AS overdue
     FROM workflow_stages WHERE status <> 'PENDING'`);
  const sla = slaRow[0];

  const byDistrict = await query(
    `SELECT c.district, COUNT(DISTINCT c.id)::int AS cases,
            COALESCE(SUM(ra.amount_released),0) AS released
     FROM cases c LEFT JOIN relief_applications ra ON ra.case_id=c.id
     GROUP BY c.district ORDER BY cases DESC`);

  const byStage = await query(
    `SELECT ra.current_stage, COUNT(*)::int AS n FROM relief_applications ra
     WHERE ra.status IN ('SUBMITTED','UNDER_VERIFICATION','APPROVED','FUND_RELEASED')
     GROUP BY ra.current_stage ORDER BY ra.current_stage`);

  const officerEfficiency = await query(
    `SELECT u.name, u.role,
            COUNT(w.dwo_verification)::int AS verifications,
            COUNT(w.dm_approval)::int AS approvals,
            COUNT(w.treasury_confirmation)::int AS confirmations
     FROM users u
       LEFT JOIN workflow_stages w ON TRUE
     GROUP BY u.name, u.role HAVING COUNT(w.dwo_verification)+COUNT(w.dm_approval)+COUNT(w.treasury_confirmation) > 0
     ORDER BY u.role`);

  const monthlyTrend = await query(
    `SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month,
            COUNT(*)::int AS n
     FROM relief_applications GROUP BY 1 ORDER BY 1`);

  return { reliefStats, stageTimings, sla, byDistrict, byStage, officerEfficiency, monthlyTrend };
}

// Anonymized open-data statistics for public transparency
export async function openData() {
  const byRelief = await query(
    `SELECT rt.code, rt.category, COUNT(*)::int AS applications,
            SUM(ra.amount_released)::numeric AS released
     FROM relief_applications ra JOIN relief_types rt ON rt.id=ra.relief_type_id
     GROUP BY rt.code, rt.category ORDER BY rt.code`);
  return {
    generated_at: new Date().toISOString(),
    disclaimer: 'Anonymized stage-wise and relief-specific statistics. No personal data exposed.',
    total_relief_released: (await query(`SELECT COALESCE(SUM(amount_released),0)::numeric AS s FROM relief_applications`))[0].s,
    by_relief: byRelief,
  };
}
