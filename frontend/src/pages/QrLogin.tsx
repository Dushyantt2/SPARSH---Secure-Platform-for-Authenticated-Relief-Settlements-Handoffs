import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';
import { BrandLogo } from '../components/Shell';
import { Fingerprint, ArrowLeft, CheckCircle2, QrCode, ShieldAlert } from 'lucide-react';

export default function QrLogin() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const role = params.get('role') ?? '';
  const navigate = useNavigate();
  const { qrLogin, verifyOtp } = useAuth();

  const [phase, setPhase] = useState<'exchanging' | 'otp' | 'done' | 'error'>('exchanging');
  const [error, setError] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [userId, setUserId] = useState<number>(0);

  useEffect(() => {
    if (!token || !role) {
      setPhase('error');
      setError('Missing QR credentials. Please scan a fresh QR code from the Devices page.');
      return;
    }
    qrLogin(token)
      .then((res) => {
        if (res.twofa) {
          setUserId(res.userId ?? 0);
          setDevOtp(res.devOtp);
          setPhase('otp');
        } else {
          setPhase('done');
          setTimeout(() => navigate(role === 'CITIZEN' ? '/citizen' : '/official', { replace: true }), 1100);
        }
      })
      .catch((e: any) => {
        setPhase('error');
        setError(e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyOtp(userId, otp);
      setPhase('done');
      setTimeout(() => navigate('/official', { replace: true }), 1100);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 p-6">
      <div className="bg-grid absolute inset-0" />
      <div className="aurora -top-40 left-[10%] h-[440px] w-[440px] animate-aurora bg-brand-400/25" />
      <div className="aurora -top-24 right-[6%] h-[400px] w-[400px] animate-aurora bg-violet-400/20" style={{ animationDelay: '-6s' }} />
      <div className="aurora bottom-[-35%] left-1/3 h-[440px] w-[520px] animate-aurora bg-tealx-400/20" style={{ animationDelay: '-12s' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="glass-strong grad-border p-8">
          <div className="mb-6 flex items-center gap-3">
            <BrandLogo size={44} />
            <div>
              <p className="font-display text-lg font-extrabold tracking-tight text-slate-100">SPARSH</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">QR role access</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'exchanging' && (
              <motion.div key="exchanging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-10 text-center">
                <div className="relative">
                  <div className="flex h-16 w-16 animate-pulse-soft items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-tealx-50 text-brand-500 ring-1 ring-brand-500/20">
                    <QrCode size={30} />
                  </div>
                  <div className="absolute inset-0 -z-10 rounded-2xl bg-brand-500/20 blur-xl" />
                </div>
                <p className="font-display text-lg font-bold text-slate-100">Authenticating your {role || 'role'} portal…</p>
                <p className="text-sm text-slate-500">Exchanging the scanned QR token for a signed session.</p>
                <Spinner size={22} />
              </motion.div>
            )}

            {phase === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.3 }}>
                <div className="mb-6 flex items-center gap-3 rounded-2xl bg-tealx-50 p-4 ring-1 ring-tealx-200">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tealx-100 text-tealx-600"><Fingerprint size={20} /></span>
                  <div>
                    <p className="text-sm font-bold text-tealx-700">Two-factor verification</p>
                    <p className="text-xs text-slate-500">Official portals require an OTP even via QR access.</p>
                  </div>
                </div>
                <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-100">Enter your 6-digit OTP</h2>
                <p className="mt-1.5 text-sm text-slate-400">Demo mode shows the mock SMS inbox below.</p>
                {devOtp && (
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-500">Mock SMS inbox</p>
                      <p className="mt-0.5 font-mono text-2xl font-bold tracking-[0.4em] text-brand-700">{devOtp}</p>
                    </div>
                    <button type="button" className="btn-ghost !px-4 !py-2 text-sm" onClick={() => setOtp(devOtp)}>Use demo OTP</button>
                  </div>
                )}
                <form onSubmit={submitOtp} className="mt-6 space-y-4">
                  <input
                    className="input font-mono text-center text-2xl tracking-[0.5em]"
                    maxLength={6} inputMode="numeric"
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="______" required
                  />
                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{error}</motion.p>
                  )}
                  <button className="btn-primary w-full !py-3" disabled={otp.length !== 6}>
                    Verify & enter portal
                  </button>
                  <Link to="/login" className="btn-ghost w-full"><ArrowLeft size={15} /> Use manual sign-in instead</Link>
                </form>
              </motion.div>
            )}

            {phase === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-10 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}>
                  <CheckCircle2 size={64} className="text-emerald-500" />
                </motion.div>
                <div>
                  <p className="font-display text-xl font-bold text-slate-100">Signed in</p>
                  <p className="mt-1 text-sm text-slate-500">Opening your {role === 'CITIZEN' ? 'Citizen' : role} portal…</p>
                </div>
              </motion.div>
            )}

            {phase === 'error' && (
              <motion.div key="error" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-200">
                  <ShieldAlert size={26} />
                </div>
                <p className="font-display text-lg font-bold text-slate-100">Access could not be opened</p>
                <p className="max-w-xs text-sm text-slate-500">{error}</p>
                <Link to="/login" className="btn-primary">Go to sign in</Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
