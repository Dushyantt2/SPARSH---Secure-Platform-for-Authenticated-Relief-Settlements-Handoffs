import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { Loading, EmptyState, StatusBadge, useToast } from '../../components/ui';
import { HeroBanner, timeAgo } from '../../components/dash';
import { MessageSquareWarning, ArrowUpRight, Clock3, CheckCircle2, Users } from 'lucide-react';
import type { Grievance } from '../../api/types';
import { useAuth } from '../../context/AuthContext';

export default function OfficialGrievances() {
  const { user } = useAuth();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () => api.get<Grievance[]>('/official/grievances').then(setGrievances).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const update = async (g: Grievance, status: string, resolution?: string) => {
    try {
      await api.post(`/official/grievances/${g.id}`, { status, resolution: resolution ?? g.resolution });
      toast('success', `${g.ref} → ${status}`);
      load();
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  if (loading) return <Loading label="Loading grievances" />;

  const open = grievances.filter((g) => g.status === 'OPEN' || g.status === 'IN_PROGRESS').length;
  const resolved = grievances.filter((g) => g.status === 'RESOLVED').length;
  const escalated = grievances.filter((g) => g.status === 'ESCALATED').length;

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="amber"
        eyebrow="Layer 4 · Grievance"
        title="Grievance Engine"
        sub={`Tickets auto-assigned to the ${user?.role === 'DM' ? 'DM' : 'DWO'}. Escalate if unresolved.`}
        chips={[
          <span key="o" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <Clock3 size={13} /> {open} open
          </span>,
          <span key="r" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <CheckCircle2 size={13} /> {resolved} resolved
          </span>,
          <span key="e" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <ArrowUpRight size={13} /> {escalated} escalated
          </span>,
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-600 ring-1 ring-amber-500/15"><Clock3 size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{open}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Open tickets</p></div>
        </div>
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-tealx-50 p-2 text-tealx-600 ring-1 ring-tealx-500/15"><CheckCircle2 size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{resolved}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resolved</p></div>
        </div>
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-rose-50 p-2 text-rose-600 ring-1 ring-rose-500/15"><ArrowUpRight size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{escalated}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Escalated to DM</p></div>
        </div>
      </div>

      {grievances.length === 0 ? (
        <div className="glass p-8"><EmptyState title="No assigned grievances" icon={<MessageSquareWarning size={26} />} /></div>
      ) : (
        <div className="space-y-3">
          {grievances.map((g, i) => (
            <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.04 }} className="glass p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-100">{g.subject}</p>
                  <p className="mt-0.5 text-xs font-mono text-slate-500">{g.ref} · {timeAgo(g.created_at)}</p>
                </div>
                <StatusBadge status={g.status} />
              </div>
              <p className="mt-2 text-sm text-slate-500">{g.description}</p>
              {g.resolution && <p className="mt-3 rounded-lg border border-tealx-200 bg-tealx-50 px-3 py-2 text-sm text-tealx-700">{g.resolution}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => update(g, 'IN_PROGRESS')}>Mark in progress</button>
                <button className="btn-success" onClick={() => {
                  const r = window.prompt('Resolution note:', g.resolution ?? '');
                  if (r) update(g, 'RESOLVED', r);
                }}>Resolve</button>
                <button className="btn-danger" onClick={() => update(g, 'ESCALATED')}><ArrowUpRight size={15} /> Escalate to DM</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
