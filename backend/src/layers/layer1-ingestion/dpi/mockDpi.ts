// ------------------------------------------------------------------
// Mock DPI Integrations (Layer 1 / Layer 3)
// Simulates external government digital infrastructure:
// CCTNS (FIRs), eCourts, UIDAI Aadhaar, DigiLocker, PFMS (payments).
// All citizen/FIR/court/PFMS data is derived from the data registry
// (data.zip) — no predefined demo values are hardcoded here.
// Deterministic and fully offline so the MVP runs anywhere.
// ------------------------------------------------------------------
import crypto from 'node:crypto';
import { registry } from './dataRegistry.js';

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const reg = registry();

// aadhaar -> phone for UIDAI phone-match (from Aadhaar_mock)
const AADHAAR_TO_PHONE: Record<string, string> = {};
for (const c of Object.values(reg.citizens)) {
  AADHAAR_TO_PHONE[c.aadhaar] = c.phone;
}

// ---- CCTNS: FIR registry (derived from cctns_mock) ----------------
interface FirRecord {
  fir_number: string;
  fir_date: string;
  police_station: string;
  district: string;
  victim_aadhaar: string;
  victim_name: string;
  ipc_sections: string[];
  status: 'REGISTERED' | 'CHARGE_SHEET_FILED' | 'CONVICTED';
  case_reference: string | null;
}

export const FIRS: FirRecord[] = Object.values(reg.firs).map((f) => ({
  fir_number: f.fir_number,
  fir_date: f.fir_date,
  police_station: f.police_station,
  district: f.district,
  victim_aadhaar: f.victim_aadhaar ?? '',
  victim_name: f.victim_name,
  ipc_sections: f.ipc_sections,
  status: f.status,
  case_reference: f.case_reference,
}));

export function cctnsGetFir(firNumber: string) {
  const fir = FIRS.find((f) => f.fir_number === firNumber);
  if (!fir) throw new Error(`CCTNS: FIR ${firNumber} not found`);
  return { ...fir };
}

// Look up all FIRs registered against a victim's Aadhaar (CCTNS).
// Used by the citizen registration flow so the FIR number and its
// details are fetched automatically instead of being typed manually.
export function cctnsFirsByAadhaar(aadhaar: string) {
  const normalized = (aadhaar ?? '').replace(/[^0-9]/g, '');
  return FIRS.filter((f) => (f.victim_aadhaar ?? '').replace(/[^0-9]/g, '') === normalized).map((f) => ({ ...f }));
}

// ---- eCourts: judicial progress (derived from ecourt_mock) ---------
export function ecourtsGetCase(caseReference: string | null) {
  if (!caseReference) return { exists: false };
  const court = reg.courts[caseReference];
  if (!court) return { exists: true, data: { case_number: caseReference, court: 'Sessions Court', stage: 'Pending', last_order_date: null } };
  return {
    exists: true,
    data: {
      case_number: court.case_number,
      court: court.court,
      stage: court.stage,
      last_order_date: court.last_order_date,
    },
  };
}

// ---- UIDAI Aadhaar eKYC (derived from Aadhaar_mock) -----------------
export function aadhaarVerify(aadhaar: string, phone: string): { valid: boolean; name?: string } {
  const normalized = aadhaar.replace(/[^0-9]/g, '');
  const validFormat = /^\d{12}$/.test(normalized);
  if (!validFormat) return { valid: false };
  const expectedPhone = AADHAAR_TO_PHONE[aadhaar];
  if (expectedPhone && expectedPhone !== phone) return { valid: false, name: undefined };
  const citizen = reg.citizens[aadhaar];
  if (!citizen) return { valid: false };
  return { valid: true, name: citizen.name };
}

// ---- DigiLocker: user document vault (derived from data.zip) --------
interface DlDoc {
  id: string;
  name: string;
  doc_type: string;
  content: string;
}

