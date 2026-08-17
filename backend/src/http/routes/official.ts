import { Router } from 'express';
import { listReliefTypes, getApplicationDetail, resetAllCaseProgress } from '../../layers/layer2-workflow/workflow.js';
import { digilockerList } from '../../layers/layer1-ingestion/dpi/mockDpi.js';
import { listCasesForOfficial, officialDashboard, officerActions, visibleToRole } from '../../layers/layer2-workflow/officer.js';
import { fireEvent } from '../../layers/layer2-workflow/workflow.js';
import { retryFailedTransactions, treasuryStatus } from '../../layers/layer3-disbursement/disbursement.js';
import { listGrievances, updateGrievance } from '../../layers/layer4-audit-grievance/grievance.js';
import { query, queryOne } from '../../db/pool.js';
import { authRequired, ensureEnabled, roleRequired } from '../middleware.js';

export const officialRouter = Router();
officialRouter.use(authRequired, ensureEnabled);

officialRouter.get('/relief-types', async (_req, res) => res.json(await listReliefTypes()));

officialRouter.get('/dashboard', roleRequired('DWO', 'DM', 'TREASURY', 'ADMIN'), async (req, res) => {
  res.json(await officialDashboard(req.user!.role, req.user!.district));
});

officialRouter.get('/cases', roleRequired('DWO', 'DM', 'TREASURY', 'ADMIN'), async (req, res) => {
  const filter = req.query.status as string | undefined;
  res.json(await listCasesForOfficial(req.user!.role, filter));
});

officialRouter.get('/cases/:id', roleRequired('DWO', 'DM', 'TREASURY', 'ADMIN'), async (req, res) => {
  const cse = await queryOne<any>(`SELECT * FROM cases WHERE id=$1`, [Number(req.params.id)]);
  if (!cse) return res.status(404).json({ error: 'Case not found' });
  const citizen = await queryOne<any>(`SELECT id,name,email,phone,district,aadhaar FROM users WHERE id=$1`, [cse.citizen_id]);
  const apps = await query(
    `SELECT ra.*, rt.code AS relief_code, rt.name AS relief_name, rt.category,
            rt.stages AS relief_stages,
            ws.stage_number, ws.dwo_verification, ws.dm_approval, ws.treasury_confirmation
     FROM relief_applications ra
       JOIN relief_types rt ON rt.id=ra.relief_type_id
       JOIN workflow_stages ws ON ws.application_id=ra.id AND ws.stage_number=ra.current_stage
     WHERE ra.case_id=$1 ORDER BY ra.id`, [cse.id]);
  const role = req.user!.role;
  const visible = apps.filter((a: any) => visibleToRole(a, role));
  if (visible.length === 0 && role !== 'ADMIN') {
    return res.status(403).json({ error: 'This case has not reached your desk yet' });
  }
  const details = [];
  for (const a of visible) {
    details.push(await getApplicationDetail(a.id));
  }
  res.json({ ...cse, citizen, applications: details });
});

officialRouter.post('/applications/:id/verify', roleRequired('DWO', 'DM', 'ADMIN'), async (req, res) => {
  const { stage } = req.body ?? {};
  const note = req.body?.note;
  const signature = req.body?.signature;
  try {
    const d = await officerActions.verify(Number(req.params.id), Number(stage), { id: req.user!.uid, name: req.user!.name }, note, signature);
    res.json(d);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

officialRouter.post('/applications/:id/approve', roleRequired('DM', 'ADMIN'), async (req, res) => {
  const { stage } = req.body ?? {};
  const signature = req.body?.signature;
  try {
    const d = await officerActions.approve(Number(req.params.id), Number(stage), { id: req.user!.uid, name: req.user!.name }, req.body?.note, signature);
    res.json(d);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

officialRouter.post('/applications/:id/reject', roleRequired('DWO', 'DM', 'ADMIN'), async (req, res) => {
  const { stage, reason } = req.body ?? {};
  if (!reason) return res.status(400).json({ error: 'reason required' });
  try {
    const d = await officerActions.reject(Number(req.params.id), Number(stage), { id: req.user!.uid, name: req.user!.name, role: req.user!.role }, reason);
    res.json(d);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

officialRouter.post('/applications/:id/confirm', roleRequired('TREASURY', 'ADMIN'), async (req, res) => {
  const { stage } = req.body ?? {};
  try {
    const d = await officerActions.confirm(Number(req.params.id), Number(stage), { id: req.user!.uid, name: req.user!.name });
    res.json(d);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

// Trigger external events (charge-sheet, conviction, housing completion)
officialRouter.post('/applications/:id/events', roleRequired('DWO', 'DM', 'ADMIN'), async (req, res) => {
  const { event } = req.body ?? {};
  const allowed = ['CHARGE_SHEET_FILED', 'CONVICTION', 'HOUSING_COMPLETED'];
  if (!allowed.includes(event)) return res.status(400).json({ error: 'Unknown event' });
  try {
    const d = await fireEvent(Number(req.params.id), event, { id: req.user!.uid, name: req.user!.name, role: req.user!.role as any });
    res.json(d);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

officialRouter.get('/treasury', roleRequired('TREASURY', 'ADMIN'), async (_req, res) => {
  res.json(await treasuryStatus());
});

// ADMIN: reset every application's workflow back to stage 1 (awaiting DWO).
// Clears disbursement history, escalations and treasury utilisation so the
// demo pipeline can be replayed from the top.
officialRouter.post('/reset-progress', roleRequired('ADMIN'), async (req, res) => {
  try {
    const n = await resetAllCaseProgress();
    await auditOnly('ADMIN', 'RESET_ALL_PROGRESS', req);
    res.json({ reset: n });
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

officialRouter.post('/treasury/retry', roleRequired('TREASURY', 'ADMIN'), async (req, res) => {
  const n = await retryFailedTransactions();
  await auditOnly('TREASURY', 'RETRY_QUEUE_FLUSH', req);
  res.json({ retried: n });
});

function auditOnly(role: string, action: string, req: any) {
  return import('../../layers/layer4-audit-grievance/audit.js').then(({ auditLog }) =>
    auditLog({ actorId: req.user!.uid, actorRole: role, actorName: req.user!.name, action, entityType: 'transaction' })
  );
}

officialRouter.get('/grievances', roleRequired('DWO', 'DM', 'ADMIN'), async (req, res) => {
  const role = req.user!.role === 'DM' ? 'DM' : 'DWO';
  res.json(await listGrievances({ role }));
});

officialRouter.post('/grievances/:id', roleRequired('DWO', 'DM', 'ADMIN'), async (req, res) => {
  try {
    const g = await updateGrievance({ id: Number(req.params.id) }, { id: req.user!.uid, name: req.user!.name, role: req.user!.role }, req.body ?? {});
    res.json(g);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
