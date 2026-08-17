import { query, queryOne } from '../../db/pool.js';
import { refreshEscalations, getApplicationDetail, officerAct } from './workflow.js';

// Aggregations for official dashboards + officer action dispatcher.

const APPROVAL_COLUMN: Record<string, string> = {
  DWO: 'dwo_verification',
  DM: 'dm_approval',
  TREASURY: 'treasury_confirmation',
};

// Next approver waiting to act on the current stage of this application.
export function nextApproverOf(row: any): string | null {
  const stages: any[] = row.relief_stages ?? [];
  const rule = stages.find((s: any) => s.stage === row.stage_number);
  if (!rule || !Array.isArray(rule.approvals)) return null;
  for (const r of rule.approvals) {
    if (!row[APPROVAL_COLUMN[r]]) return r;
  }
  return null;
}

// Chain-aware visibility: a role can see an application only if it is the next
// pending approver on the current stage, or it has already acted on the stage.
// This guarantees nothing reaches the DM before DWO verification, and nothing
// reaches Treasury before DM approval. ADMIN sees everything.
export function visibleToRole(row: any, role: string): boolean {
  if (role === 'ADMIN') return true;
  const stages: any[] = row.relief_stages ?? [];
  const rule = stages.find((s: any) => s.stage === row.stage_number);
  if (!rule || !Array.isArray(rule.approvals)) return false;
  const approvals: string[] = rule.approvals;
  const idx = approvals.indexOf(role);
  if (idx === -1) return false;
  for (let i = 0; i < approvals.length; i++) {
    if (!row[APPROVAL_COLUMN[approvals[i]]]) return i >= idx;
  }
  return true;
}

const PENDING_SELECT = `
  SELECT ra.id, ra.status, ra.current_stage, rt.code AS relief_code, rt.name AS relief_name,
         c.case_number, c.fir_number, u.name AS citizen, u.district, ra.updated_at,
         ws.stage_number, ws.name AS stage_name, ws.status AS stage_status, ws.sla_due_at,
         ws.dwo_verification, ws.dm_approval, ws.treasury_confirmation,
         rt.stages AS relief_stages,
         (ws.dwo_verification IS NOT NULL) AS dwo_done`;

export async function officialDashboard(role: string, district: string) {
  await refreshEscalations();

  const total = await queryOne<any>(`SELECT COUNT(*)::int AS n FROM relief_applications`);
  const byStatus = await query(
    `SELECT status, COUNT(*)::int AS n FROM relief_applications GROUP BY status`);

  const districtCases = await query(
    `SELECT COUNT(DISTINCT c.id)::int AS n FROM cases c WHERE c.district=$1`, [district]);

  const pendingRows = await query<any>(
    `${PENDING_SELECT}
     FROM relief_applications ra
       JOIN relief_types rt ON rt.id=ra.relief_type_id
       JOIN cases c ON c.id=ra.case_id
       JOIN users u ON u.id=c.citizen_id
       JOIN workflow_stages ws ON ws.application_id=ra.id AND ws.stage_number=ra.current_stage
     WHERE ra.status IN ('SUBMITTED','UNDER_VERIFICATION','APPROVED','FUND_RELEASED')
     ORDER BY ws.sla_due_at ASC NULLS LAST`);

  const pending = pendingRows
    .filter((p: any) => visibleToRole(p, role))
    .map((p: any) => ({ ...p, next_role: nextApproverOf(p) }))
    .slice(0, 50);

  const escalations = await query(
    `SELECT es.*, ra.id AS app_id, ra.status AS app_status, rt.name AS relief_name, c.case_number
     FROM escalations es
       JOIN relief_applications ra ON ra.id=es.application_id
       JOIN relief_types rt ON rt.id=ra.relief_type_id
       JOIN cases c ON c.id=ra.case_id
     WHERE es.status='OPEN' ORDER BY es.id DESC`);

  const overdue = await query(
    `SELECT ws.id, ws.application_id, ws.stage_number, ws.name, ws.sla_due_at, rt.name AS relief_name, u.name AS citizen
     FROM workflow_stages ws
       JOIN relief_applications ra ON ra.id=ws.application_id
       JOIN relief_types rt ON rt.id=ra.relief_type_id
       JOIN cases c ON c.id=ra.case_id
       JOIN users u ON u.id=c.citizen_id
     WHERE ws.status='IN_PROGRESS' AND ws.sla_due_at < now()
     ORDER BY ws.sla_due_at LIMIT 20`);

  return {
    role,
    district,
    totals: {
      applications: total?.n ?? 0,
      district_cases: districtCases[0]?.n ?? 0,
      by_status: byStatus.reduce((m: any, r) => ({ ...m, [r.status]: r.n }), {}),
    },
    pending,
    escalations,
    overdue,
  };
}

// Cases are listed only if the requesting role can see at least one of the
// applications on the case (chain-aware). relief_count reflects the visible set.
export async function listCasesForOfficial(role: string, status?: string) {
  const rows = await query<any>(
    `SELECT DISTINCT c.id, c.case_number, c.fir_number, c.fir_date, c.district, c.police_station,
            c.ipc_sections, c.created_at, c.is_duplicate, u.name AS citizen, u.aadhaar
     FROM cases c JOIN users u ON u.id=c.citizen_id
     ORDER BY c.id DESC LIMIT 100`);

  if (rows.length === 0) return [];
  const ids = rows.map((r: any) => r.id);
  const apps = await query<any>(
    `SELECT ra.case_id, ra.id, ra.status, ra.current_stage,
            rt.code AS relief_code, rt.stages AS relief_stages,
            ws.stage_number, ws.dwo_verification, ws.dm_approval, ws.treasury_confirmation
     FROM relief_applications ra
       JOIN relief_types rt ON rt.id=ra.relief_type_id
       JOIN workflow_stages ws ON ws.application_id=ra.id AND ws.stage_number=ra.current_stage
     WHERE ra.case_id = ANY($1)`, [ids]);

  const visibleByCase = new Map<number, any[]>();
  for (const a of apps) {
    if (!status || a.status === status) {
      if (visibleToRole(a, role)) {
        const list = visibleByCase.get(a.case_id) ?? [];
        list.push(a);
        visibleByCase.set(a.case_id, list);
      }
    }
  }

  return rows
    .filter((c: any) => role === 'ADMIN' || (visibleByCase.get(c.id)?.length ?? 0) > 0)
    .map((c: any) => ({ ...c, relief_count: visibleByCase.get(c.id)?.length ?? 0 }));
}

// Officer action dispatcher (guard by actual role vs requested action)
export const officerActions = {
  verify: (appId: number, stage: number, officer: { id: number; name: string }, note?: string, signature?: string) =>
    officerAct(appId, stage, 'VERIFY', { ...officer, role: 'DWO' }, note, undefined, signature),
  approve: (appId: number, stage: number, officer: { id: number; name: string }, note?: string, signature?: string) =>
    officerAct(appId, stage, 'APPROVE', { ...officer, role: 'DM' }, note, undefined, signature),
  confirm: (appId: number, stage: number, officer: { id: number; name: string }, note?: string) =>
    officerAct(appId, stage, 'CONFIRM', { ...officer, role: 'TREASURY' }, note),
  reject: (appId: number, stage: number, officer: { id: number; name: string; role: string }, reason: string) =>
    officerAct(appId, stage, 'REJECT', { id: officer.id, name: officer.name, role: officer.role as any }, undefined, reason),
};
