import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Loading, EmptyState, StatusBadge, useToast } from '../../components/ui';
import { HeroBanner, timeAgo } from '../../components/dash';
import { MessageSquareWarning, Plus, ShieldAlert, Clock3, CheckCircle2 } from 'lucide-react';
import type { Grievance } from '../../api/types';

export default function CitizenGrievances() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const toast = useToast();

  const load = () => api.get<Grievance[]>('/citizen/grievances').then(setGrievances).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const g = await api.post<Grievance>('/citizen/grievances', { subject, description });
      toast('success', `Grievance ${g.ref} raised`);
      setOpen(false); setSubject(''); setDescription('');
      load();
    } catch (err: any) {
      toast('error', err.message);
    }
  };

  if (loading) return <Loading label="Loading grievances" />;

  const openCount = grievances.filter((g) => g.status === 'OPEN' || g.status === 'IN_PROGRESS').length;
  const resolvedCount = grievances.filter((g) => g.status === 'RESOLVED').length;

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="amber"
        eyebrow="Layer 4 · Grievance"
        title="Grievances"
        sub="Raise complaints or follow up on pending cases. New tickets are auto-assigned to the District Welfare Officer."
        actions={<button className="rounded-xl bg-white/95 px-4 py-2 text-sm font-bold text-amber-700 shadow-lift transition hover:bg-white" onClick={() => setOpen(true)}><Plus size={16} className="mr-1 inline" /> Raise grievance</button>}
        chips={[
          <span key="o" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <Clock3 size={13} /> {openCount} in progress
          </span>,
          <span key="r" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <CheckCircle2 size={13} /> {resolvedCount} resolved
          </span>,
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-600 ring-1 ring-amber-500/15"><Clock3 size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{openCount}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Open tickets</p></div>
        </div>
        <div className="glass flex items-center gap-3 p-4">
          <div className="rounded-lg bg-tealx-50 p-2 text-tealx-600 ring-1 ring-tealx-500/15"><CheckCircle2 size={16} /></div>
          <div><p className="font-display text-lg font-extrabold text-slate-100">{resolvedCount}</p><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resolved</p></div>
        </div>
      </div>

      {grievances.length === 0 ? (
        <div className="glass p-8"><EmptyState title="No grievances" subtitle="If a case is delayed or incorrect, raise a grievance and it will be assigned to the DWO." icon={<MessageSquareWarning size={26} />} /></div>
      ) : (
        <div className="space-y-3">
          {grievances.map((g, i) => (
            <div key={g.id} className="glass p-5" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-100">{g.subject}</p>
                  <p className="text-xs font-mono text-slate-500">{g.ref} · {timeAgo(g.created_at)}</p>
                </div>
                <StatusBadge status={g.status} />
              </div>
              <p className="mt-2 text-sm text-slate-500">{g.description}</p>
              {g.resolution && <p className="mt-3 rounded-lg border border-tealx-200 bg-tealx-50 px-3 py-2 text-sm text-tealx-700">Resolution: {g.resolution}</p>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <form onSubmit={submit} className="relative w-full max-w-lg animate-fade-up rounded-2xl border border-slate-700 bg-white p-6 shadow-lift">
            <h3 className="text-lg font-bold text-slate-900">Raise a grievance</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="label">Subject</label>
                <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="e.g. Delay in verification" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Describe the issue in detail…" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn-primary" type="submit">Submit</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
