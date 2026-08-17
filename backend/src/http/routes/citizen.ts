import { Router } from 'express';
import { authRequired, ensureEnabled } from '../middleware.js';
import { createCase, applyRelief, listCitizenCases } from '../../layers/layer1-ingestion/intake.js';
import { getApplicationDetail } from '../../layers/layer2-workflow/workflow.js';
import { SCREENING_QUESTIONS } from '../../layers/layer2-workflow/catalogue.js';
import { digilockerList, DOC_TYPE_LABEL, cctnsFirsByAadhaar } from '../../layers/layer1-ingestion/dpi/mockDpi.js';
import { queryOne } from '../../db/pool.js';
import { createGrievance, listGrievances } from '../../layers/layer4-audit-grievance/grievance.js';

export const citizenRouter = Router();
citizenRouter.use(authRequired, ensureEnabled);

// Eligibility questionnaire used in the government relief application process
citizenRouter.get('/screening', async (_req, res) => res.json(SCREENING_QUESTIONS));

// Look up CCTNS FIRs registered against the citizen's Aadhaar so the FIR
// number and its details are fetched automatically (no manual entry).
citizenRouter.get('/firs', async (req, res) => {
  const user = await queryOne<any>(`SELECT * FROM users WHERE id=$1`, [req.user!.uid]);
  const norm = (s: any) => String(s ?? '').replace(/[^0-9]/g, '');
  const query = norm(req.query.query);
  const own = norm(user?.aadhaar ?? '');
  if (!query || !own || query !== own) {
    return res.status(403).json({ error: 'Aadhaar does not match the logged-in citizen' });
  }
  const firs = cctnsFirsByAadhaar(query);
  const withCase = await Promise.all(firs.map(async (f: any) => {
    const existing = await queryOne<any>(
      `SELECT id, case_number FROM cases WHERE fir_number=$1 AND citizen_id=$2 AND is_duplicate=FALSE ORDER BY id LIMIT 1`,
      [f.fir_number, req.user!.uid]
    );
    return {
      fir_number: f.fir_number,
      fir_date: f.fir_date,
      police_station: f.police_station,
      district: f.district,
      ipc_sections: f.ipc_sections,
      status: f.status,
      victim_name: f.victim_name,
      case_reference: f.case_reference,
      existing_case_id: existing?.id ?? null,
      existing_case_number: existing?.case_number ?? null,
    };
  }));
  res.json(withCase);
});

// DigiLocker document vault for the logged-in citizen
citizenRouter.get('/digilocker', async (req, res) => {
  const user = await queryOne<any>(`SELECT aadhaar FROM users WHERE id=$1`, [req.user!.uid]);
  const docs = digilockerList(user?.aadhaar ?? '');
  res.json(docs.map((d: any) => ({ id: d.id, name: d.name, doc_type: d.doc_type, type_label: DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type })));
});

citizenRouter.post('/cases', async (req, res) => {
  const user = await queryOne<any>(`SELECT * FROM users WHERE id=$1`, [req.user!.uid]);
  try {
    const cse = await createCase({ id: user.id, name: user.name, aadhaar: user.aadhaar, phone: user.phone }, { fir_number: req.body?.fir_number });
    res.status(cse.duplicate_flagged ? 200 : 201).json(cse);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

citizenRouter.get('/cases', async (req, res) => {
  res.json(await listCitizenCases(req.user!.uid));
});

citizenRouter.get('/cases/:id', async (req, res) => {
  const cse = await queryOne<any>(
    `SELECT c.*,
       (SELECT json_agg(json_build_object('id', ra.id, 'status', ra.status, 'relief_code', rt.code, 'relief_name', rt.name, 'amount_total', ra.amount_total, 'amount_released', ra.amount_released, 'current_stage', ra.current_stage, 'updated_at', ra.updated_at) ORDER BY ra.id)
        FROM relief_applications ra JOIN relief_types rt ON rt.id=ra.relief_type_id
        WHERE ra.case_id=c.id) AS applications
     FROM cases c WHERE c.id=$1 AND c.citizen_id=$2`,
    [Number(req.params.id), req.user!.uid]
  );
  if (!cse) return res.status(404).json({ error: 'Case not found' });
  res.json(cse);
});

citizenRouter.get('/applications/:id', async (req, res) => {
  const app = await queryOne<any>(`SELECT * FROM relief_applications WHERE id=$1`, [Number(req.params.id)]);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const cse = await queryOne<any>(`SELECT * FROM cases WHERE id=$1 AND citizen_id=$2`, [app.case_id, req.user!.uid]);
  if (!cse) return res.status(403).json({ error: 'Not your application' });
  res.json(await getApplicationDetail(app.id));
});

citizenRouter.post('/cases/:id/apply', async (req, res) => {
  const user = await queryOne<any>(`SELECT * FROM users WHERE id=$1`, [req.user!.uid]);
  try {
    const appId = await applyRelief(
      { id: user.id, name: user.name },
      {
        case_id: Number(req.params.id),
        relief_code: req.body?.relief_code,
        doc_ids: req.body?.doc_ids ?? [],
        screening: req.body?.screening ?? {},
        declaration: req.body?.declaration === true,
      }
    );
    res.status(201).json({ application_id: appId });
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

citizenRouter.get('/grievances', async (req, res) => {
  res.json(await listGrievances({ citizen_id: req.user!.uid }));
});

citizenRouter.post('/grievances', async (req, res) => {
  const user = await queryOne<any>(`SELECT * FROM users WHERE id=$1`, [req.user!.uid]);
  try {
    const g = await createGrievance({ id: user.id, name: user.name }, { application_id: req.body?.application_id, subject: req.body?.subject, description: req.body?.description });
    res.status(201).json(g);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
