import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { Loading, EmptyState, StatusBadge } from '../../components/ui';
import { HeroBanner } from '../../components/dash';
import { FolderOpen, AlertTriangle, Scale, FileSearch, Landmark, Fingerprint } from 'lucide-react';
import type { CaseRow } from '../../api/types';
import { usePolling } from '../../lib/usePolling';
import { LivePulse } from '../../components/LivePulse';

const FILTERS = [
  ['', 'All'],
  ['UNDER_VERIFICATION', 'Under verification'],
  ['APPROVED', 'Approved'],
  ['FUND_RELEASED', 'Fund released'],
  ['CLOSED', 'Closed'],
  ['REJECTED', 'Rejected'],
];

export default function OfficialCases() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchCases = () => api.get<CaseRow[]>(`/official/cases${filter ? `?status=${filter}` : ''}`).then(setCases);
  const load = () => {
    setLoading(true);
    fetchCases().finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filter]);
  const lastSync = usePolling(fetchCases);

  if (loading) return <Loading label="Loading cases" />;

  const dups = cases.filter((c) => c.is_duplicate).length;
  const reliefs = cases.reduce((s, c) => s + (c.relief_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="brand"
        eyebrow="Layer 2 · Workflow"
        title="Case Management"
        sub="Every incoming case from CCTNS/eCourts, with relief applications attached and chain-aware visibility for your role."
        chips={[
          <span key="c" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <Scale size={13} /> {cases.length} cases
          </span>,
          <span key="r" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <FolderOpen size={13} /> {reliefs} reliefs
          </span>,
          dups > 0 ? (
            <span key="d" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
              <AlertTriangle size={13} /> {dups} duplicate flags
            </span>
          ) : (
            <span key="d" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
              <Fingerprint size={13} /> no duplicates
            </span>
          ),
        ]}
        actions={<LivePulse syncedAt={lastSync} label="Live sync" />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600 ring-1 ring-brand-500/15"><Scale size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{cases.length}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Visible cases</p></div>
        </div>
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-tealx-50 p-2 text-tealx-600 ring-1 ring-tealx-500/15"><Landmark size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{reliefs}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Relief applications</p></div>
        </div>
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-rose-50 p-2 text-rose-600 ring-1 ring-rose-500/15"><AlertTriangle size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{dups}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Duplicate flags</p></div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`chip border transition ${filter === v ? 'border-brand-500 bg-brand-100 text-brand-600 shadow-soft' : 'border-slate-700 bg-ink-800/60 text-slate-400 hover:text-slate-300'}`}>
            {l}
          </button>
        ))}
      </div>

      {cases.length === 0 ? (
        <div className="glass p-8"><EmptyState title="No cases match this filter" icon={<FolderOpen size={26} />} /></div>
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Case</th>
                <th className="th">FIR</th>
                <th className="th">Citizen</th>
                <th className="th">District</th>
                <th className="th">Reliefs</th>
                <th className="th">Flag</th>
                <th className="th"></th>
              </tr></thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/60">
                    <td className="td"><p className="font-semibold text-slate-300">{c.case_number}</p><p className="text-xs text-slate-500">{new Date(c.created_at).toLocaleDateString('en-IN')}</p></td>
                    <td className="td font-mono text-slate-300">{c.fir_number}</td>
                    <td className="td">{c.citizen?.name}</td>
                    <td className="td">{c.district}</td>
                    <td className="td"><span className="chip border border-slate-700 bg-slate-800/60 text-slate-300">{c.relief_count ?? 0} relief(s)</span></td>
                    <td className="td">
                      {c.is_duplicate
                        ? <span className="chip border border-rose-500/40 bg-rose-50 text-rose-600"><AlertTriangle size={12} /> duplicate</span>
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="td text-right">
                      <Link to={`/official/cases/${c.id}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-600 ring-1 ring-brand-500/20 transition hover:bg-brand-50 hover:text-brand-700">
                        Open <FileSearch size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
