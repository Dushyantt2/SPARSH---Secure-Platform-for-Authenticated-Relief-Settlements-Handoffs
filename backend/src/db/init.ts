import { readFileSync } from 'node:fs';
import { pool, query } from './pool.js';
import { config } from '../config.js';
import { seed } from './seed.js';
import { RELIEF_TYPES } from '../layers/layer2-workflow/catalogue.js';
import { dataRegistry } from '../layers/layer1-ingestion/dpi/mockDpi.js';
import bcrypt from 'bcryptjs';

export async function initDatabase() {
  const sql = readFileSync(config.schemaPath, 'utf8');
  await pool.query(sql);
}

async function seedReliefTypes() {
  for (const r of RELIEF_TYPES) {
    await query(
      `INSERT INTO relief_types (code, name, category, description, required_docs, sla_days, stages)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,
         description=EXCLUDED.description, required_docs=EXCLUDED.required_docs,
         sla_days=EXCLUDED.sla_days, stages=EXCLUDED.stages`,
      [r.code, r.name, r.category, r.description, r.required_docs, r.sla_days, JSON.stringify(r.stages)]
    );
  }
}

async function seedAdminAndOfficials() {
  // Official login identities (emails stay stable); their district tracks
  // the data.zip district so the Jodhpur data reaches their desks.
  const defs = [
    ['Aarav Sharma', 'admin@samarth.gov.in', 'ADMIN', 'Jodhpur'],
    ['Meera Iyer', 'dwo.south@samarth.gov.in', 'DWO', 'Jodhpur'],
    ['Rohan Verma', 'dm.south@samarth.gov.in', 'DM', 'Jodhpur'],
    ['Kavita Rao', 'treasury.south@samarth.gov.in', 'TREASURY', 'Jodhpur'],
    ['Sneha Pillai', 'dwo.north@samarth.gov.in', 'DWO', 'Jodhpur'],
    ['Vikram Singh', 'dm.north@samarth.gov.in', 'DM', 'Jodhpur'],
  ];
  // The AUDITOR role has been removed: every action is audited automatically
  // in the hash-chained audit trail, so no dedicated viewer role is needed.
  await query(`DELETE FROM users WHERE role='AUDITOR'`);
  const hash = await bcrypt.hash('Samarth@123', 10);
  for (const [name, email, role, district] of defs) {
    await query(
      `INSERT INTO users (name,email,phone,password_hash,role,district)
       VALUES ($1,$2,'91-0000000000',$3,$4,$5)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, hash, role, district]
    );
  }
}

async function seedCitizens() {
  // Citizens come from data.zip Aadhaar_mock (no predefined names/aadhaar).
  const hash = await bcrypt.hash('Citizen@123', 10);
  for (const c of Object.values(dataRegistry.citizens)) {
    await query(
      `INSERT INTO users (name,email,phone,password_hash,role,district,aadhaar)
       VALUES ($1,$2,$3,$4,'CITIZEN',$5,$6)
       ON CONFLICT (email) DO NOTHING`,
      [c.name, c.email, c.phone, hash, c.district, c.aadhaar]
    );
  }
}

export async function runSeed() {
  await seedReliefTypes();
  await seedAdminAndOfficials();
  await seedCitizens();
  await seed();
}

export async function resetDatabase() {
  await pool.query(`DROP TABLE IF EXISTS
    notifications, escalations, workflow_stages, documents, transactions, treasury_ledger,
    grievances, audit_logs, relief_applications, cases, relief_types, otp_codes, users CASCADE`);
}

export async function initAndSeed() {
  await resetDatabase();
  await initDatabase();
  await runSeed();
}

if (process.argv[1]?.endsWith('init.ts')) {
  const arg = process.argv[2];
  if (arg === '--force') {
    initAndSeed()
      .then(() => { console.log('Database rebuilt and seeded.'); process.exit(0); })
      .catch((e) => { console.error(e); process.exit(1); });
  } else {
    initDatabase()
      .then(() => runSeed())
      .then(() => { console.log('Database initialised and seeded.'); process.exit(0); })
      .catch((e) => { console.error(e); process.exit(1); });
  }
}
