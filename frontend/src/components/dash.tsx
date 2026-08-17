import { motion } from 'framer-motion';
import { Clock3 } from 'lucide-react';
import { useCountUp } from '../lib/useCountUp';

/* ------------------------------------------------------------------ */
/* Shared dashboard primitives (used by citizen + official dashboards)  */
/* ------------------------------------------------------------------ */

export const DASH_ACCENTS: Record<string, { icon: string; glow: string; ring: string; grad: string }> = {
  brand: { icon: 'bg-brand-50 text-brand-600', glow: 'bg-brand-400/40', ring: 'ring-brand-500/20', grad: 'from-brand-500 to-violet-500' },
  teal: { icon: 'bg-tealx-50 text-tealx-600', glow: 'bg-tealx-400/40', ring: 'ring-tealx-500/20', grad: 'from-tealx-500 to-emerald-500' },
  amber: { icon: 'bg-amber-50 text-amber-600', glow: 'bg-amber-400/40', ring: 'ring-amber-500/20', grad: 'from-amber-500 to-saffron-500' },
  rose: { icon: 'bg-rose-50 text-rose-600', glow: 'bg-rose-400/40', ring: 'ring-rose-500/20', grad: 'from-rose-500 to-orange-500' },
  sky: { icon: 'bg-sky-50 text-sky-600', glow: 'bg-sky-400/40', ring: 'ring-sky-500/20', grad: 'from-sky-500 to-brand-500' },
  violet: { icon: 'bg-violet-50 text-violet-600', glow: 'bg-violet-400/40', ring: 'ring-violet-500/20', grad: 'from-violet-500 to-brand-500' },
};

export function AnimatedStat({ label, value, icon, accent = 'brand', currency, sub, progress }: {
  label: string; value: number | string; icon: React.ReactNode; accent?: keyof typeof DASH_ACCENTS; currency?: boolean; sub?: string; progress?: number;
}) {
  const numeric = typeof value === 'number';
  const live = useCountUp(numeric ? value : 0);
  const a = DASH_ACCENTS[accent];
  const shown = numeric
    ? currency ? `₹${Math.round(live).toLocaleString('en-IN')}` : Math.round(live).toLocaleString('en-IN')
    : String(value);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -3 }} className="glass relative overflow-hidden p-5 transition-shadow duration-300 hover:shadow-lift">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${a.glow}`} />
      <div className="flex items-center gap-4">
        <div className={`relative rounded-xl p-2.5 ring-1 ${a.ring} ${a.icon}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="truncate font-display text-[1.55rem] font-extrabold tracking-tight text-slate-100">{shown}</p>
          {sub && <p className="truncate text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
      {typeof progress === 'number' && (
        <div className={`mt-3 h-1 overflow-hidden rounded-full bg-gradient-to-r ${a.grad} opacity-70`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      )}
    </motion.div>
  );
}

export function SlaBadge({ due }: { due: string }) {
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  const cls = days < 0 ? 'border-rose-300 bg-rose-50 text-rose-600'
    : days <= 3 ? 'border-amber-300 bg-amber-50 text-amber-600'
    : 'border-tealx-300 bg-tealx-50 text-tealx-600';
  return (
    <span className={`chip border ${cls}`}>
      <Clock3 size={12} /> SLA {days < 0 ? `overdue ${Math.abs(days)}d` : `${days}d left`}
    </span>
  );
}

export function MiniStat({ label, value, icon, accent = 'brand' }: { label: string; value: number; icon: React.ReactNode; accent?: keyof typeof DASH_ACCENTS }) {
  const a = DASH_ACCENTS[accent];
  return (
    <div className="glass flex items-center gap-3 p-4">
      <div className={`rounded-lg p-2 ring-1 ${a.ring} ${a.icon}`}>{icon}</div>
      <div>
        <p className="font-display text-lg font-extrabold text-slate-100">{value.toLocaleString('en-IN')}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN');
}

const HERO_TONES: Record<string, string> = {
  brand: 'from-brand-600 via-violet-600 to-tealx-700',
  teal: 'from-tealx-600 via-emerald-600 to-brand-700',
  amber: 'from-saffron-600 via-amber-600 to-brand-700',
  violet: 'from-violet-600 via-brand-600 to-tealx-700',
  rose: 'from-rose-600 via-violet-600 to-brand-700',
};

export function HeroBanner({ eyebrow, title, sub, chips, actions, tone = 'brand' }: {
  eyebrow: string; title: React.ReactNode; sub?: React.ReactNode; chips?: React.ReactNode[]; actions?: React.ReactNode; tone?: keyof typeof HERO_TONES;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl grad-border">
      <div className={`absolute inset-0 bg-gradient-to-br ${HERO_TONES[tone]}`} />
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="aurora -left-16 -top-16 h-64 w-64 animate-aurora bg-white/25" />
      <div className="aurora -bottom-24 -right-10 h-72 w-72 animate-aurora bg-saffron-400/30" style={{ animationDelay: '-6s' }} />
      <div className="aurora bottom-10 left-1/3 h-56 w-56 animate-aurora bg-brand-300/25" style={{ animationDelay: '-12s' }} />

      <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
        <div className="min-w-0">
          {chips && chips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">{chips}</div>
          )}
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            {title}
          </motion.h1>
          {sub && <div className="mt-3 max-w-xl text-sm leading-relaxed text-white/80">{sub}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-col items-stretch gap-3">{actions}</div>}
      </div>
    </div>
  );
}
