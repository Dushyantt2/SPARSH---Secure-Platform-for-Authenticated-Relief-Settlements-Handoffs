import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { authRouter } from './http/routes/auth.js';
import { citizenRouter } from './http/routes/citizen.js';
import { officialRouter } from './http/routes/official.js';
import { analyticsRouter, auditRouter } from './http/routes/analytics.js';
import { listReliefTypes } from './layers/layer2-workflow/workflow.js';
import { openData } from './layers/layer5-analytics/analytics.js';
import { pool } from './db/pool.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected' });
    } catch (e: any) {
      res.status(500).json({ status: 'error', db: e.message });
    }
  });

  app.get('/api/relief-types', async (_req, res) => res.json(await listReliefTypes()));
  app.get('/api/open-data', async (_req, res) => res.json(await openData()));

  app.use('/api/auth', authRouter);
  app.use('/api/citizen', citizenRouter);
  app.use('/api/official', officialRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/audit', auditRouter);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
  });

  return app;
}
