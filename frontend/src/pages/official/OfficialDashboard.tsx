import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../lib/usePolling';
import { Loading, StatusBadge } from '../../components/ui';
import { AnimatedStat, HeroBanner, SlaBadge, MiniStat, timeAgo, DASH_ACCENTS } from '../../components/dash';
import { LivePulse } from '../../components/LivePulse';
import {
  FolderOpen, Hourglass, Landmark, Siren, ArrowRight, AlertTriangle, ShieldCheck, CheckCircle2,
  UserCheck, Stamp, Gavel, Wallet, FileCheck2, TrendingUp, Percent, Scale, XCircle, ClipboardList,
} from 'lucide-react';

interface PendingRow {
  id: number; status: string; current_stage: number; relief_code: string; relief_name: string;
  case_number: string; fir_number: string; citizen: string; district: string; stage_name: string;
  stage_status: string; sla_due_at: string; dwo_done: boolean; next_role: string;
}

interface Dash {
  role: string; district: string;
  totals: { applications: number; district_cases: number; by_status: Record<string, number> };
  pending: PendingRow[];
  escalations: any[];
  overdue: any[];
}

const PIE_COLORS = ['#1A5FCE', '#FF9933', '#10B981', '#8b5cf6', '#f43f5e', '#38bdf8', '#f59e0b'];
const tooltipStyle = {
  background: 'rgba(255, 255, 255, 0.97)',
  border: '1px solid #d4dbe6',
  borderRadius: 12,
  boxShadow: '0 12px 30px -12px rgba(15,23,42,0.25)',
  color: '#1c2536',
  fontSize: 12,
};

const ROLE_CONFIG: Record<string, { label: string; hint: string; tone: 'brand' | 'teal' | 'amber' | 'violet' | 'rose'; accent: string; icon: React.ReactNode }> = {
  DWO: { label: 'District Welfare Officer', hint: 'Verify documents and approve trigger events in your district.', tone: 'amber', accent: 'amber', icon: <UserCheck size={16} /> },
  DM: { label: 'District Magistrate', hint: 'Approve sanctions once DWO verification is complete.', tone: 'brand', accent: 'brand', icon: <Stamp size={16} /> },
  TREASURY: { label: 'Treasury Officer', hint: 'Confirm fund release and monitor PFMS transfers.', tone: 'teal', accent: 'teal', icon: <Landmark size={16} /> },
  ADMIN: { label: 'Administrator', hint: 'Govern users, escalations and the entire DBT pipeline.', tone: 'rose', accent: 'rose', icon: <Gavel size={16} /> },
};

