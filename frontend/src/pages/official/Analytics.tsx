import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Loading } from '../../components/ui';
import { HeroBanner, AnimatedStat } from '../../components/dash';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { motion } from 'framer-motion';
import { FolderOpen, Landmark, Siren, Percent, TrendingUp, BarChart3 } from 'lucide-react';

interface Kpi {
  cases: number; applications: Record<string, number>; escalations: number;
  funds: { total: number; released: number; utilization: number };
}
interface Report {
  reliefStats: { code: string; name: string; category: string; applications: number; closed: number; allocated: string; released: string }[];
  stageTimings: { relief_code: string; relief_name: string; stage_number: number; avg_days: string }[];
  sla: { total_stages: number; on_time: number; overdue: number };
  byDistrict: { district: string; cases: number; released: string }[];
  byStage: { current_stage: number; n: number }[];
  officerEfficiency: { name: string; role: string; verifications: number; approvals: number; confirmations: number }[];
  monthlyTrend: { month: string; n: number }[];
}

const PIE_COLORS = ['#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#f43f5e', '#38bdf8'];

const tooltipStyle = {
  background: 'rgba(255, 255, 255, 0.97)',
  border: '1px solid #d4dbe6',
  borderRadius: 12,
  boxShadow: '0 12px 30px -12px rgba(15,23,42,0.25)',
  color: '#1c2536',
  fontSize: 12,
};

function BarGrad({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={from} />
        <stop offset="100%" stopColor={to} />
      </linearGradient>
    </defs>
  );
}

export default function Analytics() {
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    Promise.all([api.get<Kpi>('/analytics/kpi'), api.get<Report>('/analytics/report')]).then(([k, r]) => {
      setKpi(k); setReport(r);
    });
  }, []);

  if (!kpi || !report) return <Loading label="Crunching analytics" />;

  const pieData = Object.entries(kpi.applications).map(([name, value]) => ({ name, value }));
  const reliefBar = report.reliefStats.map((r) => ({
    name: r.name.length > 16 ? r.name.slice(0, 15) + '…' : r.name,
    released: Number(r.released),
    applications: r.applications,
  }));
  const timingData = report.stageTimings.map((t) => ({ name: `${t.relief_code.slice(0, 12)}·S${t.stage_number}`, days: Number(t.avg_days) }));
  const slaPct = report.sla.total_stages ? Math.round((report.sla.on_time / report.sla.total_stages) * 100) : 0;
  const districtData = report.byDistrict.map((d) => ({ name: d.district, cases: d.cases, released: Number(d.released) }));

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="violet"
        eyebrow="Layer 5 · Analytics"
        title="Analytics & Insights"
        sub="Live operational intelligence across the DBT pipeline — SLA adherence, officer efficiency and fund utilization."
        chips={[
          <span key="c" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <FolderOpen size={13} /> {kpi.cases} cases
          </span>,
          <span key="s" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <Landmark size={13} /> {report.byStage.length} workflow stages
          </span>,
          <span key="o" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <TrendingUp size={13} /> {report.officerEfficiency.length} officers tracked
          </span>,
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnimatedStat label="Total Cases" value={kpi.cases} icon={<FolderOpen size={20} />} accent="brand" />
        <AnimatedStat label="Fund Utilization" value={`${kpi.funds.utilization}%`} sub={`₹${kpi.funds.released.toLocaleString('en-IN')} of ₹${kpi.funds.total.toLocaleString('en-IN')}`} icon={<Percent size={20} />} accent="teal" />
        <AnimatedStat label="Open Escalations" value={kpi.escalations} icon={<Siren size={20} />} accent={kpi.escalations ? 'rose' : 'brand'} />
        <AnimatedStat label="SLA Adherence" value={`${slaPct}%`} sub={`${report.sla.on_time}/${report.sla.total_stages} stages on time`} icon={<BarChart3 size={20} />} accent="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          className="glass p-5"
        >
          <h2 className="card-title mb-4">Applications by status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} strokeWidth={0}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.06 }}
          className="glass p-5"
        >
          <h2 className="card-title mb-4">Fund released by relief type (₹)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={reliefBar}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
              <BarGrad id="barRelief" from="#8b5cf6" to="#d946ef" />
              <Bar dataKey="released" fill="url(#barRelief)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.12 }}
          className="glass p-5"
        >
          <h2 className="card-title mb-4">Average days per workflow stage</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={timingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(6,182,212,0.08)' }} />
              <BarGrad id="barDays" from="#06b6d4" to="#10b981" />
              <Bar dataKey="days" fill="url(#barDays)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.18 }}
          className="glass p-5"
        >
          <h2 className="card-title mb-4">Cases by district</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={districtData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(139,92,246,0.08)' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <BarGrad id="barCases" from="#8b5cf6" to="#a78bfa" />
              <BarGrad id="barReleased" from="#06b6d4" to="#22d3ee" />
              <Bar dataKey="cases" fill="url(#barCases)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="released" fill="url(#barReleased)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.24 }}
        className="glass mt-6"
      >
        <h2 className="card-title border-b border-slate-700/70 px-5 py-4">Officer efficiency</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="th">Officer</th>
              <th className="th">Role</th>
              <th className="th">Verifications</th>
              <th className="th">Approvals</th>
              <th className="th">Treasury confirmations</th>
            </tr></thead>
            <tbody>
              {report.officerEfficiency.map((o, i) => (
                <tr key={i} className="hover:bg-slate-800/60">
                  <td className="td font-semibold text-slate-300">{o.name}</td>
                  <td className="td"><span className="chip border border-brand-500/40 bg-brand-50 text-brand-600">{o.role}</span></td>
                  <td className="td">{o.verifications}</td>
                  <td className="td">{o.approvals}</td>
                  <td className="td">{o.confirmations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>
    </div>
  );
}