// Derive a realistic DigiLocker vault for each citizen from their
// Aadhaar + CCTNS victim + PFMS records. Doc ids are stable per citizen.
const DIGILOCKER_VAULT: Record<string, DlDoc[]> = {};
{
  const vaultOf = (citizen: any): DlDoc[] => {
    const docs: DlDoc[] = [];
    const firs = Object.values(reg.firs).filter((f) => f.victim_aadhaar === citizen.aadhaar);
    const pfms = reg.pfms[citizen.aadhaar];
    const fir = firs[0];

    const categoryLabel = citizen.category ? `(${citizen.category})` : '';
    docs.push({
      id: 'DL-CST',
      name: `Caste Certificate ${categoryLabel}`.trim(),
      doc_type: 'caste_certificate',
      content: `caste-${(citizen.category || 'sc').toLowerCase()}-${citizen.aadhaar.slice(-4)}`,
    });
    if (fir) {
      docs.push({ id: 'DL-FIR', name: `FIR Copy (${fir.fir_number})`, doc_type: 'fir', content: `fir-${fir.fir_number}` });
    }
    if (pfms) {
      docs.push({ id: 'DL-BANK', name: `Bank Passbook (${pfms.bank_name})`, doc_type: 'bank', content: `bank-${pfms.ifsc}-${citizen.aadhaar.slice(-4)}` });
    }
    if (fir?.injury && fir.injury !== 'NO_PHYSICAL_INJURY' && fir.injury !== 'NO_INJURY' && fir.injury !== 'UNKNOWN') {
      docs.push({ id: 'DL-MED', name: 'Medical Certificate', doc_type: 'medical', content: `medical-${citizen.aadhaar.slice(-4)}` });
    }
    // benefit-linked extras commonly held in the vault
    docs.push({ id: 'DL-ENROLL', name: 'School / College Enrollment', doc_type: 'enrollment', content: `enroll-${citizen.aadhaar.slice(-4)}` });
    docs.push({ id: 'DL-SKILL', name: 'Skill Training Certificate', doc_type: 'skill', content: `skill-${citizen.aadhaar.slice(-4)}` });
    docs.push({ id: 'DL-PROP', name: 'Property / Caste Documents', doc_type: 'property', content: `property-${citizen.aadhaar.slice(-4)}` });
    return docs;
  };
  for (const citizen of Object.values(reg.citizens)) {
    DIGILOCKER_VAULT[citizen.aadhaar] = vaultOf(citizen);
  }
}

export function digilockerList(aadhaar: string) {
  return DIGILOCKER_VAULT[aadhaar] ?? [];
}

export function digilockerPull(aadhaar: string, docId: string): DlDoc | null {
  const vault = DIGILOCKER_VAULT[aadhaar] ?? [];
  return vault.find((d) => d.id === docId) ?? null;
}

// map DigiLocker doc_type -> required document label
export const DOC_TYPE_LABEL: Record<string, string> = {
  caste_certificate: 'Caste Certificate',
  fir: 'FIR Copy',
  bank: 'Bank Account Proof',
  enrollment: 'Enrollment Proof',
  medical: 'Medical / Support Documents',
  skill: 'Skill / Training Certificate',
  property: 'Property / Caste Documents',
  marriage: 'Marriage Certificate',
  death: 'Death Certificate',
};

export const REQUIRED_BY_TYPE: Record<string, string[]> = {
  IMMEDIATE_RELIEF: ['fir', 'bank'],
  COMPENSATION: ['fir', 'property'],
  REHABILITATION: ['fir', 'medical'],
  EDUCATIONAL_GRANT: ['fir', 'enrollment'],
  HOUSING_ASSISTANCE: ['fir', 'property'],
  SELF_EMPLOYMENT: ['fir', 'skill'],
  INTER_CAST_MARRIAGE: ['fir', 'marriage', 'caste_certificate'],
  FUNERAL_ASSISTANCE: ['fir', 'death'],
};

// ---- PFMS: beneficiary + payment (derived from pfms_mock) ----------
export interface PfmsAccount {
  ifsc: string;
  account_no: string;
  bank_name: string;
  name: string;
  aadhaar_seeded: boolean;
}

const PFMS_ACCOUNTS: Record<string, PfmsAccount> = {};
for (const c of Object.values(reg.pfms)) {
  if (!c.aadhaar) continue;
  PFMS_ACCOUNTS[c.aadhaar] = {
    ifsc: c.ifsc,
    account_no: 'XXXX' + c.account_no.slice(-4),
    bank_name: c.bank_name,
    name: c.name,
    aadhaar_seeded: c.aadhaar_seeded,
  };
}

export function pfmsValidateBeneficiary(aadhaar: string): { valid: boolean; account?: PfmsAccount; reason?: string } {
  const account = PFMS_ACCOUNTS[aadhaar];
  if (!account) return { valid: false, reason: 'No Aadhaar-seeded account found in PFMS' };
  if (!account.aadhaar_seeded) return { valid: false, reason: 'Account not Aadhaar-seeded' };
  return { valid: true, account };
}

// Deterministic "payment outcome" so tests are stable.
let pfmsFailCounter = 0;
export function pfmsExecutePayment(amount: number, aadhaar: string) {
  const ben = pfmsValidateBeneficiary(aadhaar);
  if (!ben.valid) return { success: false, reason: ben.reason };
  // Simulate a transient failure for every 7th call to exercise the retry queue.
  pfmsFailCounter++;
  if (pfmsFailCounter % 7 === 0) return { success: false, reason: 'PFMS transient network error - retry' };
  return {
    success: true,
    txid: 'PFMS-' + Date.now().toString(36).toUpperCase() + '-' + sha256(aadhaar + amount).slice(0, 6).toUpperCase(),
    account: ben.account,
  };
}

export function pfmsBankName(aadhaar: string) {
  return PFMS_ACCOUNTS[aadhaar]?.bank_name ?? 'Unknown';
}

// ---- registry helpers for seed / init (no hardcoded values) -------
export const dataRegistry = reg;
export const CITIZENS = Object.values(reg.citizens).map((c) => c);
export const FIR_RECORDS = Object.values(reg.firs).map((f) => f);
