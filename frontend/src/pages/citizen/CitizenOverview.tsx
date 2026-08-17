import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../lib/usePolling';
import { LivePulse } from '../../components/LivePulse';
import { Loading, EmptyState, StatusBadge } from '../../components/ui';
import { AnimatedStat, SlaBadge, MiniStat, timeAgo, HeroBanner } from '../../components/dash';
import {
  FolderOpen, FileText, TrendingUp, Hourglass, BadgeCheck, ShieldCheck, Landmark,
  Plus, MessageSquareWarning, FolderPlus, Clock3, CheckCircle2, XCircle, Timer,
  Circle, Wallet, FileCheck2, MailOpen, Sparkles, ArrowRight, QrCode, Siren,
} from 'lucide-react';
import type { CaseRow, Notification, DigiDoc, Grievance, ApplicationDetail } from '../../api/types';

type Tab = 'overview' | 'applications' | 'documents' | 'activity';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Sparkles size={16} /> },
  { id: 'applications', label: 'Applications', icon: <FileText size={16} /> },
  { id: 'documents', label: 'Documents', icon: <FileCheck2 size={16} /> },
  { id: 'activity', label: 'Activity', icon: <MailOpen size={16} /> },
];

const CHART_COLORS = ['#1A5FCE', '#FF9933', '#10B981', '#8b5cf6', '#f43f5e', '#38bdf8', '#f59e0b'];
const tooltipStyle = {
  background: 'rgba(255, 255, 255, 0.97)',
  border: '1px solid #d4dbe6',
  borderRadius: 12,
  boxShadow: '0 12px 30px -12px rgba(15,23,42,0.25)',
  color: '#1c2536',
  fontSize: 12,
};

