import { Router } from 'express';
import { listAudit, verifyAuditChain } from '../../layers/layer4-audit-grievance/audit.js';
import { kpiOverview, analyticsPayload, openData } from '../../layers/layer5-analytics/analytics.js';
import { authRequired, ensureEnabled, roleRequired } from '../middleware.js';
import { refreshEscalations } from '../../layers/layer2-workflow/workflow.js';

export const analyticsRouter = Router();

// Public, anonymized open-data statistics (no auth - transparency)
analyticsRouter.get('/open-data', async (_req, res) => res.json(await openData()));

analyticsRouter.use(authRequired, ensureEnabled);

analyticsRouter.get('/kpi', roleRequired('DWO', 'DM', 'TREASURY', 'ADMIN'), async (_req, res) => {
  res.json(await kpiOverview());
});

analyticsRouter.get('/report', roleRequired('DWO', 'DM', 'TREASURY', 'ADMIN'), async (_req, res) => {
  res.json(await analyticsPayload());
});

analyticsRouter.post('/refresh-escalations', roleRequired('ADMIN'), async (_req, res) => {
  const n = await refreshEscalations();
  res.json({ escalated: n });
});

// Layer 4 - audit stream + integrity verification
export const auditRouter = Router();
auditRouter.use(authRequired, ensureEnabled);

auditRouter.get('/', roleRequired('ADMIN', 'DM'), async (req, res) => {
  const rows = await listAudit({
    entityType: req.query.entity_type as string | undefined,
    entityId: req.query.entity_id as string | undefined,
    limit: Number(req.query.limit ?? 200),
  });
  res.json(rows);
});

auditRouter.get('/integrity', roleRequired('ADMIN'), async (_req, res) => {
  res.json(await verifyAuditChain());
});
