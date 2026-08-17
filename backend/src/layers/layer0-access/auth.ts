import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../../config.js';
import { query, queryOne } from '../../db/pool.js';
import type { Role, User } from '../../types.js';

export interface TokenPayload {
  uid: number;
  role: Role;
  name: string;
  email: string;
  district: string;
}

export function signToken(u: User): string {
  const payload: TokenPayload = {
    uid: u.id,
    role: u.role as Role,
    name: u.name,
    email: u.email,
    district: u.district,
  };
  return jwt.sign(payload, config.jwtSecret as jwt.Secret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>(`SELECT * FROM users WHERE email = $1`, [email]);
}

export async function findUserById(id: number): Promise<User | null> {
  return queryOne<User>(`SELECT * FROM users WHERE id = $1`, [id]);
}

// Aadhaar-based lookup (digits only, matches the stored XXXX-XXXX-XXXX format)
export async function findUserByAadhaar(aadhaar: string): Promise<User | null> {
  const normalized = (aadhaar ?? '').replace(/[^0-9]/g, '');
  if (!/^\d{12}$/.test(normalized)) return null;
  const rows = await query<User>(`SELECT * FROM users`);
  return rows.find((u) => (u.aadhaar ?? '').replace(/[^0-9]/g, '') === normalized) ?? null;
}

// 2-step citizen login: step 1 matches email + mobile number (the identity a
// citizen already owns), step 2 re-confirms the Aadhaar that unlocks SPARSH.
export async function findUserByEmailAndPhone(email: string, phone: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const norm = (phone ?? '').replace(/[^0-9]/g, '');
  if (!norm || norm !== (user.phone ?? '').replace(/[^0-9]/g, '')) return null;
  return user;
}

// Short-lived token proving step 1 (email+phone) passed; consumed by step 2.
export function signCitizenStep1(uid: number): string {
  return jwt.sign({ purpose: 'citizen-step1', uid }, config.jwtSecret as jwt.Secret, { expiresIn: '5m' });
}

export function verifyCitizenStep1(token: string): number | null {
  try {
    const p = jwt.verify(token, config.jwtSecret) as { purpose?: string; uid?: number };
    if (p.purpose !== 'citizen-step1' || !p.uid) return null;
    return p.uid;
  } catch {
    return null;
  }
}

export function maskAadhaar(aadhaar?: string | null): string {
  const digits = (aadhaar ?? '').replace(/[^0-9]/g, '');
  return digits.length === 12 ? `XXXX-XXXX-${digits.slice(-4)}` : '';
}

// ---- Mock 2FA: OTP generated and "sent" via a mock SMS gateway ----
export async function issueOtp(userId: number): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await query(
    `DELETE FROM otp_codes WHERE user_id = $1 AND used = FALSE`,
    [userId]
  );
  await query(
    `INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1,$2, now() + interval '10 minutes')`,
    [userId, code]
  );
  return code;
}

export async function verifyOtp(userId: number, code: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM otp_codes WHERE user_id=$1 AND code=$2 AND used=FALSE AND expires_at > now()`,
    [userId, code]
  );
  if (!row) return false;
  await query(`UPDATE otp_codes SET used=TRUE WHERE id=$1`, [row.id]);
  return true;
}

export async function getLatestOtp(userId: number): Promise<string | null> {
  const row = await queryOne<{ code: string }>(
    `SELECT code FROM otp_codes WHERE user_id=$1 AND used=FALSE ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  return row?.code ?? null;
}

export function requires2fa(role: Role): boolean {
  return ['DWO', 'DM', 'TREASURY', 'ADMIN'].includes(role);
}

// ---- QR role-access: short-lived, signed tokens that open a role portal ----
// CITIZEN maps to a data.zip citizen (Anjali Meena, the FIR_RJ_2025_0101 victim).
export const QR_ROLE_USERS: Record<string, string> = {
  CITIZEN: 'anjali.m@example.com',
  DWO: 'dwo.south@samarth.gov.in',
  DM: 'dm.south@samarth.gov.in',
};

const QR_ROLES = Object.keys(QR_ROLE_USERS);

export function signQrToken(role: string): string {
  if (!QR_ROLES.includes(role)) throw new Error(`QR access not supported for role ${role}`);
  return jwt.sign({ purpose: 'qr', role }, config.qrSecret as jwt.Secret, { expiresIn: '10m' });
}

export function verifyQrToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.qrSecret) as { purpose?: string; role?: string };
    if (payload.purpose !== 'qr' || !payload.role || !QR_ROLES.includes(payload.role)) return null;
    return payload.role;
  } catch {
    return null;
  }
}
