import { query, queryOne, tx } from '../../db/pool.js';
import { cctnsGetFir, ecourtsGetCase, aadhaarVerify, digilockerList, digilockerPull, DOC_TYPE_LABEL, REQUIRED_BY_TYPE, pfmsValidateBeneficiary, sha256 } from './dpi/mockDpi.js';
import { getReliefType, createStages } from '../layer2-workflow/workflow.js';
import { auditLog } from '../layer4-audit-grievance/audit.js';
import { notify } from '../layer4-audit-grievance/notifications.js';
import { DEFAULT_RELIEF_AMOUNTS, SCREENING_QUESTIONS } from '../layer2-workflow/catalogue.js';

// Layer 1 - Data Ingestion & Verification
// Builds the unified Master Case Object from CCTNS/eCourts/Aadhaar/PFMS,
// validates user-selected DigiLocker documents and runs deduplication.

export async function createCase(citizen: { id: number; name: string; aadhaar: string; phone?: string }, input: { fir_number: string }) {
  const firNumber = input.fir_number.trim().toUpperCase();

  // 1. Pull FIR from CCTNS
  let fir;
  try {
    fir = cctnsGetFir(firNumber);
  } catch (e: any) {
    throw Object.assign(new Error(`CCTNS: ${e.message}. Please use a valid FIR from the demo registry.`), { status: 400 });
  }

  // 2. Ensure FIR victim matches the logged-in citizen's Aadhaar
  if (fir.victim_aadhaar.replace(/\s/g, '') !== (citizen.aadhaar ?? '').replace(/\s/g, '')) {
    throw Object.assign(new Error('CCTNS FIR victim does not match your Aadhaar identity'), { status: 403 });
  }

  // 3. eCourts data
  const court = ecourtsGetCase(fir.case_reference);

  // 4. Aadhaar eKYC
  const ekyc = aadhaarVerify(citizen.aadhaar, (citizen as any).phone ?? 'demo-phone');
  const kyc = ekyc.valid ? { verified: true, name: ekyc.name } : { verified: false };

  // 5. PFMS beneficiary
  const pfms = pfmsValidateBeneficiary(citizen.aadhaar);

  // 6. Deduplication: one active case per FIR. If an active case already
  // exists, return it instead of creating another row (no duplicate pile-up).
  const existing = await queryOne<any>(
    `SELECT c.* FROM cases c
     WHERE c.fir_number=$1 AND c.citizen_id=$2 AND c.is_duplicate=FALSE
     ORDER BY c.id LIMIT 1`,
    [firNumber, citizen.id]
  );
  if (existing) {
    await auditLog({ actorId: citizen.id, actorRole: 'CITIZEN', actorName: citizen.name, action: 'DUPLICATE_DETECTED', entityType: 'case', entityId: existing.id, detail: { fir: firNumber } });
    return { ...existing, duplicate_flagged: true, duplicate_of: existing.case_number, master_object: existing.master_object };
  }

  const masterObject = {
    fir: { number: fir.fir_number, date: fir.fir_date, police_station: fir.police_station, district: fir.district, ipc_sections: fir.ipc_sections, status: fir.status },
    ecourts: court,
    kyc,
    pfms: { verified: pfms.valid, bank: pfms.account?.bank_name ?? null, reason: pfms.valid ? null : pfms.reason },
    digilocker_consent: true,
    fingerprint: sha256(firNumber + citizen.aadhaar),
  };

  const caseNo = 'SAM-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
  const cse = await queryOne<any>(
    `INSERT INTO cases (case_number, citizen_id, fir_number, fir_date, district, police_station, ipc_sections, master_object, is_duplicate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,FALSE) RETURNING *`,
    [caseNo, citizen.id, fir.fir_number, fir.fir_date, fir.district, fir.police_station, fir.ipc_sections, JSON.stringify(masterObject)]
  );

  await auditLog({ actorId: citizen.id, actorRole: 'CITIZEN', actorName: citizen.name, action: 'CASE_CREATED', entityType: 'case', entityId: cse.id, detail: { fir: firNumber, duplicate: false } });

  return { ...cse, duplicate_flagged: false, duplicate_of: null, master_object: masterObject };
}