export default function CitizenOverview() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [digiDocs, setDigiDocs] = useState<DigiDoc[]>([]);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [details, setDetails] = useState<ApplicationDetail[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const load = () =>
    Promise.all([
      api.get<CaseRow[]>('/citizen/cases'),
      api.get<Notification[]>('/auth/notifications'),
    ]).then(([c, n]) => {
      setCases(c);
      setNotifs(n);
      setLoading(false);
    }).catch(() => setLoading(false));
  const lastSync = usePolling(load);

  useEffect(() => {
    api.get<DigiDoc[]>('/citizen/digilocker').then(setDigiDocs).catch(() => {});
    api.get<Grievance[]>('/citizen/grievances').then(setGrievances).catch(() => {});
  }, []);

  const apps = useMemo(() => cases.flatMap((c) => c.applications ?? []), [cases]);
  const inProgress = apps.filter((a) => a.status === 'UNDER_VERIFICATION').length;
  const released = apps.reduce((s, a) => s + Number(a.amount_released), 0);
  const claimed = apps.reduce((s, a) => s + Number(a.amount_total), 0);

  const loadDetails = async () => {
    if (details) return;
    const all = await Promise.all(
      apps.map((a) => api.get<ApplicationDetail>(`/citizen/applications/${a.id}`).catch(() => null))
    );
    setDetails(all.filter((x): x is ApplicationDetail => !!x));
  };

  const selectTab = (t: Tab) => {
    setTab(t);
    if (t === 'applications') void loadDetails();
    if (t === 'documents') void loadDetails();
  };

  if (loading) return <Loading label="Loading your dashboard" />;

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow="Verified citizen"
        title={<>{greeting()}, {user?.name?.split(' ')[0]} <span className="align-middle text-2xl">🇮🇳</span></>}
        sub={
          <p className="flex items-start gap-2">
            <BadgeCheck size={17} className="mt-0.5 shrink-0 text-white" />
            Track your relief applications under the PCR Act, 1955 and the Scheduled Castes &amp; Scheduled Tribes (Prevention of Atrocities) Act, 1989 — end to end.
          </p>
        }
        chips={[
          <span key="v" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
            <ShieldCheck size={13} /> Verified Citizen
          </span>,
          <span key="a" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
            <QrCode size={13} /> {maskedAadhaar(user?.aadhaar ?? null)}
          </span>,
          <span key="d" className="hidden rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20 sm:inline-flex">
            {todayStr()}
          </span>,
        ]}
        actions={
          <>
            <Link to="/citizen/cases" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-700 shadow-lift transition-transform hover:-translate-y-0.5">
              <Plus size={16} /> Register new relief
            </Link>
            <div className="flex items-center gap-2">
              <LivePulse syncedAt={lastSync} label="Auto-refresh" />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-[11px] font-semibold text-white/80 ring-1 ring-white/20">
                <Clock3 size={12} /> SLA tracked
              </span>
            </div>
          </>
        }
      />

      {/* Animated stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnimatedStat label="Active Cases" value={cases.length} icon={<FolderOpen size={20} />} accent="brand" />
        <AnimatedStat label="Relief Applications" value={apps.length} icon={<FileText size={20} />} accent="sky" />
        <AnimatedStat label="Funds Received" value={released} currency icon={<Wallet size={20} />} accent="teal" sub={claimed > 0 ? `of ₹${claimed.toLocaleString('en-IN')} claimed` : undefined} />
        <AnimatedStat label="In Progress" value={inProgress} icon={<Hourglass size={20} />} accent="amber" sub={inProgress > 0 ? 'under verification' : 'all settled'} />
      </div>

      {/* Tab bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="glass inline-flex gap-1 p-1.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => selectTab(t.id)}
              className={`relative rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${tab === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab === t.id && (
                <motion.span layoutId="cit-tab-pill"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500 via-violet-500 to-tealx-500 shadow-glow"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
              )}
              <span className="relative z-10 flex items-center gap-1.5">{t.icon}{t.label}</span>
            </button>
          ))}
        </div>
        <Link to="/citizen/cases" className="btn-primary"><Plus size={16} /> Register new relief</Link>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}>
          {tab === 'overview' && (
            <OverviewTab cases={cases} apps={apps} released={released} claimed={claimed} notifs={notifs} />
          )}
          {tab === 'applications' && <ApplicationsTab details={details} apps={apps} loading={!details} />}
          {tab === 'documents' && <DocumentsTab docs={digiDocs} details={details} />}
          {tab === 'activity' && <ActivityTab notifs={notifs} grievances={grievances} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Documents tab                                                        */
/* ------------------------------------------------------------------ */
function Hero({ name, aadhaar, lastSync }: { name: string; aadhaar: string | null; lastSync: number }) {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const masked = aadhaar ? `XXXX-XXXX-${aadhaar.replace(/[^0-9]/g, '').slice(-4)}` : 'Aadhaar pending';

  return (
    <div className="relative overflow-hidden rounded-3xl grad-border">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-violet-600 to-tealx-700" />
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="aurora -left-16 -top-16 h-64 w-64 animate-aurora bg-white/25" />
      <div className="aurora -bottom-24 -right-10 h-72 w-72 animate-aurora bg-saffron-400/30" style={{ animationDelay: '-6s' }} />
      <div className="aurora bottom-10 left-1/3 h-56 w-56 animate-aurora bg-brand-300/25" style={{ animationDelay: '-12s' }} />

      <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm ring-1 ring-white/25">
              <ShieldCheck size={13} /> Verified Citizen
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 backdrop-blur-sm ring-1 ring-white/20">
              <QrCode size={13} /> {masked}
            </span>
          </div>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            {greeting}, {name.split(' ')[0]} <span className="align-middle text-2xl">🇮🇳</span>
          </motion.h1>
          <p className="mt-2 text-sm font-medium text-white/80">{today}</p>
          <p className="mt-4 flex max-w-xl items-start gap-2 text-sm leading-relaxed text-white/75">
            <BadgeCheck size={17} className="mt-0.5 shrink-0 text-white" />
            Track your relief applications under the PCR Act, 1955 and the Scheduled Castes &amp; Scheduled Tribes (Prevention of Atrocities) Act, 1989 — end to end.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3">
          <Link to="/citizen/cases" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-700 shadow-lift transition-transform hover:-translate-y-0.5">
            <Plus size={16} /> Register new relief
          </Link>
          <div className="flex items-center gap-2">
            <LivePulse syncedAt={lastSync} label="Auto-refresh" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-[11px] font-semibold text-white/80 ring-1 ring-white/20">
              <Clock3 size={12} /> SLA tracked
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated stat card                                                   */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Overview tab                                                         */
/* ------------------------------------------------------------------ */
function OverviewTab({ cases, apps, released, claimed, notifs }: {
  cases: CaseRow[]; apps: ApplicationSummaryLike[]; released: number; claimed: number; notifs: Notification[];
}) {
  const statuses = apps.reduce((m, a) => { m[a.status] = (m[a.status] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const pieData = Object.entries(statuses).map(([name, value]) => ({ name, value }));
  const utilization = claimed > 0 ? Math.round((released / claimed) * 100) : 0;

  const reliefFunds = apps.reduce((m, a) => {
    m[a.relief_name] = (m[a.relief_name] ?? 0) + Number(a.amount_released);
    return m;
  }, {} as Record<string, number>);
  const fundData = Object.entries(reliefFunds)
    .map(([name, value]) => ({ name: name.length > 16 ? name.slice(0, 15) + '…' : name, value }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 6);

  const pending = apps.filter((a) => a.status !== 'FUND_RELEASED' && a.status !== 'CLOSED' && a.status !== 'REJECTED');
  const recent = [...apps].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status donut */}
        <section className="glass p-5 lg:col-span-1">
          <h2 className="card-title mb-4">Application status</h2>
          {pieData.length === 0 ? (
            <EmptyState title="No applications" subtitle="Register a case and apply for relief to begin." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {pieData.map((p, i) => (
                  <span key={p.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    {p.name.replace(/_/g, ' ')} · {p.value}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Funds by relief */}
        <section className="glass p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="card-title">Relief funds released (₹)</h2>
            <span className="chip border border-tealx-300 bg-tealx-50 text-tealx-600">
              <TrendingUp size={13} /> {utilization}% of claim
            </span>
          </div>
          {fundData.length === 0 ? (
            <EmptyState title="No disbursements yet" subtitle="Approved funds will appear here after DWO, DM and Treasury clearance." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={fundData}>
                <defs>
                  <linearGradient id="fundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1A5FCE" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(26,95,206,0.06)' }} formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Bar dataKey="value" fill="url(#fundGrad)" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent applications with progress */}
        <section className="glass p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="card-title">Recent applications</h2>
            <Link to="/citizen/cases" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500">All cases <ArrowRight size={13} /></Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState title="No applications yet" subtitle="Register a case from your FIR to start claiming relief." />
          ) : (
            <div className="space-y-3">
              {recent.map((a) => <AppRow key={a.id} app={a} />)}
            </div>
          )}
        </section>

        {/* Notifications preview + quick links */}
        <section className="glass p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="card-title">Recent updates</h2>
            <span className="chip border border-brand-500/30 bg-brand-50 text-brand-600">{notifs.length} total</span>
          </div>
          {notifs.length === 0 ? (
            <EmptyState title="No notifications" subtitle="You will be alerted on every approval and fund transfer." />
          ) : (
            <div className="space-y-2.5">
              {notifs.slice(0, 5).map((n) => (
                <div key={n.id} className="flex gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                  <MailOpen size={15} className="mt-0.5 shrink-0 text-brand-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <QuickLink to="/citizen/cases" icon={<FolderOpen size={18} />} label="Register new relief" />
            <QuickLink to="/citizen/grievances" icon={<MessageSquareWarning size={18} />} label="Raise a grievance" />
          </div>
        </section>
      </div>

      {/* Active pipeline */}
      {pending.length > 0 && (
        <section className="glass p-5">
          <div className="mb-4 flex items-center gap-2">
            <Siren size={16} className="text-amber-500" />
            <h2 className="card-title">Active pipeline</h2>
            <span className="chip border border-amber-300 bg-amber-50 text-amber-600">{pending.length} awaiting clearance</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((a) => <PipelineCard key={a.id} app={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Applications tab                                                     */
/* ------------------------------------------------------------------ */
function ApplicationsTab({ details, apps, loading }: { details: ApplicationDetail[] | null; apps: ApplicationSummaryLike[]; loading: boolean }) {
  if (loading) return <div className="glass p-8"><Loading label="Loading application details" /></div>;
  const rows = details && details.length > 0 ? details : apps;
  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <div className="glass p-8"><EmptyState title="No applications" subtitle="Register a case from your FIR to apply for relief." /></div>
      )}
      {rows.map((a) => <ApplicationCard key={a.id} app={a as ApplicationDetail} />)}
    </div>
  );
}

function ApplicationCard({ app }: { app: ApplicationDetail }) {
  const [open, setOpen] = useState(false);
  const stages = app.stages ?? [];
  const released = Number(app.amount_released);
  const total = Number(app.amount_total);
  const pct = total > 0 ? Math.round((released / total) * 100) : 0;
  const active = stages.find((s) => s.status === 'IN_PROGRESS');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-slate-200">{app.relief_name}</p>
            <StatusBadge status={app.status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Case {app.case?.case_number ?? '—'} · Stage {app.current_stage} · Updated {timeAgo(app.updated_at)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-36">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-400">Released</span>
              <span className="font-semibold text-tealx-600">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-tealx-500 to-emerald-500" />
            </div>
          </div>
          <span className="hidden text-right sm:block">
            <p className="text-sm font-bold text-slate-200">₹{released.toLocaleString('en-IN')}</p>
            <p className="text-xs text-slate-500">of ₹{total.toLocaleString('en-IN')}</p>
          </span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="border-t border-slate-800 px-5 py-5">
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Workflow stages</h3>
                  <div className="space-y-3">
                    {stages.map((s) => <StageRow key={s.id} s={s} />)}
                  </div>
                  {app.rejection_reason && (
                    <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      Rejected: {app.rejection_reason}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Documents & transactions</h3>
                  <div className="space-y-1.5">
                    {(app.documents ?? []).map((d) => (
                      <p key={d.id} className="flex items-center gap-2 text-sm text-slate-500">
                        <FileCheck2 size={14} className="text-tealx-600" /> {d.name}
                        <span className="text-xs text-slate-500">· {d.status.toLowerCase()}</span>
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
                  {active && active.sla_due_at && <SlaBadge due={active.sla_due_at} />}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Documents tab                                                        */
/* ------------------------------------------------------------------ */
function DocumentsTab({ docs, details }: { docs: DigiDoc[]; details: ApplicationDetail[] | null }) {
  const byType = docs.reduce((m, d) => {
    const key = d.type_label || d.doc_type;
    m[key] = m[key] ?? [];
    m[key].push(d);
    return m;
  }, {} as Record<string, DigiDoc[]>);

  const verifiedHashes = new Set<string>();
  (details ?? []).forEach((a) => (a.documents ?? []).forEach((d) => { if (d.status === 'VERIFIED') verifiedHashes.add(d.name); }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Vault documents" value={docs.length} icon={<FileCheck2 size={16} />} />
        <MiniStat label="Applied apps" value={details?.length ?? 0} icon={<FileText size={16} />} />
        <MiniStat label="Verified docs" value={verifiedHashes.size} icon={<BadgeCheck size={16} />} />
        <MiniStat label="Types" value={Object.keys(byType).length} icon={<FolderPlus size={16} />} />
      </div>

      {docs.length === 0 ? (
        <div className="glass p-8"><EmptyState title="No documents in your DigiLocker vault" icon={<FileCheck2 size={26} />} /></div>
      ) : (
        Object.entries(byType).map(([type, list]) => (
          <section key={type} className="glass p-5">
            <h2 className="card-title mb-3">{type} <span className="text-xs font-semibold text-slate-400">({list.length})</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((d) => {
                const verified = verifiedHashes.has(d.name);
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                    <div className={`rounded-lg p-2 ${verified ? 'bg-tealx-50 text-tealx-600' : 'bg-slate-700 text-slate-500'}`}>
                      {verified ? <ShieldCheck size={16} /> : <FileText size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-300">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.doc_type}</p>
                    </div>
                    {verified ? (
                      <span className="chip border border-tealx-300 bg-tealx-50 text-tealx-600">Verified</span>
                    ) : (
                      <span className="chip border border-slate-600 bg-slate-100 text-slate-500">In vault</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Activity tab                                                         */
/* ------------------------------------------------------------------ */
function ActivityTab({ notifs, grievances }: { notifs: Notification[]; grievances: Grievance[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="glass p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="card-title">Notifications</h2>
          <span className="chip border border-brand-500/30 bg-brand-50 text-brand-600">{notifs.length} total</span>
        </div>
        {notifs.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <div className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-slate-200">
            {notifs.map((n) => (
              <div key={n.id} className="relative flex gap-3 pl-0">
                <span className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-brand-500 shadow-soft" />
                <div className="ml-6 min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{n.title}</p>
                  <p className="text-xs text-slate-500">{n.body}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="card-title">My grievances</h2>
          <Link to="/citizen/grievances" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500">All grievances <ArrowRight size={13} /></Link>
        </div>
        {grievances.length === 0 ? (
          <EmptyState title="No grievances raised" subtitle="Raise a complaint about your application at any time." />
        ) : (
          <div className="space-y-3">
            {grievances.slice(0, 6).map((g) => (
              <div key={g.id} className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-200">{g.subject}</p>
                  <StatusBadge status={g.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{g.description}</p>
                <p className="mt-1 text-[11px] text-slate-500">Ref {g.ref} · {timeAgo(g.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared small pieces                                                  */
/* ------------------------------------------------------------------ */
type ApplicationSummaryLike = { id: number; status: string; relief_name: string; amount_total: string; amount_released: string; updated_at: string; current_stage: number };

function AppRow({ app }: { app: ApplicationSummaryLike }) {
  const released = Number(app.amount_released);
  const total = Number(app.amount_total);
  const pct = total > 0 ? Math.round((released / total) * 100) : 0;
  return (
    <Link to="/citizen/cases" className="block rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 transition hover:border-brand-500/40 hover:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-300">{app.relief_name}</p>
        <StatusBadge status={app.status} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-tealx-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-slate-400">{pct}%</span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">₹{released.toLocaleString('en-IN')} / ₹{total.toLocaleString('en-IN')} · stage {app.current_stage}</p>
    </Link>
  );
}

function PipelineCard({ app }: { app: ApplicationSummaryLike }) {
  return (
    <Link to="/citizen/cases" className="group glass p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-bold text-slate-300">{app.relief_name}</p>
        <Timer size={16} className="shrink-0 animate-pulse-soft text-amber-500" />
      </div>
      <p className="mt-1 text-xs text-slate-500">Stage {app.current_stage} · awaiting officer clearance</p>
      <div className="mt-3 flex items-center gap-1.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= app.current_stage ? 'bg-amber-400' : 'bg-slate-700'}`} />
        ))}
      </div>
    </Link>
  );
}

function StageRow({ s }: { s: { id: number; name: string; status: string; amount_percent: number; sla_due_at: string | null } }) {
  return (
    <div className="flex gap-3">
      {s.status === 'APPROVED' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
        : s.status === 'REJECTED' ? <XCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
        : s.status === 'IN_PROGRESS' ? <Timer size={18} className="mt-0.5 shrink-0 animate-pulse-soft text-amber-500" />
        : <Circle size={18} className="mt-0.5 shrink-0 text-slate-500" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-300">{s.name}</p>
          {s.status === 'IN_PROGRESS' && s.sla_due_at && <SlaBadge due={s.sla_due_at} />}
        </div>
        <p className="text-xs text-slate-500">{s.amount_percent}% of relief · {s.status.replace(/_/g, ' ')}</p>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function maskedAadhaar(aadhaar: string | null) {
  return aadhaar ? `XXXX-XXXX-${aadhaar.replace(/[^0-9]/g, '').slice(-4)}` : 'Aadhaar pending';
}

function todayStr() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 transition hover:border-brand-500/50 hover:bg-brand-50">
      <span className="rounded-lg bg-white p-2 text-brand-600 shadow-soft">{icon}</span>
      <span className="text-sm font-semibold text-slate-300 group-hover:text-brand-700">{label}</span>
    </Link>
  );
}
