export type Role = 'CITIZEN' | 'DWO' | 'DM' | 'TREASURY' | 'ADMIN';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: Role;
  district: string;
  aadhaar: string | null;
}

export interface ScreeningQuestion {
  id: string;
  question: string;
  disqualifyingAnswer: 'yes' | 'no';
  hint?: string;
}

export interface ReliefType {
  id: number;
  code: string;
  name: string;
  category: 'CASE_LINKED' | 'BENEFIT_LINKED';
  description: string;
  required_docs: string[];
  sla_days: number;
  stages: ReliefStageRule[];
}

export interface ReliefStageRule {
  stage: number;
  name: string;
  percent: number;
  trigger: string;
  approvals: Role[];
  amountLabel: string;
}

export interface CaseRow {
  id: number;
  case_number: string;
  fir_number: string;
  fir_date: string;
  district: string;
  police_station: string;
  ipc_sections: string[];
  is_duplicate: boolean;
  created_at: string;
  relief_count?: number;
  applications?: ApplicationSummary[];
  master_object?: any;
  citizen?: User;
}

export interface ApplicationSummary {
  id: number;
  status: string;
  relief_code: string;
  relief_name: string;
  amount_total: string;
  amount_released: string;
  current_stage: number;
  updated_at: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  case_id: number;
  case?: CaseRow;
  citizen?: User;
  relief?: ReliefType;
  stages: StageRow[];
  documents: DocumentRow[];
  transactions: TransactionRow[];
  aadhaar_verified: boolean;
  bank_verified: boolean;
  rejection_reason: string | null;
}

export interface StageRow {
  id: number;
  stage_number: number;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED';
  amount_percent: number;
  trigger_event: string | null;
  trigger_met: boolean;
  dwo_verification: any | null;
  dm_approval: any | null;
  treasury_confirmation: any | null;
  sla_due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface DocumentRow {
  id: number;
  name: string;
  doc_type: string;
  source: 'DIGILOCKER' | 'MANUAL';
  hash: string;
  status: 'UPLOADED' | 'VERIFIED' | 'INVALID';
  verified_at: string | null;
}

export interface TransactionRow {
  id: number;
  stage_number: number;
  amount: string;
  txid: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY';
  failure_reason: string | null;
  attempt_count: number;
  confirmed_at: string | null;
}

export interface DigiDoc {
  id: string;
  name: string;
  doc_type: string;
  type_label: string;
}

export interface Grievance {
  id: number;
  ref: string;
  citizen_id: number;
  application_id: number | null;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';
  resolution: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  ts: string;
  actor_role: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: any;
  hash: string;
  prev_hash: string | null;
}

export interface Notification {
  id: number;
  title: string;
  body: string;
  channel: string;
  read: boolean;
  created_at: string;
}

export interface QrTokens {
  tokens: Record<string, string>;
  ttl: number;
}
