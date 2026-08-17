import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { Loading, useToast } from '../components/ui';
import { HeroBanner } from '../components/dash';
import { RefreshCw, Copy, Check, Users, Timer, MonitorSmartphone, QrCode } from 'lucide-react';

const ROLES: { role: string; title: string; desc: string; account: string; grad: string }[] = [
  {
    role: 'CITIZEN',
    title: 'Citizen Portal',
    desc: 'Register cases, apply for relief and track approvals live.',
    account: 'anjali.m@example.com',
    grad: 'from-brand-500 to-tealx-500',
  },
  {
    role: 'DWO',
    title: 'DWO Portal',
    desc: 'Verify documents and validation checks in the chain.',
    account: 'dwo.south@samarth.gov.in',
    grad: 'from-brand-500 to-violet-500',
  },
  {
    role: 'DM',
    title: 'DM Portal',
    desc: 'Approve sanctions as the next authority in the chain.',
    account: 'dm.south@samarth.gov.in',
    grad: 'from-violet-500 to-saffron-500',
  },
];

export default function Devices() {
  const toast = useToast();
  const [tokens, setTokens] = useState<Record<string, string> | null>(null);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      const res = await api.get<{ tokens: Record<string, string>; ttl: number }>('/auth/qr/tokens');
      setTokens(res.tokens);
      const base = window.location.origin;
      const qrMap: Record<string, string> = {};
      const urlMap: Record<string, string> = {};
      for (const [role, token] of Object.entries(res.tokens)) {
        const url = `${base}/qr-login?role=${role}&token=${encodeURIComponent(token)}`;
        urlMap[role] = url;
        qrMap[role] = await QRCode.toDataURL(url, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#1c2440', light: '#ffffff' },
        });
      }
      setQr(qrMap);
      setUrls(urlMap);
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copy = async (role: string) => {
    try {
      await navigator.clipboard.writeText(urls[role]);
      setCopied(role);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast('error', 'Could not copy link');
    }
  };

  if (!tokens) return <Loading label="Preparing role access QR codes" />;

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="brand"
        eyebrow="Layer 0 · Multi-device access"
        title="Multi-Device Demo"
        sub="Open each role portal on a teammate's own laptop by scanning its QR code — every device talks to the same backend & database."
        chips={[
          <span key="s" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <MonitorSmartphone size={13} /> {Object.keys(tokens).length} role portals
          </span>,
          <span key="t" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <Timer size={13} /> tokens expire in 10 min
          </span>,
        ]}
        actions={
          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/95 px-4 py-2 text-sm font-bold text-brand-700 shadow-lift transition hover:bg-white" onClick={load} disabled={busy}>
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Refresh QR codes
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-slate-500">
        <QrCode size={16} className="text-brand-500" />
        <span>
          How it works: <b className="text-slate-700">1.</b> keep this page open as the demo host · <b className="text-slate-700">2.</b> scan or share a role QR with a teammate · <b className="text-slate-700">3.</b> they operate that role from their own device, watching the same live state.
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r.role} className="glass flex flex-col p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${r.grad} text-white shadow-glow`}>
                <MonitorSmartphone size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-100">{r.title}</p>
                <p className="truncate font-mono text-[11px] text-slate-500">{r.account}</p>
              </div>
            </div>
            <p className="mb-4 text-sm text-slate-400">{r.desc}</p>

            <div className="mx-auto rounded-2xl bg-white p-3 ring-1 ring-slate-700 shadow-soft">
              {qr[r.role] ? (
                <img src={qr[r.role]} alt={`${r.title} QR code`} width={240} height={240} className="h-auto w-56 md:w-60" />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center text-slate-400"><Loading label="Generating" /></div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">
              <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">{urls[r.role]}</p>
              <button onClick={() => copy(r.role)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-brand-500" title="Copy link">
                {copied === r.role ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
              </button>
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Timer size={12} className="text-amber-500" /> Scanned QR grants a real signed session — officials still pass 2FA. Tokens expire in 10 minutes.
            </p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        Authentication & role-based access remain enforced server-side. All three portals share the same PostgreSQL database via the SPARSH backend.
      </p>
    </div>
  );
}
