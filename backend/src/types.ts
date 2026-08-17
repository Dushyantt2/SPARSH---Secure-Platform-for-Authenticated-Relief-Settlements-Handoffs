export type Role =
  | 'CITIZEN'
  | 'DWO'
  | 'DM'
  | 'TREASURY'
  | 'ADMIN';

export type ReliefCategory = 'CASE_LINKED' | 'BENEFIT_LINKED';

export type AppStatus =
  | 'SUBMITTED'
  | 'UNDER_VERIFICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'FUND_RELEASED'
  | 'CLOSED';

export type TxStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: Role;
  district: string;
  aadhaar: string | null;
  password_hash?: string;
  enabled: boolean;
  created_at: Date;
}

export interface ReliefStageRule {
  stage: number;
  name: string;
  percent: number;
  trigger: string;
  approvals: Role[];
  amountLabel: string;
}

export interface ReliefTypeRow {
  id: number;
  code: string;
  name: string;
  category: ReliefCategory;
  description: string;
  required_docs: string[];
  sla_days: number;
  stages: ReliefStageRule[];
}

export interface ApiError extends Error {
  status?: number;
}
