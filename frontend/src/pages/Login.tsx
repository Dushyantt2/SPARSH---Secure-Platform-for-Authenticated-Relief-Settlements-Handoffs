import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Spinner, useToast } from '../components/ui';
import { api } from '../api/client';
import { ShieldCheck, Fingerprint, ArrowLeft, KeyRound, IdCard, RotateCcw } from 'lucide-react';

const OFFICER_ACCOUNTS = [
  { role: 'DWO', email: 'dwo.south@samarth.gov.in', password: 'Samarth@123', note: 'Verification officer (2FA)' },
  { role: 'DM', email: 'dm.south@samarth.gov.in', password: 'Samarth@123', note: 'Approving authority (2FA)' },
  { role: 'Treasury', email: 'treasury.south@samarth.gov.in', password: 'Samarth@123', note: 'Fund release (2FA)' },
  { role: 'Admin', email: 'admin@samarth.gov.in', password: 'Samarth@123', note: 'Governance & demo controls (2FA)' },
];

interface DemoCitizen {
  id: number;
  name: string;
  email: string;
  phone: string;
  aadhaar: string;
  reliefs: string[];
}

export default function Login() {
  const { login, citizenLoginStep1, citizenLoginStep2, verifyOtp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPortal = searchParams.get('portal') === 'officer' ? 'officer' : 'citizen';

  const [portal, setPortal] = useState<'citizen' | 'officer'>(initialPortal);
  const [citizens, setCitizens] = useState<DemoCitizen[]>([]);

  // citizen 2-step login
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [stepToken, setStepToken] = useState('');
  const [identity, setIdentity] = useState<{ name: string; maskedAadhaar: string } | null>(null);

  // officer login
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pending2fa, setPending2fa] = useState<{ userId: number; devOtp?: string } | null>(null);
  const [otp, setOtp] = useState('');

  useEffect(() => {
    setPortal(initialPortal);
  }, [initialPortal]);

  useEffect(() => {
    api.get<DemoCitizen[]>('/auth/demo/citizens').then(setCitizens).catch(() => {});
  }, []);

  const mask = (a: string) => (a || '').replace(/^(.{4}).*(.{4})$/, '$1-XXXX-XXXX-$2');

  const pickCitizen = (c: DemoCitizen) => {
    setEmail(c.email);
    setPhone(c.phone);
    setError('');
  };

  const submitStep1 = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await citizenLoginStep1(email.trim(), phone);
      setStepToken(res.stepToken);
      setIdentity({ name: res.name, maskedAadhaar: res.maskedAadhaar });
      setAadhaar('');
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitStep2 = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      await citizenLoginStep2(stepToken, aadhaar);
      navigate('/citizen');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitOfficer = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login(email, password);
      if (res.twofa) {
        setPending2fa({ userId: res.userId ?? 0, devOtp: res.devOtp });
        return;
      }
      navigate('/official');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyOtp(pending2fa!.userId, otp);
      navigate('/official');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Demo utility: reset every application back to stage 1 (admin session is
  // ephemeral — used only for the reset call, never stored in the browser).
  const doAdminReset = async () => {
    setResetting(true);
    setError('');
    try {
      const l = await api.post<{ user?: { id: number }; devOtp?: string }>('/auth/login', { email: 'admin@samarth.gov.in', password: 'Samarth@123' });
      const v = await api.post<{ token: string }>('/auth/verify-otp', { userId: l.user?.id, code: l.devOtp });
      const res = await fetch('/api/official/reset-progress', {
        method: 'POST',
        headers: { Authorization: `Bearer ${v.token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Reset failed (${res.status})`);
      }
      toast('success', 'Demo data reset — all applications back to stage 1');
    } catch (err: any) {
      toast('error', err.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const switchPortal = (p: 'citizen' | 'officer') => {
    setPortal(p);
    setStep(1);
    setEmail('');
    setPhone('');
    setPassword('');
    setAadhaar('');
    setError('');
    setPending2fa(null);
    setOtp('');
    setIdentity(null);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-ink-950">
      {/* Government header strip (tricolour accent) matching the landing page */}
      <div className="h-[3px] w-full bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

      <div className="relative flex flex-1 items-center justify-center p-6">
        {/* Deep gov-blue backdrop with saffron/blue glows, echoing the landing hero */}
        <div className="bg-grid absolute inset-0" />
        <div className="aurora -top-40 left-[10%] h-[480px] w-[480px] animate-aurora bg-[#1A5FCE]/25" />
        <div className="aurora -top-24 right-[6%] h-[420px] w-[420px] animate-aurora bg-[#FF9933]/15" style={{ animationDelay: '-6s' }} />
        <div className="aurora bottom-[-35%] left-1/3 h-[440px] w-[540px] animate-aurora bg-[#0B3D91]/25" style={{ animationDelay: '-12s' }} />

        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid w-full max-w-5xl gap-12 lg:grid-cols-[1.05fr_1fr]"
        >
          {/* Left branding */}
          <div className="hidden flex-col justify-center lg:flex">
            <div className="flex items-center gap-3">
              <img src="/ashoka_emblem.png" alt="Ashoka Emblem" className="h-12 w-12 object-contain" />
              <div>
                <p className="font-display text-2xl font-extrabold tracking-tight text-[#0B3D91]">SPARSH</p>
                <p className="text-xs font-semibold text-slate-400">Secure Platform for Authenticated Relief Settlement &amp; Handoffs</p>
              </div>
            </div>
            <h1 className="mt-10 font-display text-[2.6rem] font-extrabold leading-[1.12] tracking-tight text-[#062654]">
              A secure government portal for{' '}
              <span className="text-[#FF9933]">citizens</span> and{' '}
              <span className="text-[#0B3D91]">officers</span>
            </h1>
            <ul className="mt-10 space-y-5 text-sm font-medium text-slate-500">
              <li className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8EFF9] text-[#0B3D91] ring-1 ring-[#0B3D91]/15"><ShieldCheck size={18} /></span> JWT sessions with role-based access control</li>
              <li className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8EFF9] text-[#0B3D91] ring-1 ring-[#0B3D91]/15"><Fingerprint size={18} /></span> Citizens: email + mobile, then Aadhaar verification</li>
              <li className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8EFF9] text-[#0B3D91] ring-1 ring-[#0B3D91]/15"><KeyRound size={18} /></span> Mandatory 2FA for all officials</li>
            </ul>
          </div>

          {/* Right card */}
          <motion.div
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong grad-border p-8"
          >
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <img src="/ashoka_emblem.png" alt="Ashoka Emblem" className="h-10 w-10 object-contain" />
              <div>
                <p className="font-display text-lg font-extrabold tracking-tight text-[#0B3D91]">SPARSH</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Human-in-the-Loop DBT</p>
              </div>
            </div>

            {/* Portal switcher */}
            {!pending2fa && (
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => switchPortal('citizen')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${portal === 'citizen' ? 'bg-white text-[#0B3D91] shadow' : 'text-slate-500 hover:text-[#0B3D91]'}`}>
                  <IdCard size={14} /> Citizen Portal
                </button>
                <button type="button" onClick={() => switchPortal('officer')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${portal === 'officer' ? 'bg-white text-[#0B3D91] shadow' : 'text-slate-500 hover:text-[#0B3D91]'}`}>
                  <ShieldCheck size={14} /> Officer Portal
                </button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {pending2fa ? (
                <motion.div key="otp" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.3 }}>
                  <div className="mb-6 flex items-center gap-3 rounded-2xl bg-[#E8EFF9] p-4 ring-1 ring-[#0B3D91]/15">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B3D91] text-white"><Fingerprint size={20} /></span>
                    <div>
                      <p className="text-sm font-bold text-[#0B3D91]">Two-factor verification</p>
                      <p className="text-xs text-slate-500">An OTP was sent via the mock SMS gateway.</p>
                    </div>
                  </div>
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#062654]">Enter your 6-digit OTP</h2>
                  <p className="mt-1.5 text-sm text-slate-400">In demo mode, use the mock SMS inbox below.</p>
                  {pending2fa.devOtp && (
                    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[#FF9933]/40 bg-[#FFF4E6] p-4">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#E68A00]">Mock SMS inbox</p>
                        <p className="mt-0.5 font-mono text-2xl font-bold tracking-[0.4em] text-[#0B3D91]">{pending2fa.devOtp}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost !px-4 !py-2 text-sm"
                        onClick={() => setOtp(pending2fa.devOtp!)}
                      >
                        Use demo OTP
                      </button>
                    </div>
                  )}
                  <form onSubmit={submitOtp} className="mt-6 space-y-4">
                    <div>
                      <label className="label">6-digit OTP</label>
                      <input
                        className="input font-mono text-center text-2xl tracking-[0.5em]"
                        maxLength={6} inputMode="numeric"
                        value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="______" required
                      />
                    </div>
                    {error && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                        {error}
                      </motion.p>
                    )}
                    <button className="btn-primary w-full !py-3" disabled={busy || otp.length !== 6}>
                      {busy ? <Spinner size={16} /> : 'Verify & continue'}
                    </button>
                    <button type="button" className="btn-ghost w-full" onClick={() => { setPending2fa(null); setOtp(''); setError(''); }}>
                      <ArrowLeft size={15} /> Back
                    </button>
                  </form>
                </motion.div>
              ) : portal === 'citizen' ? (
                step === 1 ? (
                  <motion.div key="step1" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.3 }}>
                    <div className="mb-4 flex items-center gap-2">
                      <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#062654]">Citizen login</h2>
                      <span className="ml-auto rounded-full bg-[#E8EFF9] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0B3D91]">Step 1 of 2</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-400">Enter the email and mobile number registered with SPARSH.</p>

                    <form onSubmit={submitStep1} className="mt-6 space-y-4">
                      <div>
                        <label className="label">Email</label>
                        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                      </div>
                      <div>
                        <label className="label">Mobile number</label>
                        <input
                          className="input font-mono tracking-widest"
                          type="tel" inputMode="numeric" maxLength={12}
                          value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="10-digit mobile" required
                        />
                      </div>
                      {error && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                          {error}
                        </motion.p>
                      )}
                      <button className="btn-primary w-full !py-3" disabled={busy || !email || phone.length < 10}>
                        {busy ? <Spinner size={16} /> : 'Continue'}
                      </button>
                    </form>

                    <div className="mt-8">
                      <p className="label">Citizen demo accounts</p>
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {citizens.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => pickCitizen(c)}
                            className="group flex w-full items-center justify-between rounded-xl border border-slate-700 bg-white px-3.5 py-3 text-left shadow-soft transition hover:border-[#0B3D91]/50 hover:bg-[#E8EFF9]"
                          >
                            <p className="text-sm font-bold text-slate-300 group-hover:text-[#0B3D91]">{c.name}</p>
                            <span className="font-mono text-xs text-slate-400 group-hover:text-[#1A5FCE]">{c.email}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="step2" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.3 }}>
                    <div className="mb-4 flex items-center gap-2">
                      <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#062654]">Verify your Aadhaar</h2>
                      <span className="ml-auto rounded-full bg-[#0B3D91] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Step 2 of 2</span>
                    </div>
                    {identity && (
                      <div className="flex items-center gap-3 rounded-2xl bg-[#E8EFF9] p-4 ring-1 ring-[#0B3D91]/15">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B3D91] text-white"><IdCard size={20} /></span>
                        <div>
                          <p className="text-sm font-bold text-[#0B3D91]">{identity.name}</p>
                          <p className="text-xs text-slate-500">Aadhaar ending <span className="font-mono font-semibold">{identity.maskedAadhaar.replace(/^.*-/, 'XXXX-XXXX-')}</span></p>
                        </div>
                      </div>
                    )}
                    <p className="mt-4 text-sm text-slate-400">Confirm your identity with the Aadhaar number linked to this account.</p>

                    <form onSubmit={submitStep2} className="mt-5 space-y-4">
                      <div>
                        <label className="label">Aadhaar number</label>
                        <input
                          className="input font-mono tracking-widest"
                          inputMode="numeric" maxLength={12}
                          value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="XXXXXXXXXXXX" required
                        />
                      </div>
                      {error && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                          {error}
                        </motion.p>
                      )}
                      <button className="btn-primary w-full !py-3" disabled={busy || aadhaar.length !== 12}>
                        {busy ? <Spinner size={16} /> : 'Sign in with Aadhaar'}
                      </button>
                      <button type="button" className="btn-ghost w-full" onClick={() => { setStep(1); setError(''); }}>
                        <ArrowLeft size={15} /> Back
                      </button>
                    </form>

                    <div className="mt-6">
                      <p className="label">Aadhaar quick-select (demo)</p>
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {citizens.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setAadhaar(c.aadhaar); setError(''); }}
                            className="group flex w-full items-center justify-between rounded-xl border border-slate-700 bg-white px-3.5 py-2.5 text-left shadow-soft transition hover:border-[#0B3D91]/50 hover:bg-[#E8EFF9]"
                          >
                            <p className="text-sm font-bold text-slate-300 group-hover:text-[#0B3D91]">{c.name}</p>
                            <span className="font-mono text-xs text-slate-400 group-hover:text-[#1A5FCE]">{mask(c.aadhaar)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )
              ) : (
                <motion.div key="officer" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.3 }}>
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#062654]">Officer login</h2>
                  <p className="mt-1.5 text-sm text-slate-400">Sign in with your official email. 2FA is mandatory.</p>

                  <form onSubmit={submitOfficer} className="mt-6 space-y-4">
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@samarth.gov.in" required />
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>
                    {error && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                        {error}
                      </motion.p>
                    )}
                    <button className="btn-primary w-full !py-3" disabled={busy}>
                      {busy ? <Spinner size={16} /> : 'Sign in'}
                    </button>
                  </form>

                  <div className="mt-8">
                    <p className="label">Officer demo accounts</p>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {OFFICER_ACCOUNTS.map((a) => (
                        <button
                          key={a.email}
                          type="button"
                          onClick={() => { setEmail(a.email); setPassword(a.password); setError(''); }}
                          className="group flex w-full items-center justify-between rounded-xl border border-slate-700 bg-white px-3.5 py-3 text-left shadow-soft transition hover:border-[#0B3D91]/50 hover:bg-[#E8EFF9]"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-300 group-hover:text-[#0B3D91]">{a.role}</p>
                            <p className="text-xs text-slate-400">{a.note}</p>
                          </div>
                          <span className="font-mono text-xs text-slate-400 group-hover:text-[#1A5FCE]">{a.email}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 flex justify-center border-t border-slate-700 pt-4">
                    <button
                      type="button"
                      disabled={resetting}
                      onClick={doAdminReset}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-[#0B3D91] disabled:opacity-50"
                    >
                      {resetting ? <Spinner size={13} /> : <RotateCcw size={13} />}
                      {resetting ? 'Resetting…' : 'Reset all case stages'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="mt-6 text-center text-xs font-medium text-slate-400">
              <Link to="/" className="hover:text-[#0B3D91]">← Back to home</Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
