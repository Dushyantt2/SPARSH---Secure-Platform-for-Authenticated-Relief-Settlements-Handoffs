import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Loading, EmptyState, StatusBadge, Modal, useToast } from '../../components/ui';
import {
  ArrowLeft, BadgeCheck, CheckCircle2, Circle, FileCheck2, Landmark, Timer, XCircle, ClipboardList, FileSignature,
} from 'lucide-react';
import type { CaseRow, ReliefType, DigiDoc, ApplicationDetail, ScreeningQuestion } from '../../api/types';
import { usePolling } from '../../lib/usePolling';
import { LivePulse } from '../../components/LivePulse';

export default function CaseDetail() {
  const { id } = useParams();
  const [cse, setCse] = useState<CaseRow | null>(null);
  const [reliefTypes, setReliefTypes] = useState<ReliefType[]>([]);
  const [digiDocs, setDigiDocs] = useState<DigiDoc[]>([]);
  const [apps, setApps] = useState<ApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedRelief, setSelectedRelief] = useState<ReliefType | null>(null);
  const [screening, setScreening] = useState<ScreeningQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no'>>({});
  const [declared, setDeclared] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const toast = useToast();

  const load = async () => {
    const [c, rt, dl] = await Promise.all([
      api.get<CaseRow>(`/citizen/cases/${id}`),
      api.get<ReliefType[]>('/relief-types'),
      api.get<DigiDoc[]>('/citizen/digilocker'),
    ]);
    setCse(c); setReliefTypes(rt); setDigiDocs(dl);
    const detail: ApplicationDetail[] = [];
    for (const a of c.applications ?? []) {
      detail.push(await api.get<ApplicationDetail>(`/citizen/applications/${a.id}`));
    }
    setApps(detail);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);
  const lastSync = usePolling(load);

  const openWizard = async () => {
    setWizardStep(1); setSelectedRelief(null); setSelectedDocs([]); setDeclared(false); setAnswers({});
    const q = await api.get<ScreeningQuestion[]>('/citizen/screening');
    setScreening(q);
    setWizard(true);
  };

  const submit = async () => {
    try {
      await api.post(`/citizen/cases/${id}/apply`, {
        relief_code: selectedRelief!.code,
        doc_ids: selectedDocs,
        screening: answers,
        declaration: declared,
      });
      toast('success', `Applied for ${selectedRelief!.name}`);
      setWizard(false); setSelectedRelief(null); setSelectedDocs([]); setDeclared(false); setAnswers({});
      load();
    } catch (e: any) {
      toast('error', e.message);
    }
  };

  if (loading) return <Loading label="Loading case" />;
  if (!cse) return <div className="glass p-8"><EmptyState title="Case not found" /></div>;

  const mo = cse.master_object ?? {};

  return (
    <div>
      <Link to="/citizen/cases" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
        <ArrowLeft size={15} /> Back to my cases
      </Link>

      <div className="glass p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{cse.case_number}</h1>
            <p className="mt-1 text-sm text-slate-500">
              FIR <span className="font-mono text-slate-400">{cse.fir_number}</span> · {cse.police_station} · registered {cse.fir_date?.slice(0, 10)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cse.ipc_sections?.map((s) => <span key={s} className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-500">{s}</span>)}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="text-slate-500">Identity (eKYC)</p>
            {mo.kyc?.verified ? (
              <p className="flex items-center gap-1 font-semibold text-emerald-600"><BadgeCheck size={15} /> Aadhaar verified</p>
            ) : <p className="font-semibold text-rose-600">Not verified</p>}
            <p className="mt-1 text-slate-500">Bank (PFMS)</p>
            {mo.pfms?.verified ? (
              <p className="flex items-center gap-1 font-semibold text-tealx-600"><Landmark size={15} /> {mo.pfms?.bank}</p>
            ) : <p className="font-semibold text-rose-600">{mo.pfms?.reason}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-100">Relief applications</h2>
        <div className="flex items-center gap-2">
          <LivePulse syncedAt={lastSync} />
          <button className="btn-primary" onClick={openWizard}>Apply for a new relief</button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {apps.length === 0 && (
          <div className="glass p-8"><EmptyState title="No relief applications yet" subtitle="Select a relief category and the required DigiLocker documents to begin." /></div>
        )}
        {apps.map((a) => <ApplicationCard key={a.id} app={a} />)}
      </div>

      {/* Apply wizard — follows the government relief process:
          1) select relief  2) eligibility screening  3) documents + declaration */}
      <Modal open={wizard} onClose={() => setWizard(false)} title="Apply for relief" wide>
        {/* Step indicator */}
        {selectedRelief && (
          <div className="mb-5 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  wizardStep >= s ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {wizardStep > s ? '✓' : s}
                </span>
                <span className={`hidden text-xs font-semibold sm:block ${wizardStep >= s ? 'text-slate-700' : 'text-slate-400'}`}>
                  {s === 1 ? 'Relief type' : s === 2 ? 'Eligibility' : 'Documents & declare'}
                </span>
              </div>
            ))}
          </div>
        )}

        {wizardStep === 1 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {reliefTypes.map((r) => (
              <button key={r.code} onClick={() => { setSelectedRelief(r); setSelectedDocs([]); setAnswers({}); setDeclared(false); setWizardStep(2); }}
                className="rounded-xl border border-slate-700 bg-ink-900/60 p-4 text-left transition hover:border-brand-500/60 hover:bg-ink-800">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-200">{r.name}</p>
                  <span className={`chip border ${r.category === 'CASE_LINKED' ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-sky-300 bg-sky-50 text-sky-600'}`}>
                    {r.category === 'CASE_LINKED' ? 'Case-linked' : 'Benefit-linked'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{r.description}</p>
                <p className="mt-2 text-xs text-slate-500">Required: {r.required_docs.join(', ')}</p>
              </button>
            ))}
          </div>
        ) : wizardStep === 2 ? (
          <div>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
              <div>
                <p className="font-semibold text-slate-700">{selectedRelief?.name}</p>
                <p className="text-xs text-slate-500">Step 2 · Answer the eligibility questionnaire truthfully.</p>
              </div>
              <button className="btn-ghost" onClick={() => { setSelectedRelief(null); setWizardStep(1); }}>Change</button>
            </div>
            <div className="space-y-4">
              {screening.map((q) => (
                <div key={q.id} className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
                  <p className="flex items-start gap-2 text-sm font-semibold text-slate-200">
                    <ClipboardList size={16} className="mt-0.5 shrink-0 text-brand-500" /> {q.question}
                  </p>
                  {q.hint && <p className="mt-1 text-xs text-slate-500">{q.hint}</p>}
                  <div className="mt-3 flex gap-2">
                    {(['yes', 'no'] as const).map((opt) => (
                      <button key={opt}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                          answers[q.id] === opt ? (opt === 'yes' ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white') : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}>
                        {opt === 'yes' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { setSelectedRelief(null); setWizardStep(1); }}>Back</button>
              <button className="btn-primary" disabled={screening.some((q) => !answers[q.id])}
                onClick={() => { setWizardStep(3); }}>
                Continue to documents
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
              <div>
                <p className="font-semibold text-slate-700">{selectedRelief?.name}</p>
                <p className="text-xs text-slate-500">Step 3 · Attach the required documents and declare.</p>
              </div>
              <button className="btn-ghost" onClick={() => setWizardStep(2)}>Back</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {digiDocs.map((d) => {
                const needed = (selectedRelief?.required_docs ?? []).includes(d.type_label);
                const active = selectedDocs.includes(d.id);
                return (
                  <button key={d.id} disabled={!needed}
                    onClick={() => setSelectedDocs((s) => active ? s.filter((x) => x !== d.id) : [...s, d.id])}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                      !needed ? 'border-slate-800 opacity-40'
                        : active ? 'border-tealx-500 bg-tealx-50'
                        : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
                    }`}>
                    {active ? <CheckCircle2 size={18} className="text-tealx-600" /> : <Circle size={18} className="text-slate-500" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-300">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.type_label}{!needed && ' · not required'}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span className="text-sm text-slate-400">
                <span className="flex items-center gap-1 font-semibold text-slate-200"><FileSignature size={15} /> Self-declaration</span>
                I hereby declare that the information furnished and the documents uploaded are true and correct, and I consent to SPARSH verifying my Aadhaar, FIR and bank details with the concerned departments.
              </span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setWizardStep(2)}>Back</button>
              <button className="btn-success" disabled={selectedDocs.length === 0 || !declared} onClick={submit}>
                Submit application
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ApplicationCard({ app }: { app: ApplicationDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left">
        <div>
          <p className="font-bold text-slate-200">{app.relief_name}</p>
          <p className="text-xs text-slate-500">Stage {app.current_stage} · ₹{Number(app.amount_released).toLocaleString('en-IN')} / ₹{Number(app.amount_total).toLocaleString('en-IN')} released</p>
        </div>
        <StatusBadge status={app.status} />
      </button>

      {open && (
        <div className="border-t border-slate-800 px-5 py-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Workflow stages</h3>
              <div className="space-y-3">
                {(app.stages ?? []).map((s) => (
                  <div key={s.id} className="flex gap-3">
                    {s.status === 'APPROVED' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                      : s.status === 'REJECTED' ? <XCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
                      : s.status === 'IN_PROGRESS' ? <Timer size={18} className="mt-0.5 shrink-0 animate-pulse-soft text-amber-500" />
                      : <Circle size={18} className="mt-0.5 shrink-0 text-slate-500" />}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-300">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        {s.amount_percent}% of relief · {s.status.replace(/_/g, ' ')}
                        {s.sla_due_at && <> · SLA due {new Date(s.sla_due_at).toLocaleDateString('en-IN')}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Documents & transactions</h3>
              <div className="space-y-1.5">
                {(app.documents ?? []).map((d) => (
                  <p key={d.id} className="flex items-center gap-2 text-sm text-slate-500">
                    <FileCheck2 size={14} className="text-tealx-600" /> {d.name}
                    <span className="text-xs text-slate-500">· hash verified</span>
                  </p>
                ))}
              </div>
              <div className="mt-4 space-y-1.5">
                {(app.transactions ?? []).map((t) => (
                  <p key={t.id} className="flex items-center gap-2 text-sm">
                    <Landmark size={14} className="text-slate-500" />
                    <span className="text-slate-500">Stage {t.stage_number} · ₹{Number(t.amount).toLocaleString('en-IN')}</span>
                    <StatusBadge status={t.status} />
                    <span className="font-mono text-xs text-slate-500">{t.txid}</span>
                  </p>
                ))}
              </div>
              {app.rejection_reason && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">Rejected: {app.rejection_reason}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