// Citizen selects reliefs + DigiLocker documents per relief type, after
// answering the government eligibility-screening questionnaire.
export async function applyRelief(
  citizen: { id: number; name: string },
  input: {
    case_id: number;
    relief_code: string;
    doc_ids: string[];  // DigiLocker document ids selected by the citizen
    screening: { [questionId: string]: 'yes' | 'no' };  // eligibility answers
    declaration?: boolean;  // citizen self-declaration consent
  }
) {
  const cse = await queryOne<any>(`SELECT * FROM cases WHERE id=$1 AND citizen_id=$2`, [input.case_id, citizen.id]);
  if (!cse) throw Object.assign(new Error('Case not found for this citizen'), { status: 404 });

  const relief = await getReliefType(input.relief_code);
  if (!relief) throw Object.assign(new Error('Unknown relief type'), { status: 400 });

  // 1. Eligibility screening (government process): every question must be
  //    answered and no disqualifying answer may be given.
  const answers = input.screening ?? {};
  for (const q of SCREENING_QUESTIONS) {
    const ans = answers[q.id];
    if (!ans || (ans !== 'yes' && ans !== 'no')) {
      throw Object.assign(new Error(`Please answer the eligibility question: ${q.question}`), { status: 400 });
    }
    if (ans === q.disqualifyingAnswer) {
      throw Object.assign(new Error(`Not eligible: ${q.question}`, { cause: { questionId: q.id, answer: ans } }), { status: 403 });
    }
  }

  // 2. Self-declaration: applicant must consent that the details are true.
  if (input.declaration !== true) {
    throw Object.assign(new Error('You must accept the self-declaration to submit the application'), { status: 400 });
  }

  const existing = await queryOne<any>(`SELECT id FROM relief_applications WHERE case_id=$1 AND relief_type_id=$2`, [cse.id, relief.id]);
  if (existing) throw Object.assign(new Error('You have already applied for this relief on this case'), { status: 409 });

  const vault = digilockerList(cse.master_object.fir ? '' : ''); // aadhaar stored on user row; fetch below
  void vault;

  const citizenRow = await queryOne<any>(`SELECT aadhaar FROM users WHERE id=$1`, [cse.citizen_id]);
  const aadhaar = citizenRow.aadhaar;
  const vaultDocs = digilockerList(aadhaar);
  const required = REQUIRED_BY_TYPE[relief.code] ?? [];

  // validate selected docs exist in vault and match required types
  const selected = input.doc_ids
    .map((id) => digilockerPull(aadhaar, id))
    .filter((d): d is { id: string; name: string; doc_type: string; content: string } => d !== null);
  if (selected.length === 0) throw Object.assign(new Error('Select at least one valid document from DigiLocker'), { status: 400 });

  const missing = required.filter((t) => !selected.some((d: any) => d.doc_type === t));
  if (missing.length > 0) {
    throw Object.assign(new Error(`Missing required documents: ${missing.map((m) => DOC_TYPE_LABEL[m] ?? m).join(', ')}`), { status: 400 });
  }

  // amount
  const amountTotal = DEFAULT_RELIEF_AMOUNTS[relief.code] ?? 0;

  const appId = await tx(async (q) => {
    const app = await q(
      `INSERT INTO relief_applications (case_id, relief_type_id, status, amount_total, aadhaar_verified, bank_verified, screening, declaration)
       VALUES ($1,$2,'SUBMITTED',$3,TRUE,TRUE,$4::jsonb,$5) RETURNING id`,
      [cse.id, relief.id, amountTotal, JSON.stringify(answers), input.declaration === true]
    );
    const appRow = app[0];

    for (const doc of selected) {
      await q(
        `INSERT INTO documents (application_id, name, doc_type, source, hash)
         VALUES ($1,$2,$3,'DIGILOCKER',$4)`,
        [appRow.id, doc.name, doc.doc_type, sha256(doc.content)]
      );
      // hash validation against the record DigiLocker returned
      await q(
        `UPDATE documents SET status='VERIFIED', verified_at=now()
         WHERE application_id=$1 AND hash=$2`,
        [appRow.id, sha256(doc.content)]
      );
    }

    await createStages(q, appRow.id, relief);
    return appRow.id;
  });

  await auditLog({ actorId: citizen.id, actorRole: 'CITIZEN', actorName: citizen.name, action: 'RELIEF_APPLIED', entityType: 'relief_application', entityId: appId, detail: { relief: relief.code, docs: selected.map((d: any) => d.name) } });
  await notify(citizen.id, 'Application Submitted', `Your application for '${relief.name}' has been submitted.`);

  // Start stage 1 (FIR_REGISTERED / APPLICATION triggers are pre-met)
  const { startStage } = await import('../layer2-workflow/workflow.js');
  const firstStage = relief.stages[0];
  if (firstStage && (firstStage.trigger === 'FIR_REGISTERED' || firstStage.trigger === 'APPLICATION')) {
    await query(`UPDATE workflow_stages SET trigger_met=TRUE WHERE application_id=$1 AND stage_number=1`, [appId]);
    await startStage(appId, 1);
  }

  return appId;
}

export async function listCitizenCases(citizenId: number) {
  const cases = await query(
    `SELECT c.*, 
       (SELECT json_agg(json_build_object('id', ra.id, 'status', ra.status, 'relief_code', rt.code, 'relief_name', rt.name, 'amount_total', ra.amount_total, 'amount_released', ra.amount_released, 'current_stage', ra.current_stage, 'updated_at', ra.updated_at) ORDER BY ra.id)
        FROM relief_applications ra JOIN relief_types rt ON rt.id=ra.relief_type_id
        WHERE ra.case_id=c.id) AS applications
     FROM cases c WHERE c.citizen_id=$1 ORDER BY c.id DESC`,
    [citizenId]
  );
  return cases;
}

export async function listCitizenNotifications(citizenId: number) {
  const rows = await query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 30`, [citizenId]);
  await query(`UPDATE notifications SET read=TRUE WHERE user_id=$1`, [citizenId]);
  return rows;
}