export default function OfficialDashboard() {
  const { user } = useAuth();
  const role = user?.role ?? 'DWO';
  const [dash, setDash] = useState<Dash | null>(null);
  const [kpi, setKpi] = useState<any>(null);
  const [report, setReport] = useState<any>(null);

  const load = () => api.get<Dash>('/official/dashboard').then(setDash).catch(() => {});
  const lastSync = usePolling(load);

  useEffect(() => {
    Promise.all([api.get<any>('/analytics/kpi'), api.get<any>('/analytics/report')]).then(([k, r]) => {
      setKpi(k); setReport(r);
    }).catch(() => {});
  }, []);

  if (!dash) return <Loading label="Loading command center" />;

  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.DWO;
  const byStatus = dash.totals.by_status;
  const inProgress = byStatus['UNDER_VERIFICATION'] ?? 0;
  const fundReleased = byStatus['FUND_RELEASED'] ?? 0;
  const closed = byStatus['CLOSED'] ?? 0;
  const rejected = byStatus['REJECTED'] ?? 0;

  const myPending = dash.pending.filter((p) => p.next_role === role || (role === 'DM' && p.dwo_done && p.next_role === 'DM'));
  const myCount = role === 'ADMIN' ? dash.pending.length : myPending.length;

  const pieData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));
  const slaPct = report?.sla?.total_stages ? Math.round((report.sla.on_time / report.sla.total_stages) * 100) : 0;
  const utilization = kpi?.funds?.utilization ?? 0;

  const fundBar = (report?.reliefStats ?? []).map((r: any) => ({
    name: r.name.length > 16 ? r.name.slice(0, 15) + '…' : r.name,
    released: Number(r.released),
  })).sort((a: any, b: any) => b.released - a.released).slice(0, 6);

  return (
    <div className="space-y-6">
      <HeroBanner
        tone={cfg.tone}
        eyebrow="Official workspace"
        title={<>{user?.name?.split(' ')[0]}'s Command Center</>}
        sub={cfg.hint}
        chips={[
          <span key="role" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            {cfg.icon} {cfg.label}
          </span>,
          <span key="district" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <Scale size={13} /> {dash.district} district
          </span>,
        ]}
        actions={
          <>
            <LivePulse syncedAt={lastSync} label="Live sync" />
            {role !== 'TREASURY' && (
              <Link to="/official/cases" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-700 shadow-lift transition-transform hover:-translate-y-0.5">
                <ClipboardList size={16} /> Review queue
              </Link>
            )}
            {role === 'TREASURY' && (
              <Link to="/official/treasury" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-tealx-700 shadow-lift transition-transform hover:-translate-y-0.5">
                <Wallet size={16} /> Open Treasury
              </Link>
            )}
            {role === 'ADMIN' && (
              <Link to="/official/audit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-violet-700 shadow-lift transition-transform hover:-translate-y-0.5">
                <ShieldCheck size={16} /> Audit trail
              </Link>
            )}
          </>
        }
      />

      {/* Animated stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnimatedStat label="Total Applications" value={dash.totals.applications} icon={<FolderOpen size={20} />} accent="brand" sub={`${dash.totals.district_cases} cases in ${dash.district}`} />
        <AnimatedStat label="Your Queue" value={myCount} icon={<Hourglass size={20} />} accent="amber" sub={myCount > 0 ? 'waiting on your desk' : 'queue clear'} progress={myCount > 0 ? Math.min(100, Math.round((myCount / Math.max(1, dash.totals.applications)) * 100)) : 0} />
        <AnimatedStat label="Fund Released" value={fundReleased} icon={<Landmark size={20} />} accent="teal" sub={`${utilization}% of total claim`} progress={utilization} />
        <AnimatedStat label="Open Escalations" value={dash.escalations.length} icon={<Siren size={20} />} accent={dash.escalations.length ? 'rose' : 'sky'} sub={dash.escalations.length ? 'SLA breaches flagged' : 'all on track'} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="glass p-5">
          <h2 className="card-title mb-4">Applications by status</h2>
          {pieData.length === 0 ? (
            <p className="text-sm text-slate-500">No applications yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={74} paddingAngle={3} strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {pieData.map((p, i) => (
                  <span key={p.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {p.name.replace(/_/g, ' ')} · {p.value}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="glass p-5">
          <h2 className="card-title mb-4">Funds released by relief (₹)</h2>
          {fundBar.length === 0 ? (
            <p className="text-sm text-slate-500">No disbursements recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={fundBar}>
                <defs>
                  <linearGradient id="ofBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1A5FCE" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(26,95,206,0.06)' }} formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Bar dataKey="released" fill="url(#ofBar)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="glass p-5">
          <h2 className="card-title mb-4">SLA adherence</h2>
          <div className="flex items-center gap-4">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#eef1f7" strokeWidth="12" />
                <motion.circle
                  cx="50" cy="50" r="42" fill="none" stroke="url(#slaGrad)" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${(slaPct / 100) * 264} 264`}
                  initial={{ strokeDasharray: '0 264' }}
                  animate={{ strokeDasharray: `${(slaPct / 100) * 264} 264` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
                <defs>
                  <linearGradient id="slaGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#1A5FCE" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-2xl font-extrabold text-slate-100">{slaPct}%</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">on time</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-slate-400"><CheckCircle2 size={15} className="text-emerald-500" /> <b className="text-slate-300">{report?.sla?.on_time ?? 0}</b> on-time</p>
              <p className="flex items-center gap-2 text-slate-400"><XCircle size={15} className="text-rose-500" /> <b className="text-slate-300">{report?.sla?.overdue ?? 0}</b> overdue</p>
              <p className="flex items-center gap-2 text-slate-400"><FolderOpen size={15} className="text-brand-500" /> <b className="text-slate-300">{report?.sla?.total_stages ?? 0}</b> total stages</p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Pending approvals */}
        <section className="glass xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-4">
            <h2 className="card-title">Pending approvals <span className="ml-1 text-xs font-semibold text-slate-400">({dash.pending.length})</span></h2>
            <Link to="/official/cases" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-500">
              All cases <ArrowRight size={14} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Application</th>
                <th className="th">Citizen</th>
                <th className="th">Stage</th>
                <th className="th">SLA</th>
                <th className="th">Status</th>
              </tr></thead>
              <tbody>
                {dash.pending.length === 0 && (
                  <tr><td colSpan={5} className="td text-center text-slate-500">Nothing pending — the pipeline is clear.</td></tr>
                )}
                {dash.pending.map((p) => {
                  const overdue = p.sla_due_at && new Date(p.sla_due_at) < new Date();
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/60">
                      <td className="td">
                        <Link to={`/official/cases/${p.id}`} className="font-semibold text-brand-600 hover:underline">{p.case_number}</Link>
                        <p className="text-xs text-slate-500">{p.relief_name}</p>
                      </td>
                      <td className="td">
                        <p className="text-sm">{p.citizen}</p>
                        <p className="text-xs text-slate-500">{p.district}</p>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-300">{p.stage_name}</p>
                          {p.next_role === 'DWO' && <span className="chip border border-amber-300 bg-amber-50 text-amber-600">DWO</span>}
                          {p.next_role === 'DM' && <span className="chip border border-brand-300 bg-brand-50 text-brand-600">DM</span>}
                          {p.next_role === 'TREASURY' && <span className="chip border border-tealx-300 bg-tealx-50 text-tealx-600">TREASURY</span>}
                        </div>
                        <p className="text-xs text-slate-500">
                          {p.next_role === 'DWO' && 'Awaiting DWO verification'}
                          {p.next_role === 'DM' && (p.dwo_done ? 'DWO ✓ · awaiting DM approval' : 'Awaiting DM approval')}
                          {p.next_role === 'TREASURY' && 'Awaiting Treasury confirmation'}
                          {!p.next_role && 'Stage complete'}
                        </p>
                      </td>
                      <td className="td">
                        {p.sla_due_at ? <SlaBadge due={p.sla_due_at} /> : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="td"><StatusBadge status={p.stage_status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className="glass p-5">
            <h2 className="card-title mb-4 flex items-center gap-2"><Siren size={16} className="text-rose-500" /> Escalations</h2>
            {dash.escalations.length === 0 ? (
              <p className="text-sm text-slate-500">No active escalations. All SLAs are being met.</p>
            ) : (
              <div className="space-y-3">
                {dash.escalations.map((e) => (
                  <div key={e.id} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-rose-600"><AlertTriangle size={14} /> Escalated to {e.level.replace('_', ' ')}</p>
                    <p className="mt-1 text-xs text-slate-400">{e.reason}</p>
                    <p className="text-xs text-slate-500">{e.case_number} · {e.relief_name}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass p-5">
            <h2 className="card-title mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> SLA breaches</h2>
            {dash.overdue.length === 0 ? (
              <p className="text-sm text-slate-500">No overdue stages.</p>
            ) : (
              <div className="space-y-2">
                {dash.overdue.map((o) => (
                  <p key={o.id} className="text-xs text-slate-400">
                    <span className="font-semibold text-rose-600">{o.relief_name}</span> · {o.citizen} · due {new Date(o.sla_due_at).toLocaleDateString('en-IN')}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="glass p-5">
            <h2 className="card-title mb-3">Role shortcuts</h2>
            <div className="grid grid-cols-2 gap-3">
              {role !== 'TREASURY' && <RoleLink to="/official/cases" icon={<ClipboardList size={18} />} label="Case queue" />}
              {role !== 'ADMIN' && <RoleLink to="/official/grievances" icon={<AlertTriangle size={18} />} label="Grievances" />}
              {(role === 'TREASURY' || role === 'ADMIN') && <RoleLink to="/official/treasury" icon={<Wallet size={18} />} label="Treasury" />}
              {(role === 'ADMIN' || role === 'DM') && <RoleLink to="/official/audit" icon={<ShieldCheck size={18} />} label="Audit trail" />}
              <RoleLink to="/official/analytics" icon={<TrendingUp size={18} />} label="Analytics" />
            </div>
          </section>
        </div>
      </div>

      {/* District snapshot */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Closed cases" value={closed} icon={<CheckCircle2 size={16} />} accent="teal" />
        <MiniStat label="Rejected" value={rejected} icon={<XCircle size={16} />} accent="rose" />
        <MiniStat label="In pipeline" value={inProgress} icon={<Hourglass size={16} />} accent="amber" />
        <MiniStat label="Funds utilized" value={utilization} icon={<Percent size={16} />} accent="brand" />
      </div>
    </div>
  );
}

function RoleLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 transition hover:border-brand-500/50 hover:bg-brand-50">
      <span className="rounded-lg bg-white p-2 text-brand-600 shadow-soft">{icon}</span>
      <span className="text-sm font-semibold text-slate-300 group-hover:text-brand-700">{label}</span>
    </Link>
  );
}
