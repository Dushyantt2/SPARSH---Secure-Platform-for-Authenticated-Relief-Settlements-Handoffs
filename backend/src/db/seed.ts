import { query, queryOne } from './pool.js';
import { RELIEF_TYPES, DEFAULT_RELIEF_AMOUNTS } from '../layers/layer2-workflow/catalogue.js';
import { createStages, startStage } from '../layers/layer2-workflow/workflow.js';
import { auditLog } from '../layers/layer4-audit-grievance/audit.js';
import { sha256, dataRegistry, ecourtsGetCase, pfmsValidateBeneficiary } from '../layers/layer1-ingestion/dpi/mockDpi.js';

// Seed realistic demo data so dashboards/analytics look alive.
// All citizens/FIRs/eCourts/PFMS data is derived from data.zip.
//
// Important: relief applications are seeded at the START of the approval
// pipeline (awaiting DWO verification on stage 1). No DWO/DM approval or
// Treasury confirmation is pre-filled, so nothing appears "already approved"
// in any role and reliefs only reach a desk after the previous officer acts.
export async function seed() {
  const count = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cases`);
  if (count && count.n > 0) return;

  const reliefMap: any = {};
  for (const r of RELIEF_TYPES) {
    const row = await queryOne<any>(`SELECT * FROM relief_types WHERE code=$1`, [r.code]);
    reliefMap[r.code] = row;
  }

  // treasury allocation across the data district(s)
  const districts = Array.from(new Set(Object.values(dataRegistry.citizens).map((c) => c.district)));
  for (const district of districts) {
    for (const rt of RELIEF_TYPES) {
      await query(
        `INSERT INTO treasury_ledger (district, relief_type_id, allocated) VALUES ($1,$2,$3)
         ON CONFLICT (district, relief_type_id) DO UPDATE SET allocated=EXCLUDED.allocated`,
        [district, reliefMap[rt.code].id, DEFAULT_RELIEF_AMOUNTS[rt.code] * 50]);
    }
  }

  async function seedCase(citizenEmail: string, firId: string, reliefs: { code: string; daysAgo: number }[]) {
    const citizen = await queryOne<any>(`SELECT * FROM users WHERE email=$1`, [citizenEmail]);
    const fir = dataRegistry.firs[firId];
    const court = ecourtsGetCase(fir.case_reference);
    const pfms = pfmsValidateBeneficiary(citizen.aadhaar);
    const master = {
      fir: { number: fir.fir_number, date: fir.fir_date, police_station: fir.police_station, district: fir.district, ipc_sections: fir.ipc_sections, status: fir.status },
      ecourts: court,
      kyc: { verified: true, name: citizen.name },
      pfms: { verified: pfms.valid, bank: pfms.account?.bank_name ?? null, reason: pfms.valid ? null : pfms.reason },
      digilocker_consent: true,
      fingerprint: sha256(fir.fir_number + citizen.aadhaar),
    };
    const caseRow = await queryOne<any>(
      `INSERT INTO cases (case_number, citizen_id, fir_number, fir_date, district, police_station, ipc_sections, master_object)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
      [
        'SAM-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000)),
        citizen.id, fir.fir_number, fir.fir_date, fir.district, fir.police_station, fir.ipc_sections, JSON.stringify(master),
      ]
    );

    for (const r of reliefs) {
      const relief = reliefMap[r.code];
      const app = await queryOne<any>(
        `INSERT INTO relief_applications (case_id, relief_type_id, status, amount_total, aadhaar_verified, bank_verified, created_at)
         VALUES ($1,$2,'SUBMITTED',$3,TRUE,$4, now() - ($5 || ' days')::interval) RETURNING *`,
        [caseRow.id, relief.id, DEFAULT_RELIEF_AMOUNTS[r.code], pfms.valid, r.daysAgo]
      );
      await createStages(query as any, app.id, relief);
      // documents (validated from the citizen's DigiLocker vault)
      for (const doc of ['FIR Copy', 'Bank Account Proof']) {
        await query(
          `INSERT INTO documents (application_id, name, doc_type, source, hash, status, verified_at)
           VALUES ($1,$2,'fir','DIGILOCKER',$3,'VERIFIED',now())`,
          [app.id, doc, sha256(doc)]);
      }
      // Stage 1 trigger is pre-met (FIR_REGISTERED) and the stage is started,
      // leaving it awaiting DWO verification. No approval columns are filled.
      await query(`UPDATE workflow_stages SET trigger_met=TRUE WHERE application_id=$1 AND stage_number=1`, [app.id]);
      await startStage(app.id, 1);
      await auditLog({ actorId: null, actorRole: 'SYSTEM', actorName: 'seed', action: 'SEED_APPLICATION', entityType: 'relief_application', entityId: app.id, detail: { relief: r.code, status: 'AWAITING_DWO' } });
    }
    return caseRow;
  }

  // Cases are built from data.zip FIRs for the 5 atrocity victims.
  // (FIRs are 2025 Jodhpur records; FIR ids come straight from cctns_mock.)
  // Every relief starts at stage 1 awaiting DWO — the officer pipeline then
  // advances it genuinely (DWO verify -> DM approve -> Treasury confirm).
  await seedCase('anjali.m@example.com', 'FIR_RJ_2025_0101', [
    { code: 'IMMEDIATE_RELIEF', daysAgo: 6 },
    { code: 'EDUCATIONAL_GRANT', daysAgo: 3 },
  ]);
  await seedCase('vikram.d@example.com', 'FIR_RJ_2025_0102', [
    { code: 'COMPENSATION', daysAgo: 2 },
    { code: 'EDUCATIONAL_GRANT', daysAgo: 1 },
  ]);
  await seedCase('sunita.d@example.com', 'FIR_RJ_2025_0103', [
    { code: 'COMPENSATION', daysAgo: 4 },
    { code: 'REHABILITATION', daysAgo: 4 },
  ]);
  await seedCase('rahul.v@example.com', 'FIR_RJ_2025_0104', [
    { code: 'HOUSING_ASSISTANCE', daysAgo: 2 },
  ]);
  await seedCase('amit.g@example.com', 'FIR_RJ_2025_0105', [
    { code: 'INTER_CAST_MARRIAGE', daysAgo: 1 },
  ]);

  // A grievance example
  await query(
    `INSERT INTO grievances (ref, citizen_id, subject, description, status, assigned_role)
     VALUES ('GRV-2024-2001',
       (SELECT id FROM users WHERE email='sunita.d@example.com'),
       'Status not updating', 'My compensation application has been under verification for a long time. Please update.', 'IN_PROGRESS', 'DWO')`);

  console.log('Seeded demo cases, applications, ledger and grievances from data.zip.');
}
