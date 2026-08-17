import type { ReliefTypeRow, ReliefStageRule } from '../../types.js';

// Government relief applications follow a structured screening process: the
// applicant is asked eligibility questions (victim status, applicable Act,
// prior claims, DBT readiness) before any documents are accepted. A
// disqualifying answer blocks the application.
export interface ScreeningQuestion {
  id: string;
  question: string;
  disqualifyingAnswer: 'yes' | 'no';
  hint?: string;
}

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  {
    id: 'victim_or_heir',
    question: 'Are you the victim named in the FIR, or a legal heir / dependent of the victim?',
    disqualifyingAnswer: 'no',
    hint: 'Relief under the PCR Act (1955) and PoA Act (1989) is payable to the victim or their legal heirs.',
  },
  {
    id: 'fir_under_act',
    question: 'Is the FIR registered under the SC/ST (PoA) Act, 1989 or the PCR Act, 1955?',
    disqualifyingAnswer: 'no',
    hint: 'Only FIRs under these special statutes qualify for SPARSH relief.',
  },
  {
    id: 'no_prior_claim',
    question: 'Have you already received this relief for the same incident?',
    disqualifyingAnswer: 'yes',
    hint: 'Duplicate claims for the same incident are rejected.',
  },
  {
    id: 'dbt_ready',
    question: 'Is your bank account Aadhaar-seeded and ready for Direct Benefit Transfer?',
    disqualifyingAnswer: 'no',
    hint: 'Disbursements happen only through Aadhaar-seeded bank accounts (PFMS).',
  },
];

