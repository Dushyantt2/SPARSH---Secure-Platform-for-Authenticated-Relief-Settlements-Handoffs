// ------------------------------------------------------------------
// Data Registry — single source of truth loaded from data.zip
// (Aadhaar_mock, cctns_mock, ecourt_mock, pfms_mock).
// All hardcoded citizen/FIR/court/PFMS values in the system are
// derived from these files. No predefined demo values remain.
// ------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AddressDetails {
  care_of: string;
  house: string;
  street: string;
  landmark: string;
  loc: string;
  vtc: string;
  subdist: string;
  dist: string;
  state: string;
  pincode: string;
  country: string;
}

export interface CitizenRecord {
  aadhaar: string;
  masked_aadhaar: string;
  uid_token: string;
  name: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  district: string;
  address: AddressDetails;
  photo_url: string;
  kyc_status: string;
  biometric_match: boolean;
  category: string;
  caste_tribe: string;
}

export interface FirRecord {
  id: string;
  cctns_id: string;
  fir_number: string;
  fir_date: string;
  police_station: string;
  police_station_district: string;
  district: string;
  victim_aadhaar: string | null;
  victim_name: string;
  ipc_sections: string[];
  acts: string;
  status: 'REGISTERED' | 'CHARGE_SHEET_FILED' | 'CONVICTED';
  case_reference: string | null;
  accused: string[];
  injury: string;
}

export interface CourtRecord {
  cnr: string;
  case_number: string;
  case_type: string;
  court: string;
  stage: string;
  next_hearing: string | null;
  last_order_date: string | null;
  fir_id_ref: string;
  petitioner: string;
  respondent: string;
  acts: string;
}

export interface PfmsRecord {
  account_no: string;
  name: string;
  aadhaar: string;
  mobile: string;
  ifsc: string;
  bank_name: string;
  account_status: string;
  kyc_status: string;
  aadhaar_seeded: boolean;
  balance: number;
  dbt_enabled: boolean;
}

const SECTION_PREFIX: Record<string, string> = {
  IPC: 'IPC',
  SCST_POA: 'PoA',
  IT_ACT: 'IT',
  MV_ACT: 'MV',
  NDPS: 'NDPS',
  EXCISE: 'EXCISE',
  ARMS: 'ARMS',
};

function stripComments(s: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += s[i + 1] ?? ''; i++; }
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; }
    else if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    else out += c;
  }
  return out;
}

function splitTopLevelJson(s: string): any[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0) parts.push(s.slice(start, i + 1)); }
  }
  return parts.map((p) => JSON.parse(p));
}

