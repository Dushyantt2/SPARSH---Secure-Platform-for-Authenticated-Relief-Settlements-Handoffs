import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Loading, EmptyState, StatusBadge, Modal, useToast } from '../../components/ui';
import { HeroBanner } from '../../components/dash';
import { FolderOpen, Plus, AlertTriangle, Search, Fingerprint, FileText, ShieldCheck, FileCheck2 } from 'lucide-react';
import type { CaseRow } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../lib/usePolling';
import { LivePulse } from '../../components/LivePulse';

interface FirLookup {
  fir_number: string;
  fir_date: string;
  police_station: string;
  district: string;
  ipc_sections: string[];
  status: string;
  victim_name: string;
  existing_case_id: number | null;
  existing_case_number: string | null;
}

export default function CitizenCases() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const [wizard, setWizard] = useState(false);
  const [aadhaar, setAadhaar] = useState(user?.aadhaar ?? '');
  const [firs, setFirs] = useState<FirLookup[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);

  const load = () => api.get<CaseRow[]>('/citizen/cases').then(setCases).finally(() => setLoading(false));
  const lastSync = usePolling(load);

  const lookup = async () => {
    const q = aadhaar.replace(/[^0-9]/g, '');
    if (q.length !== 12) { toast('error', 'Enter a valid 12-digit Aadhaar number'); return; }
    setLookingUp(true);
    try {
      const list = await api.get<FirLookup[]>(`/citizen/firs?query=${q}`);
      setFirs(list);
      if (list.length === 0) toast('error', 'No FIRs found for this Aadhaar in CCTNS');
    } catch (e: any) {
      toast('error', e.message);
      setFirs([]);
    } finally {
      setLookingUp(false);
    }
  };

  const register = async (fir: FirLookup) => {
    setRegistering(fir.fir_number);
    try {
      const res = await api.post<any>('/citizen/cases', { fir_number: fir.fir_number });
      // A duplicate FIR maps to the existing case; either way we route the
      // citizen into that case so they can apply for a new relief.
      setWizard(false); setFirs([]);
      if (res.duplicate_flagged) {
        toast('info', `This FIR is already linked to case ${res.duplicate_of}. Opening it so you can apply for a relief.`);
      } else {
        toast('success', `Case ${res.case_number} registered. Details fetched from CCTNS via Aadhaar.`);
      }
      load();
      navigate(`/citizen/cases/${res.id}`);
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setRegistering(null);
    }
  };

  if (loading) return <Loading label="Loading your cases" />;

  const activeApps = (c: CaseRow) => (c.applications ?? []).filter((a) => ['SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED'].includes(a.status)).length;

  return (
    <div className="space-y-6">
      <HeroBanner
        tone="brand"
        eyebrow="Layer 1 · Ingestion"
        title="My Cases & Relief"
        sub="Enter your Aadhaar to pull the linked FIR from CCTNS automatically, then apply for relief under the PCR & PoA Acts."
        chips={[
          <span key="c" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <FolderOpen size={13} /> {cases.length} case(s)
          </span>,
          <span key="d" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <ShieldCheck size={13} /> FIR pulled via CCTNS
          </span>,
        ]}
        actions={
          <div className="flex items-center gap-2">
            <LivePulse syncedAt={lastSync} label="Live sync" />
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/95 px-4 py-2 text-sm font-bold text-brand-700 shadow-lift transition hover:bg-white" onClick={() => { setAadhaar(user?.aadhaar ?? ''); setFirs([]); setWizard(true); }}>
              <Plus size={16} /> Register new relief
            </button>
          </div>
        }
      />
      {cases.length === 0 ? (
        <div className="glass p-8">
          <EmptyState
            title="No cases registered"
            subtitle="Enter your Aadhaar number and the system will fetch the FIR(s) registered against it in CCTNS — no manual entry needed."
            icon={<FolderOpen size={26} />}
          />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cases.map((c) => (
            <Link key={c.id} to={`/citizen/cases/${c.id}`} className="glass p-5 transition-transform hover:-translate-y-1">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-100">{c.case_number}</p>
                  <p className="text-xs text-slate-500">{c.police_station} · {c.district}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activeApps(c) > 0 && <span className="chip border border-tealx-300 bg-tealx-50 text-tealx-600"><FileCheck2 size={12} /> {activeApps(c)} open</span>}
                  {c.is_duplicate && (
                    <span className="chip border border-rose-300 bg-rose-50 text-rose-600"><AlertTriangle size={12} /> duplicate</span>
                  )}
                </div>
              </div>
              <p className="mb-1 text-sm text-slate-400">FIR <span className="font-mono text-slate-300">{c.fir_number}</span></p>
              <div className="mb-3 flex flex-wrap gap-1">
                {c.ipc_sections?.slice(0, 3).map((s) => (
                  <span key={s} className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-400">{s}</span>
                ))}
              </div>
              <div className="space-y-2 border-t border-slate-800 pt-3">
                {(c.applications ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{a.relief_name}</span>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
                {(c.applications ?? []).length === 0 && (
                  <p className="text-xs text-slate-500">No relief applied yet — open to select reliefs.</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={wizard} onClose={() => { setWizard(false); setFirs([]); }} title="Register a new relief" wide>
        <div className="space-y-5">
          <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-500/15">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-700"><Fingerprint size={16} /> Aadhaar-based FIR lookup</p>
            <p className="mt-1 text-xs text-slate-500">
              Enter your 12-digit Aadhaar. SPARSH queries CCTNS and returns the FIR(s) registered against you with full case details — no manual FIR entry.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="input font-mono tracking-widest"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
              placeholder="XXXXXXXXXXXX"
              inputMode="numeric"
              maxLength={12}
            />
            <button className="btn-primary shrink-0" onClick={lookup} disabled={lookingUp}>
              <Search size={15} /> {lookingUp ? 'Looking up…' : 'Look up FIR'}
            </button>
          </div>

          {firs.length > 0 && (
            <div className="space-y-3">
              <p className="label">Matching FIRs in CCTNS ({firs.length})</p>
              {firs.map((f) => (
                <div key={f.fir_number} className="rounded-xl border border-slate-700 bg-ink-900/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 font-bold text-slate-200"><FileText size={16} className="text-brand-500" /> {f.fir_number}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{f.police_station} · {f.district} · filed {f.fir_date?.slice(0, 10)}</p>
                    </div>
                    <StatusBadge status={f.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.ipc_sections?.slice(0, 5).map((s) => (
                      <span key={s} className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-500">{s}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {f.existing_case_id ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-300/60">
                          <AlertTriangle size={12} /> Linked to {f.existing_case_number}
                        </span>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck size={13} className="text-tealx-600" /> Victim: {f.victim_name}</p>
                      )}
                    </div>
                    <button className="btn-success" disabled={registering === f.fir_number} onClick={() => register(f)}>
                      {registering === f.fir_number ? 'Opening…' : f.existing_case_id ? 'Apply for relief →' : 'Register this case'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