export const RELIEF_TYPES: Omit<ReliefTypeRow, 'id'>[] = [
  {
    code: 'IMMEDIATE_RELIEF',
    name: 'Immediate Monetary Relief',
    category: 'CASE_LINKED',
    description: 'Ex-gratia financial relief paid immediately after FIR registration for victims of atrocities.',
    required_docs: ['FIR Copy', 'Bank Account Proof'],
    sla_days: 7,
    stages: [
      { stage: 1, name: 'FIR Registered & Verified', percent: 25, trigger: 'FIR_REGISTERED', approvals: ['DWO', 'DM'], amountLabel: '25% on FIR verification' },
      { stage: 2, name: 'Charge-Sheet Filed', percent: 50, trigger: 'CHARGE_SHEET_FILED', approvals: ['DWO', 'DM'], amountLabel: '50% on charge-sheet filing' },
      { stage: 3, name: 'Conviction / Final Order', percent: 25, trigger: 'CONVICTION', approvals: ['DM', 'TREASURY'], amountLabel: '25% on conviction / final order' },
    ],
  },
  {
    code: 'COMPENSATION',
    name: 'Compensation & Disbursement',
    category: 'CASE_LINKED',
    description: 'Compensation awarded as per PoA Act 1989 schedule, released in stage-wise tranches.',
    required_docs: ['FIR Copy', 'Proof of Loss'],
    sla_days: 14,
    stages: [
      { stage: 1, name: 'FIR Registered & Verified', percent: 25, trigger: 'FIR_REGISTERED', approvals: ['DWO', 'DM'], amountLabel: '25% on FIR verification' },
      { stage: 2, name: 'Charge-Sheet Filed', percent: 50, trigger: 'CHARGE_SHEET_FILED', approvals: ['DWO', 'DM'], amountLabel: '50% on charge-sheet filing' },
      { stage: 3, name: 'Conviction / Final Order', percent: 25, trigger: 'CONVICTION', approvals: ['DM', 'TREASURY'], amountLabel: '25% on conviction / final order' },
    ],
  },
  {
    code: 'REHABILITATION',
    name: 'Relief & Rehabilitation Grant',
    category: 'CASE_LINKED',
    description: 'Rehabilitation grant for medical and long-term support of victims and dependents.',
    required_docs: ['FIR Copy', 'Medical / Support Documents'],
    sla_days: 14,
    stages: [
      { stage: 1, name: 'FIR Registered & Verified', percent: 25, trigger: 'FIR_REGISTERED', approvals: ['DWO', 'DM'], amountLabel: '25% on FIR verification' },
      { stage: 2, name: 'Charge-Sheet Filed', percent: 50, trigger: 'CHARGE_SHEET_FILED', approvals: ['DWO', 'DM'], amountLabel: '50% on charge-sheet filing' },
      { stage: 3, name: 'Conviction / Final Order', percent: 25, trigger: 'CONVICTION', approvals: ['DM', 'TREASURY'], amountLabel: '25% on conviction / final order' },
    ],
  },
  {
    code: 'EDUCATIONAL_GRANT',
    name: 'Educational Assistance Grant',
    category: 'BENEFIT_LINKED',
    description: 'Educational assistance for children of victims - 100% released post-verification.',
    required_docs: ['FIR Copy', 'Enrollment Proof'],
    sla_days: 15,
    stages: [
      { stage: 1, name: 'Application Verified', percent: 100, trigger: 'APPLICATION', approvals: ['DWO', 'DM'], amountLabel: '100% post-verification' },
    ],
  },
  {
    code: 'HOUSING_ASSISTANCE',
    name: 'Housing Assistance',
    category: 'BENEFIT_LINKED',
    description: 'Housing assistance released as 60% initial + 40% after housing completion.',
    required_docs: ['FIR Copy', 'Property / Caste Documents'],
    sla_days: 15,
    stages: [
      { stage: 1, name: 'Application Verified', percent: 60, trigger: 'APPLICATION', approvals: ['DWO', 'DM'], amountLabel: '60% initial after verification' },
      { stage: 2, name: 'Housing Completion', percent: 40, trigger: 'HOUSING_COMPLETED', approvals: ['DM', 'TREASURY'], amountLabel: '40% after completion' },
    ],
  },
  {
    code: 'SELF_EMPLOYMENT',
    name: 'Self-Employment Subsidy',
    category: 'BENEFIT_LINKED',
    description: 'Subsidy for self-employment - 100% after PFMS account verification.',
    required_docs: ['FIR Copy', 'Skill / Training Certificate'],
    sla_days: 15,
    stages: [
      { stage: 1, name: 'Business & Bank Linkage Verified', percent: 100, trigger: 'APPLICATION', approvals: ['DWO', 'DM'], amountLabel: '100% after PFMS account verification' },
    ],
  },
  {
    code: 'INTER_CAST_MARRIAGE',
    name: 'Inter-Caste Marriage Incentive',
    category: 'BENEFIT_LINKED',
    description: 'One-time incentive for inter-caste marriages involving SC/ST members.',
    required_docs: ['FIR Copy', 'Marriage Certificate', 'Caste Certificate'],
    sla_days: 15,
    stages: [
      { stage: 1, name: 'Joint Aadhaar + Marriage Verified', percent: 100, trigger: 'APPLICATION', approvals: ['DWO', 'DM'], amountLabel: 'Single-stage disbursement' },
    ],
  },
  {
    code: 'FUNERAL_ASSISTANCE',
    name: 'Funeral Assistance',
    category: 'BENEFIT_LINKED',
    description: 'Immediate 100% fund transfer for funeral expenses of victims.',
    required_docs: ['FIR Copy', 'Death Certificate'],
    sla_days: 10,
    stages: [
      { stage: 1, name: 'Death Certificate Verified', percent: 100, trigger: 'APPLICATION', approvals: ['DWO', 'DM'], amountLabel: 'Immediate 100% transfer' },
    ],
  },
];

export const DEFAULT_RELIEF_AMOUNTS: Record<string, number> = {
  IMMEDIATE_RELIEF: 100000,
  COMPENSATION: 600000,
  REHABILITATION: 400000,
  EDUCATIONAL_GRANT: 50000,
  HOUSING_ASSISTANCE: 300000,
  SELF_EMPLOYMENT: 150000,
  INTER_CAST_MARRIAGE: 100000,
  FUNERAL_ASSISTANCE: 20000,
};

export function stageOf(r: { stages: ReliefStageRule[] }, n: number) {
  return r.stages.find((s) => s.stage === n) ?? null;
}
