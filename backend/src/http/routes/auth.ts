import { Router } from 'express';
import { findUserByEmail, findUserByAadhaar, findUserByEmailAndPhone, verifyPassword, signToken, issueOtp, verifyOtp, requires2fa, getLatestOtp, hashPassword, findUserById, signQrToken, verifyQrToken, QR_ROLE_USERS, signCitizenStep1, verifyCitizenStep1, maskAadhaar } from '../../layers/layer0-access/auth.js';
import { authRequired, ensureEnabled } from '../middleware.js';
import { auditLog } from '../../layers/layer4-audit-grievance/audit.js';
import { query } from '../../db/pool.js';
import type { Role } from '../../types.js';

export const authRouter = Router();

function publicUser(u: any) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, district: u.district, aadhaar: u.aadhaar ?? null };
}

authRouter.post('/register', async (req, res) => {
  const { name, email, phone, password, aadhaar, district } = req.body ?? {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (!/^\d{4}-\d{4}-\d{4}$/.test(aadhaar ?? '')) return res.status(400).json({ error: 'Aadhaar must be in XXXX-XXXX-XXXX format' });
  const existing = await findUserByEmail(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });
  const hash = await hashPassword(password);
  const row = await query(
    `INSERT INTO users (name,email,phone,password_hash,role,district,aadhaar)
     VALUES ($1,$2,$3,$4,'CITIZEN',$5,$6) RETURNING *`,
    [name, email, phone ?? '', hash, district ?? 'Jodhpur', aadhaar]
  );
  const user = row[0];
  await auditLog({ actorId: user.id, actorRole: 'CITIZEN', actorName: user.name, action: 'CITIZEN_REGISTERED', entityType: 'user', entityId: user.id });
  res.status(201).json({ id: user.id, name: user.name, email: user.email });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = await findUserByEmail(email ?? '');
  if (!user || !user.password_hash || !(await verifyPassword(password ?? '', user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!user.enabled) return res.status(403).json({ error: 'Account disabled' });

  const twofa = requires2fa(user.role as any);
  let otp: string | null = null;
  if (twofa) {
    otp = await issueOtp(user.id);
    console.log(`[Mock SMS] OTP for ${user.email}: ${otp}`);
  }
  await auditLog({ actorId: user.id, actorRole: user.role, actorName: user.name, action: 'LOGIN', entityType: 'user', entityId: user.id, detail: { twofa } });
  if (!twofa) {
    res.json({ twofa, token: signToken(user), user: publicUser(user) });
  } else {
    res.json({
      twofa,
      token: null,
      user: publicUser(user),
      devOtp: otp,
      hint: 'OTP sent via mock SMS. In demo mode it is shown on the verification screen.',
    });
  }
});

// Aadhaar-based login: a 12-digit Aadhaar (no email required) that maps to a
// registered citizen. Officials still pass the standard 2FA OTP afterwards;
// the Aadhaar is what unlocks the citizen portal identity.
authRouter.post('/aadhaar-login', async (req, res) => {
  const aadhaar = String(req.body?.aadhaar ?? '').replace(/[^0-9]/g, '');
  if (!/^\d{12}$/.test(aadhaar)) return res.status(400).json({ error: 'Aadhaar must be 12 digits' });
  const user = await findUserByAadhaar(aadhaar);
  if (!user) return res.status(401).json({ error: 'No account found for this Aadhaar number' });
  if (!user.enabled) return res.status(403).json({ error: 'Account disabled' });

  const twofa = requires2fa(user.role as Role);
  let otp: string | null = null;
  if (twofa) {
    otp = await issueOtp(user.id);
    console.log(`[Mock SMS] OTP for ${user.email}: ${otp}`);
  }
  await auditLog({ actorId: user.id, actorRole: user.role, actorName: user.name, action: 'LOGIN_AADHAAR', entityType: 'user', entityId: user.id, detail: { twofa } });
  if (!twofa) {
    res.json({ twofa, token: signToken(user), user: publicUser(user) });
  } else {
    res.json({
      twofa,
      token: null,
      user: publicUser(user),
      devOtp: otp,
      hint: 'OTP sent via mock SMS. In demo mode it is shown on the verification screen.',
    });
  }
});

authRouter.post('/verify-otp', async (req, res) => {
  const { userId, code } = req.body ?? {};
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0 || !code) return res.status(400).json({ error: 'userId and code are required' });
  const ok = await verifyOtp(uid, String(code));
  if (!ok) return res.status(401).json({ error: 'Invalid or expired OTP' });
  const user = await findUserById(uid);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

// ---- 2-step citizen login ----
// Step 1: citizen proves their email + mobile number. No session is created,
// just a short-lived step token that step 2 must complete with the Aadhaar.
authRouter.post('/citizen-login/step1', async (req, res) => {
  const { email, phone } = req.body ?? {};
  const user = await findUserByEmailAndPhone(String(email ?? ''), String(phone ?? ''));
  if (!user) return res.status(401).json({ error: 'No account found for this email and mobile number' });
  if (user.role !== 'CITIZEN') return res.status(403).json({ error: 'This is not a citizen account' });
  if (!user.enabled) return res.status(403).json({ error: 'Account disabled' });
  await auditLog({ actorId: user.id, actorRole: 'CITIZEN', actorName: user.name, action: 'LOGIN_STEP1', entityType: 'user', entityId: user.id, detail: { via: 'email+phone' } });
  res.json({ step: 2, stepToken: signCitizenStep1(user.id), name: user.name, maskedAadhaar: maskAadhaar(user.aadhaar) });
});

// Step 2: Aadhaar completes the login. Token only issued if the Aadhaar
// belongs to the same citizen who passed step 1.
authRouter.post('/citizen-login/step2', async (req, res) => {
  const { stepToken, aadhaar } = req.body ?? {};
  const uid = stepToken ? verifyCitizenStep1(String(stepToken)) : null;
  if (!uid) return res.status(401).json({ error: 'Step 1 not completed or expired. Please log in again.' });
  const user = await findUserById(uid);
  if (!user || user.role !== 'CITIZEN') return res.status(401).json({ error: 'Citizen account not found' });
  if (!user.enabled) return res.status(403).json({ error: 'Account disabled' });
  const normalized = String(aadhaar ?? '').replace(/[^0-9]/g, '');
  if (!/^\d{12}$/.test(normalized) || normalized !== (user.aadhaar ?? '').replace(/[^0-9]/g, '')) {
    return res.status(401).json({ error: 'Aadhaar does not match this account' });
  }
  await auditLog({ actorId: user.id, actorRole: 'CITIZEN', actorName: user.name, action: 'LOGIN', entityType: 'user', entityId: user.id, detail: { via: 'aadhaar' } });
  res.json({ token: signToken(user), user: publicUser(user) });
});

// Demo helper for the login page: lists registered citizens and the reliefs
// they have applied for (derived from seeded data, not hardcoded).
authRouter.get('/demo/citizens', async (_req, res) => {
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.aadhaar,
            COALESCE(array_agg(DISTINCT rt.name) FILTER (WHERE rt.name IS NOT NULL), '{}') AS reliefs
     FROM users u
     LEFT JOIN cases c ON c.citizen_id = u.id
     LEFT JOIN relief_applications ra ON ra.case_id = c.id
     LEFT JOIN relief_types rt ON rt.id = ra.relief_type_id
     WHERE u.role = 'CITIZEN'
     GROUP BY u.id
     ORDER BY u.id`
  );
  res.json(rows.map((r: any) => ({
    id: r.id, name: r.name, email: r.email,
    phone: (r.phone ?? '').replace(/[^0-9]/g, ''),
    aadhaar: (r.aadhaar ?? '').replace(/[^0-9]/g, ''),
    reliefs: r.reliefs ?? [],
  })));
});

// Demo-only endpoint: retrieve the latest mock OTP (simulates SMS inbox)
authRouter.get('/dev-otp/:userId', authRequired, async (req, res) => {
  if ((req.user?.role ?? '') !== 'ADMIN' && req.user?.uid !== Number(req.params.userId)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const code = await getLatestOtp(Number(req.params.userId));
  if (!code) return res.status(404).json({ error: 'No pending OTP' });
  res.json({ code });
});

authRouter.get('/me', authRequired, ensureEnabled, async (req, res) => {
  const user = await findUserById(req.user!.uid);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, district: user.district, aadhaar: user.aadhaar });
});

authRouter.get('/notifications', authRequired, ensureEnabled, async (req, res) => {
  const rows = await query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 30`, [req.user!.uid]);
  await query(`UPDATE notifications SET read=TRUE WHERE user_id=$1`, [req.user!.uid]);
  res.json(rows);
});

// Multi-device demo: mint short-lived role-access tokens encoded into QR codes.
// Any authenticated user may mint them so a demo host can hand out role portals.
authRouter.get('/qr/tokens', authRequired, async (_req, res) => {
  const tokens: Record<string, string> = {};
  for (const role of Object.keys(QR_ROLE_USERS)) tokens[role] = signQrToken(role);
  res.json({ tokens, ttl: 600 });
});

// Exchange a scanned QR token for a real session. Official roles still pass 2FA
// (the mock SMS gateway surfaces the demo OTP) so auth + role checks stay enforced.
authRouter.post('/qr-login', async (req, res) => {
  const { token } = req.body ?? {};
  const role = token ? verifyQrToken(String(token)) : null;
  if (!role) return res.status(401).json({ error: 'Invalid or expired QR access token' });

  const email = QR_ROLE_USERS[role];
  const user = email ? await findUserByEmail(email) : null;
  if (!user || !user.enabled) return res.status(403).json({ error: 'Role account unavailable' });

  const twofa = requires2fa(role as Role);
  let otp: string | null = null;
  if (twofa) {
    otp = await issueOtp(user.id);
    console.log(`[Mock SMS] OTP for ${user.email}: ${otp}`);
  }
  await auditLog({ actorId: user.id, actorRole: user.role, actorName: user.name, action: 'QR_ACCESS', entityType: 'user', entityId: user.id, detail: { qr_role: role } });

  const payload = publicUser(user);
  if (!twofa) {
    res.json({ twofa: false, token: signToken(user), user: payload });
  } else {
    res.json({ twofa: true, token: null, user: payload, devOtp: otp, hint: 'OTP sent via mock SMS. In demo mode it is shown on the verification screen.' });
  }
});
