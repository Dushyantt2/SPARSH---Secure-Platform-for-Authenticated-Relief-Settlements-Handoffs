import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { Loading, StatusBadge, useToast } from '../../components/ui';
import { HeroBanner, SlaBadge } from '../../components/dash';
import { ESignModal, SignatureStamp } from '../../components/ESign';
import { ArrowLeft, BadgeCheck, CheckCircle2, Circle, Timer, XCircle, Zap, Landmark, FileCheck2, Scale, ShieldCheck, Phone, PenLine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { ApplicationDetail, CaseRow, ReliefStageRule } from '../../api/types';
import { usePolling } from '../../lib/usePolling';
import { LivePulse } from '../../components/LivePulse';

const APPROVAL_COL: Record<string, keyof any> = { DWO: 'dwo_verification', DM: 'dm_approval', TREASURY: 'treasury_confirmation' };

function nextPendingApproval(stage: any, approvals: string[]): string | null {
  for (const role of approvals) {
    if (!stage[APPROVAL_COL[role]]) return role;
  }
  return null;
}

export default function OfficialCaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [cse, setCse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState<{ appId: number; stage: number; action: 'verify' | 'approve' } | null>(null);
  const toast = useToast();

  const load = async () => {
    const c = await api.get<any>(`/official/cases/${id}`);
    setCse(c);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);
  const lastSync = usePolling(load);

  const act = async (appId: number, action: 'verify' | 'approve' | 'confirm' | 'reject', stage: number, reason?: string, signature?: string) => {
    try {
      await api.post(`/official/applications/${appId}/${action}`, action === 'reject' ? { stage, reason } : { stage, note, signature });
      toast('success', `${action} recorded on stage ${stage}`);
      setNote('');
      setSigning(null);
      load();
    } catch (e: any) {
      toast('error', e.message);
      setSigning(null);
    }
  };

  const fireEvent = async (appId: number, event: string) => {
    try {
      await api.post(`/official/applications/${appId}/events`, { event });
      toast('success', `Event ${event} recorded; workflow advanced`);
      load();
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  if (loading) return <Loading label="Loading case" />;
  if (!cse) return <div className="glass p-8">Case not found.</div>;

  const mo = cse.master_object ?? {};
  const openApps = cse.applications?.filter((a: ApplicationDetail) => ['SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED'].includes(a.status)).length ?? 0;

  return (
    <div className="space-y-6">
      <Link to="/official/cases" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
        <ArrowLeft size={15} /> Back to cases
      </Link>

      <HeroBanner
        tone="brand"
        eyebrow={cse.is_duplicate ? 'Duplicate claim' : 'Case on file'}
        title={cse.case_number}
        sub={
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><Scale size={14} /> FIR <b className="font-mono">{cse.fir_number}</b></span>
            <span className="inline-flex items-center gap-1.5"><Landmark size={14} /> {cse.police_station} · {cse.district}</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Victim: <b>{cse.citizen?.name}</b></span>
            <span className="inline-flex items-center gap-1.5"><Phone size={14} /> {cse.citizen?.phone}</span>
          </p>
        }
        chips={[
          <span key="k" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <BadgeCheck size={13} /> eKYC {mo.kyc?.verified ? 'verified' : 'pending'}
          </span>,
          <span key="p" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <Landmark size={13} /> PFMS {mo.pfms?.verified ? 'validated' : (mo.pfms?.reason ?? '—')}
          </span>,
          <span key="e" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <Zap size={13} /> eCourts: {mo.ecourts?.exists ? (mo.ecourts.data?.stage ?? 'on file') : 'no reference'}
          </span>,
          <span key="a" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <Scale size={13} /> {openApps} open application(s)
          </span>,
        ]}
        actions={<LivePulse syncedAt={lastSync} label="Live sync" />}
      />

      <div className="space-y-6">
        {cse.applications.map((app: ApplicationDetail) => (
          <ApplicationBlock
            key={app.id}
            app={app}
            role={user!.role}
            onAct={act}
            onFire={fireEvent}
            note={note}
            setNote={setNote}
            onSign={(appId, stage, action) => setSigning({ appId, stage, action })}
          />
        ))}
      </div>

      <ESignModal
        open={!!signing}
        title={signing?.action === 'approve' ? 'Approve sanction — eSign' : 'Verify documents — eSign'}
        subtitle={signing?.action === 'approve'
          ? `You are approving stage ${signing?.stage} as the District Magistrate.`
          : `You are verifying stage ${signing?.stage} as the District Welfare Officer.`}
        signer={user!.name}
        onClose={() => setSigning(null)}
        onConfirm={(sig) => signing && act(signing.appId, signing.action, signing.stage, undefined, sig)}
      />
    </div>
  );
}

function ApplicationBlock({ app, role, onAct, onFire, note, setNote, onSign }: {
  app: ApplicationDetail;
  role: string;
  onAct: (appId: number, action: 'verify' | 'approve' | 'confirm' | 'reject', stage: number, reason?: string, signature?: string) => void;
  onFire: (appId: number, event: string) => void;
  note: string;
  setNote: (v: string) => void;
  onSign: (appId: number, stage: number, action: 'verify' | 'approve') => void;
}) {
  const approvalsByStage = useMemo(() => {
    const map: Record<number, string[]> = {};
    for (const s of app.relief?.stages ?? []) map[s.stage] = s.approvals;
    return map;
  }, [app]);

  const ordered = [...(app.stages ?? [])].sort((a, b) => a.stage_number - b.stage_number);
  const currentStage =
    ordered.find((s) => s.status === 'IN_PROGRESS' || s.status === 'PENDING') ??
    ordered.find((s) => s.status === 'REJECTED') ??
    ordered[ordered.length - 1];
  const next = currentStage ? nextPendingApproval(currentStage, approvalsByStage[currentStage.stage_number] ?? []) : null;

  const canActAs: Record<string, boolean> = {
    DWO: role === 'DWO' && next === 'DWO',
    DM: role === 'DM' && next === 'DM',
    TREASURY: role === 'TREASURY' && next === 'TREASURY',
  };
  const canAct = Object.values(canActAs).some(Boolean);

  const stageForEvent = [...(app.stages ?? [])].sort((a, b) => a.stage_number - b.stage_number)
    .find((s) => s.trigger_event && !s.trigger_met);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <p className="font-bold text-slate-200">{app.relief_name}</p>
          <p className="text-xs text-slate-500">₹{Number(app.amount_released).toLocaleString('en-IN')} / ₹{Number(app.amount_total).toLocaleString('en-IN')} released · {app.amount_total && Number(app.amount_released) > 0 ? Math.round((Number(app.amount_released) / Number(app.amount_total)) * 100) : 0}%</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Stage timeline */}
        <div className="space-y-4">
          {(app.stages ?? []).sort((a, b) => a.stage_number - b.stage_number).map((s) => {
            const approvals = approvalsByStage[s.stage_number] ?? [];
            const chainNext = nextPendingApproval(s, approvals);
            return (
              <div key={s.id} className={`rounded-xl border p-4 ${s.stage_number === currentStage?.stage_number && s.status !== 'APPROVED' ? 'border-brand-500/40 bg-brand-500/5' : 'border-slate-800 bg-ink-900/40'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {s.status === 'APPROVED' ? <CheckCircle2 size={20} className="text-emerald-500" />
                      : s.status === 'REJECTED' ? <XCircle size={20} className="text-rose-500" />
                      : s.status === 'IN_PROGRESS' ? <Timer size={20} className="animate-pulse-soft text-amber-500" />
                      : <Circle size={20} className="text-slate-500" />}
                    <div>
                      <p className="text-sm font-semibold text-slate-300">{s.trigger_event ? `Stage ${s.stage_number}: ${s.name}` : s.name}</p>
                      <p className="text-xs text-slate-500">{s.amount_percent}% disbursement · {s.status.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {approvals.map((a) => {
                      const done = !!(s as any)[APPROVAL_COL[a]];
                      const sig = done ? (s as any)[APPROVAL_COL[a]]?.signature : null;
                      return (
                        <span key={a} title={`${a} ${done ? 'approved' : 'pending'}`}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-800 text-slate-500'}`}>
                          {done ? (sig ? <SignatureStamp data={sig} className="h-5 w-12" /> : '✓') : '·'} {a}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {s.stage_number === currentStage?.stage_number && chainNext && (
                  <p className="mt-2 text-xs text-slate-500">Next approval: <span className="font-semibold text-brand-600">{chainNext}</span></p>
                )}
                {s.sla_due_at && (
                  <p className="mt-2"><SlaBadge due={s.sla_due_at} /></p>
                )}
              </div>
            );
          })}
        </div>

        {/* Action panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-ink-900/40 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Officer actions</h3>
            {stageForEvent ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Stage <span className="font-mono">{stageForEvent.trigger_event}</span> trigger not yet met.</p>
                {role === 'DWO' && (
                  <button className="btn-ghost w-full" onClick={() => onFire(app.id, stageForEvent.trigger_event!)}>
                    <Zap size={15} /> Simulate {stageForEvent.trigger_event!.replace(/_/g, ' ')}
                  </button>
                )}
              </div>
            ) : canAct && currentStage ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  {canActAs.DWO && 'As DWO — verify documents and validation for this stage.'}
                  {canActAs.DM && 'As DM — approve the sanction for this stage.'}
                  {canActAs.TREASURY && 'As Treasury — confirm the PFMS fund release.'}
                </p>
                <textarea className="input min-h-16" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn-success flex-1 inline-flex items-center justify-center gap-2" onClick={() => {
                    if (canActAs.TREASURY) onAct(app.id, 'confirm', currentStage.stage_number);
                    else onSign(app.id, currentStage.stage_number, canActAs.DM ? 'approve' : 'verify');
                  }}>
                    {canActAs.TREASURY ? 'Confirm release' : (<><PenLine size={15} /> {canActAs.DM ? 'Approve & eSign' : 'Verify & eSign'}</>)}
                  </button>
                  <button className="btn-danger" onClick={() => {
                    const reason = window.prompt('Rejection reason:');
                    if (reason) onAct(app.id, 'reject', currentStage.stage_number, reason);
                  }}>Reject</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {currentStage?.status === 'APPROVED' ? 'Stage approved and disbursed.' :
                 currentStage?.status === 'REJECTED' ? 'Stage rejected.' :
                 'Awaiting the next officer in the approval chain.'}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-ink-900/40 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Documents & transfers</h3>
            {(app.documents ?? []).map((d) => (
              <p key={d.id} className="flex items-center gap-2 text-sm text-slate-400">
                <FileCheck2 size={14} className="text-tealx-600" /> {d.name}
                <span className="font-mono text-[10px] text-slate-500">{d.hash.slice(0, 10)}…</span>
              </p>
            ))}
            <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
              {(app.transactions ?? []).map((t) => (
                <p key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <Landmark size={13} className="text-slate-500" />
                  <span className="text-slate-500">Stage {t.stage_number} · ₹{Number(t.amount).toLocaleString('en-IN')}</span>
                  <StatusBadge status={t.status} />
                  <span className="font-mono text-slate-500">{t.txid}</span>
                </p>
              ))}
              {(app.transactions ?? []).length === 0 && <p className="text-xs text-slate-500">No disbursements yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