function readJson(file: string): any {
  const p = path.join(config.dataDir, file);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadAadhaar(): Record<string, any> {
  return readJson('Aadhaar_mock');
}

function loadCctns(): Record<string, any> {
  const raw = stripComments(readFileSync(path.join(config.dataDir, 'cctns_mock'), 'utf8'));
  const merged: Record<string, any> = {};
  for (const doc of splitTopLevelJson(raw)) Object.assign(merged, doc);
  return merged;
}

function loadEcourt(): Record<string, any> {
  return readJson('ecourt_mock');
}

function loadPfms(): Record<string, any> {
  return readJson('pfms_mock');
}

const BANK_BY_IFSC: Record<string, string> = {
  SBIN: 'State Bank of India',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  UBIN: 'Union Bank of India',
  RURB: 'Rajasthan Urban Co-operative Bank',
  HDFC: 'HDFC Bank',
  CNRB: 'Canara Bank',
};

function bankNameFromIfsc(ifsc: string): string {
  const prefix = (ifsc || '').slice(0, 4).toUpperCase();
  return BANK_BY_IFSC[prefix] ?? ifsc;
}

export class DataRegistry {
  citizens: Record<string, CitizenRecord> = {};
  firs: Record<string, FirRecord> = {};
  courts: Record<string, CourtRecord> = {};
  pfms: Record<string, PfmsRecord> = {};

  constructor() {
    this.load();
  }

  private load() {
    const aadhaarRaw = loadAadhaar();
    const cctns = loadCctns();
    const ecourt = loadEcourt();
    const pfmsRaw = loadPfms();

    const categoryByAadhaar: Record<string, { category: string; caste_tribe: string }> = {};

    // ---- Aadhaar citizens ----
    for (const [aadhaar, rec] of Object.entries(aadhaarRaw)) {
      const p = rec.personal_identity ?? {};
      const addr = rec.address_details ?? {};
      const kyc = rec.kyc_meta ?? {};
      this.citizens[aadhaar] = {
        aadhaar,
        masked_aadhaar: rec.masked_aadhaar ?? 'XXXXXXXX' + aadhaar.slice(-4),
        uid_token: rec.uid_token ?? '',
        name: p.name ?? '',
        dob: p.dob ?? '',
        gender: p.gender ?? '',
        phone: String(p.phone ?? ''),
        email: p.email ?? '',
        district: addr.dist ?? 'Jodhpur',
        address: addr,
        photo_url: kyc.photo_url ?? '',
        kyc_status: kyc.verification_status ?? 'VERIFIED',
        biometric_match: kyc.biometric_match ?? true,
        category: '',
        caste_tribe: '',
      };
    }

    // ---- eCourts (keyed by CNR) ----
    for (const [cnr, rec] of Object.entries(ecourt)) {
      const details = rec.case_details ?? {};
      const status = rec.case_status ?? {};
      const fir = rec.fir_details ?? {};
      const history: any[] = rec.history_of_case_hearing ?? [];
      const lastHearing = history.length > 0 ? history[history.length - 1].hearing_date ?? null : null;
      const actsArr: string[] = (rec.acts ?? []).map((a: any) => `${a.act ?? ''} ${a.section ?? ''}`.trim());
      this.courts[cnr] = {
        cnr,
        case_number: details.registration_number ?? cnr,
        case_type: details.case_type ?? '',
        court: status.court_no_and_judge ?? '',
        stage: status.case_stage ?? '',
        next_hearing: status.next_hearing_date ?? null,
        last_order_date: lastHearing,
        fir_id_ref: fir.fir_id_ref ?? '',
        petitioner: rec.petitioner_and_advocate?.petitioner ?? '',
        respondent: rec.respondent_and_advocate?.respondent ?? '',
        acts: actsArr.join(', '),
      };
    }

    // ---- CCTNS FIRs ----
    for (const [firId, rec] of Object.entries(cctns)) {
      const h = rec.IIF1_FirstInformationReport?.Header ?? {};
      const ps = h.Police_Station ?? {};
      const complainant = rec.IIF1_FirstInformationReport?.Complainant ?? {};
      const victims: any[] = rec.IIF2_CrimeDetails?.Victims ?? [];
      const accused: any[] = rec.IIF1_FirstInformationReport?.Accused_Details ?? [];
      const io = rec.IIF1_FirstInformationReport?.IO_Details ?? {};
      const actsAndSections: any[] = rec.IIF1_FirstInformationReport?.Acts_and_Sections ?? [];
      const finalReport = rec.IIF5_FinalReport;

      const victim = victims[0] ?? {};
      const victimName = victim.Name ?? complainant.Name ?? '';

      // match victim to an Aadhaar citizen by name
      const citizen = Object.values(this.citizens).find((c) => c.name === victimName);
      const victimAadhaar = citizen?.aadhaar ?? null;

      if (citizen) {
        citizen.category = victim.Social_Category ?? '';
        citizen.caste_tribe = victim.Caste_Tribe ?? '';
        categoryByAadhaar[citizen.aadhaar] = { category: victim.Social_Category ?? '', caste_tribe: victim.Caste_Tribe ?? '' };
      }

      const sections: string[] = [];
      for (const act of actsAndSections) {
        const prefix = SECTION_PREFIX[act.Act_Code] ?? act.Act_Code ?? 'ACT';
        for (const sec of act.Sections ?? []) sections.push(`${prefix} ${sec}`);
      }

      let status: FirRecord['status'] = 'REGISTERED';
      if (finalReport) status = 'CHARGE_SHEET_FILED';

      // an existing ecourt case => case_reference = CNR
      const court = Object.values(this.courts).find((c) => c.fir_id_ref === firId);

      this.firs[firId] = {
        id: firId,
        cctns_id: rec.meta?.cctns_id ?? firId,
        fir_number: firId,
        fir_date: String(h.Registration_Date ?? '').slice(0, 10),
        police_station: ps.Name ?? '',
        police_station_district: ps.District ?? '',
        district: 'Jodhpur',
        victim_aadhaar: victimAadhaar,
        victim_name: victimName,
        ipc_sections: sections,
        acts: actsAndSections.map((a) => `${a.Act_Name ?? ''} [${(a.Sections ?? []).join(', ')}]`).join('; '),
        status,
        case_reference: court?.cnr ?? null,
        accused: accused.map((a) => a.Name ?? ''),
        injury: victim.Injury_Nature ?? '',
      };
    }

    // ---- PFMS ----
    for (const [acctNo, rec] of Object.entries(pfmsRaw)) {
      const b = rec.Beneficiary_Details ?? {};
      const status = rec.Account_Status ?? {};
      const dbt = rec.DBT_Layer ?? {};
      const holderName = (b.Account_Holder ?? '').trim().toUpperCase();

      // link to citizen by mobile (aadhaar may be a placeholder hash in the dump)
      const citizen = Object.values(this.citizens).find(
        (c) => String(c.phone) === String(b.Mobile ?? '') || c.name.trim().toUpperCase() === holderName
      );
      const aadhaar = citizen?.aadhaar ?? b.Aadhaar_Number ?? '';

      const ifsc = rec.meta?.Branch_Code ?? '';
      this.pfms[aadhaar] = {
        account_no: acctNo,
        name: b.Account_Holder ?? '',
        aadhaar,
        mobile: String(b.Mobile ?? ''),
        ifsc,
        bank_name: bankNameFromIfsc(ifsc),
        account_status: status.Status_Code ?? '',
        kyc_status: status.KYC_Status ?? '',
        aadhaar_seeded: dbt.DBT_Enabled === true && status.Status_Code === 'OPERATIVE',
        balance: Number(rec.Ledger?.Current_Balance ?? 0),
        dbt_enabled: dbt.DBT_Enabled === true,
      };
    }
  }
}

let _registry: DataRegistry | null = null;
export function registry(): DataRegistry {
  if (!_registry) _registry = new DataRegistry();
  return _registry;
}
