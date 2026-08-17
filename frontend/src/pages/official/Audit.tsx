import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Loading, EmptyState, StatusBadge, useToast } from '../../components/ui';
import { HeroBanner } from '../../components/dash';
import { ShieldCheck, FileCheck2, AlertTriangle, Scale } from 'lucide-react';
import type { AuditLog } from '../../api/types';
import { useAuth } from '../../context/AuthContext';

export default function Audit() {
  const { user } = useAuth();
  const canIntegrity = user?.role === 'ADMIN';
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [integrity, setIntegrity] = useState<{ valid: boolean; checked: number } | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = (actionFilter = '') => {
    setLoading(true);
    api.get<AuditLog[]>(`/audit?limit=200`).then((all) => {
      setLogs(actionFilter ? all.filter((l) => l.action.includes(actionFilter)) : all);
      setLoading(false);
    });
  };
  useEffect(() => {
    load();
    if (canIntegrity) {
      api.get<{ valid: boolean; checked: number }>('/audit/integrity').then(setIntegrity).catch(() => {});
    }
  }, []);

  const check = async () => {
    try {
      const r = await api.get<{ valid: boolean; checked: number }>('/audit/integrity');
      setIntegrity(r);
      toast(r.valid ? 'success' : 'error', r.valid ? `Hash chain verified (${r.checked} records)` : 'INTEGRITY BREACH DETECTED');
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  if (loading) return <Loading label="Loading audit trail" />;

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="violet"
        eyebrow="Layer 4 · Governance"
        title="Audit Trail"
        sub="Append-only, hash-chained log of every action across all layers. Each record is a SHA-256 of its predecessor, making tampering detectable."
        chips={[
          <span key="a" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <Scale size={13} /> Append-only
          </span>,
          <span key="r" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <ShieldCheck size={13} /> SHA-256 chain
          </span>,
          <span key="c" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <FileCheck2 size={13} /> {logs.length} records
          </span>,
        ]}
        actions={canIntegrity ? <button className="btn-primary" onClick={check}><FileCheck2 size={15} /> Run integrity check</button> : undefined}
      />

      {canIntegrity && (
        <div className={`mb-6 flex items-center gap-3 rounded-2xl border p-4 ${integrity?.valid ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
          {integrity?.valid ? <ShieldCheck size={22} className="text-emerald-500" /> : <AlertTriangle size={22} className="text-rose-500" />}
          <div>
            <p className="font-semibold text-slate-700">{integrity?.valid ? 'Audit chain is intact' : 'Audit chain check needed'}</p>
            <p className="text-xs text-slate-500">{integrity?.valid ? `${integrity.checked} records verified against their predecessor hashes.` : 'Run an integrity check to verify the hash chain.'}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {['', 'CASE_CREATED', 'DWO', 'DM_', 'PFMS', 'TREASURY', 'LOGIN', 'RELIEF', 'GRIEVANCE'].map((f) => (
          <button key={f} onClick={() => { setFilter(f); load(f); }}
            className={`chip border transition ${filter === f ? 'border-brand-500 bg-brand-100 text-brand-600' : 'border-slate-700 bg-ink-800/60 text-slate-400 hover:text-slate-300'}`}>
            {f || 'All'}
          </button>
        ))}
      </div>

      <div className="glass overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState title="No audit records" />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-800"><tr>
                <th className="th">Timestamp</th>
                <th className="th">Actor</th>
                <th className="th">Action</th>
                <th className="th">Entity</th>
                <th className="th">Hash</th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/60 align-top">
                    <td className="td whitespace-nowrap text-xs text-slate-500">{new Date(l.ts).toLocaleString('en-IN')}</td>
                    <td className="td"><p className="text-slate-300">{l.actor_name}</p><p className="text-[11px] text-slate-500">{l.actor_role}</p></td>
                    <td className="td"><StatusBadge status={l.action} /></td>
                    <td className="td text-xs text-slate-400">{l.entity_type}<span className="text-slate-600"> #{l.entity_id ?? '—'}</span></td>
                    <td className="td font-mono text-[10px] text-slate-600">{l.hash.slice(0, 18)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
