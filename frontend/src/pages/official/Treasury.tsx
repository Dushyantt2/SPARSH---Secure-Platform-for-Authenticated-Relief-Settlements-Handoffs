import { useEffect, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { api } from '../../api/client';
import { Loading, StatusBadge, useToast } from '../../components/ui';
import { AnimatedStat, MiniStat, HeroBanner } from '../../components/dash';
import { Landmark, RefreshCw, Wallet, CheckCircle2, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface LedgerRow { district: string; relief_type_id: number; allocated: string; utilized: string }
interface TxSummary { status: string; n: number; total: string }

const TX_COLORS: Record<string, string> = { SUCCESS: '#10B981', PENDING: '#f59e0b', FAILED: '#f43f5e', RETRY: '#FF9933' };

export default function Treasury() {
  const { user } = useAuth();
  const canAccess = user?.role === 'TREASURY' || user?.role === 'ADMIN';
  const [data, setData] = useState<{ ledger: LedgerRow[]; transactions: TxSummary[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => api.get<{ ledger: LedgerRow[]; transactions: TxSummary[] }>('/official/treasury').then(setData);
  useEffect(() => {
    if (canAccess) load();
  }, []);

  const retry = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ retried: number }>('/official/treasury/retry');
      toast('success', `Retry queue flushed — ${r.retried} payment(s) recovered`);
      load();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="glass p-10 text-center">
        <Landmark size={30} className="mx-auto mb-3 text-slate-600" />
        <p className="font-semibold text-slate-200">Treasury access restricted</p>
        <p className="mt-1 text-sm text-slate-500">Only Treasury Officers, Auditors and Administrators can view disbursement data.</p>
      </div>
    );
  }

  if (!data) return <Loading label="Loading treasury" />;

  const totals = data.ledger.reduce((m, r) => ({ allocated: m.allocated + Number(r.allocated), utilized: m.utilized + Number(r.utilized) }), { allocated: 0, utilized: 0 });
  const utilization = totals.allocated ? Math.round((totals.utilized / totals.allocated) * 100) : 0;
  const failed = data.transactions.filter((t) => t.status === 'FAILED' || t.status === 'RETRY').reduce((s, t) => s + t.n, 0);
  const successCount = data.transactions.find((t) => t.status === 'SUCCESS')?.n ?? 0;
  const pendingCount = data.transactions.find((t) => t.status === 'PENDING')?.n ?? 0;
  const txTotal = data.transactions.reduce((s, t) => s + Number(t.total ?? 0), 0);

  const txPie = data.transactions
    .map((t) => ({ name: t.status, value: t.n }))
    .filter((t) => t.value > 0);

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="teal"
        eyebrow="Disbursement workspace"
        title="Treasury Command"
        sub="Stage-wise PFMS transfers, retry queue and treasury ledger sync across districts."
        chips={[
          <span key="l" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <Wallet size={13} /> {data.ledger.length} ledger entries
          </span>,
          <span key="u" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <TrendingUp size={13} /> {utilization}% utilized
          </span>,
        ]}
        actions={
          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-tealx-700 shadow-lift transition-transform hover:-translate-y-0.5 disabled:opacity-60" onClick={retry} disabled={busy}>
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Flush retry queue
          </button>
        }
      />

      {/* Animated stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnimatedStat label="Allocated" value={totals.allocated} currency icon={<Wallet size={20} />} accent="brand" sub="across all districts" />
        <AnimatedStat label="Utilized" value={totals.utilized} currency icon={<Landmark size={20} />} accent="teal" sub={`${utilization}% of allocation`} progress={utilization} />
        <AnimatedStat label="Successful Transfers" value={successCount} icon={<CheckCircle2 size={20} />} accent="sky" sub={`${pendingCount} pending`} />
        <AnimatedStat label="Failed / Retry" value={failed} icon={<AlertTriangle size={20} />} accent={failed ? 'rose' : 'amber'} sub={failed ? 'queued for retry' : 'queue clear'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Ledger */}
        <section className="glass xl:col-span-2">
          <h2 className="card-title border-b border-slate-800 px-5 py-4">Treasury ledger by district & relief</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">District</th>
                <th className="th">Relief Type ID</th>
                <th className="th">Utilized</th>
                <th className="th">Allocated</th>
                <th className="th">Usage</th>
              </tr></thead>
              <tbody>
                {data.ledger.map((r, i) => {
                  const pct = Number(r.allocated) ? Math.round((Number(r.utilized) / Number(r.allocated)) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-slate-800/60">
                      <td className="td font-semibold text-slate-200">{r.district}</td>
                      <td className="td">#{r.relief_type_id}</td>
                      <td className="td">₹{Number(r.utilized).toLocaleString('en-IN')}</td>
                      <td className="td">₹{Number(r.allocated).toLocaleString('en-IN')}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-tealx-500 to-brand-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Transaction status */}
        <section className="glass p-5">
          <h2 className="card-title mb-4">Transaction status</h2>
          {txPie.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={txPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={3} strokeWidth={0}>
                    {txPie.map((t) => <Cell key={t.name} fill={TX_COLORS[t.name] ?? '#8d97b1'} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {txPie.map((t) => (
                  <span key={t.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: TX_COLORS[t.name] ?? '#8d97b1' }} />
                    {t.name} · {t.value}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No transfers yet.</p>
          )}
          <div className="mt-4 space-y-2.5">
            {data.transactions.map((t) => (
              <div key={t.status} className="flex items-center justify-between rounded-xl border border-slate-800 bg-ink-900/40 px-4 py-3">
                <StatusBadge status={t.status} />
                <p className="text-sm text-slate-300">{t.n} transfer(s)</p>
                <p className="font-mono text-sm text-slate-400">₹{Number(t.total ?? 0).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom snapshot */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Total moved (₹)" value={txTotal} icon={<TrendingUp size={16} />} accent="teal" />
        <MiniStat label="Ledger rows" value={data.ledger.length} icon={<Landmark size={16} />} accent="brand" />
        <MiniStat label="Successful" value={successCount} icon={<CheckCircle2 size={16} />} accent="sky" />
        <MiniStat label="Needs retry" value={failed} icon={<XCircle size={16} />} accent={failed ? 'rose' : 'amber'} />
      </div>
    </div>
  );
}
