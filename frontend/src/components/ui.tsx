import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Inbox, CheckCircle2, XCircle, Info, X } from 'lucide-react';

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-brand-500" />;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
      <div className="relative">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-slate-700 border-t-brand-500" style={{ animationDuration: '0.9s' }} />
        <div className="absolute inset-0 animate-pulse-soft rounded-full bg-brand-500/20 blur-xl" />
      </div>
      <p className="text-sm font-medium text-slate-500 animate-pulse-soft">{label}…</p>
    </div>
  );
}

export function EmptyState({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="relative">
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-tealx-50 p-4 text-brand-500 ring-1 ring-brand-500/20">{icon ?? <Inbox size={26} />}</div>
        <div className="absolute inset-0 -z-10 rounded-2xl bg-brand-500/10 blur-lg" />
      </div>
      <p className="font-bold text-slate-300">{title}</p>
      {subtitle && <p className="max-w-sm text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-100/70 backdrop-blur-sm" onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl border border-slate-700 bg-white shadow-lift`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h3 className="font-bold text-slate-200">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-300">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mb-6 flex flex-wrap items-end justify-between gap-3"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-100 md:text-[1.85rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

const STATUS_STYLES: Record<string, { dot: string; cls: string }> = {
  SUBMITTED: { dot: 'bg-sky-500', cls: 'text-sky-600 border-sky-200 bg-sky-50' },
  UNDER_VERIFICATION: { dot: 'bg-amber-500', cls: 'text-amber-600 border-amber-200 bg-amber-50' },
  APPROVED: { dot: 'bg-brand-500', cls: 'text-brand-600 border-brand-200 bg-brand-50' },
  FUND_RELEASED: { dot: 'bg-tealx-500', cls: 'text-tealx-600 border-tealx-200 bg-tealx-50' },
  CLOSED: { dot: 'bg-emerald-500', cls: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
  REJECTED: { dot: 'bg-rose-500', cls: 'text-rose-600 border-rose-200 bg-rose-50' },
  IN_PROGRESS: { dot: 'bg-amber-500', cls: 'text-amber-600 border-amber-200 bg-amber-50' },
  PENDING: { dot: 'bg-slate-400', cls: 'text-slate-500 border-slate-300 bg-slate-100' },
  SUCCESS: { dot: 'bg-emerald-500', cls: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
  FAILED: { dot: 'bg-rose-500', cls: 'text-rose-600 border-rose-200 bg-rose-50' },
  RETRY: { dot: 'bg-orange-500', cls: 'text-orange-600 border-orange-200 bg-orange-50' },
  OPEN: { dot: 'bg-sky-500', cls: 'text-sky-600 border-sky-200 bg-sky-50' },
  RESOLVED: { dot: 'bg-emerald-500', cls: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
  ESCALATED: { dot: 'bg-rose-500', cls: 'text-rose-600 border-rose-200 bg-rose-50' },
  VERIFIED: { dot: 'bg-emerald-500', cls: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
  REGISTERED: { dot: 'bg-sky-500', cls: 'text-sky-600 border-sky-200 bg-sky-50' },
  CHARGE_SHEET_FILED: { dot: 'bg-brand-500', cls: 'text-brand-600 border-brand-200 bg-brand-50' },
  CONVICTED: { dot: 'bg-violet-500', cls: 'text-violet-600 border-violet-200 bg-violet-50' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { dot: 'bg-slate-400', cls: 'text-slate-500 border-slate-300 bg-slate-100' };
  return (
    <span className={`chip border ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const ACCENTS: Record<string, { icon: string; glow: string; ring: string }> = {
  brand: { icon: 'bg-brand-50 text-brand-600', glow: 'bg-brand-400/40', ring: 'ring-brand-500/20' },
  teal: { icon: 'bg-tealx-50 text-tealx-600', glow: 'bg-tealx-400/40', ring: 'ring-tealx-500/20' },
  amber: { icon: 'bg-amber-50 text-amber-600', glow: 'bg-amber-400/40', ring: 'ring-amber-500/20' },
  rose: { icon: 'bg-rose-50 text-rose-600', glow: 'bg-rose-400/40', ring: 'ring-rose-500/20' },
  sky: { icon: 'bg-sky-50 text-sky-600', glow: 'bg-sky-400/40', ring: 'ring-sky-500/20' },
};

export function StatCard({ label, value, sub, icon, accent = 'brand' }: { label: string; value: string | number; sub?: string; icon?: ReactNode; accent?: 'brand' | 'teal' | 'amber' | 'rose' | 'sky' }) {
  const a = ACCENTS[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="glass relative overflow-hidden p-5 transition-shadow duration-300 hover:shadow-lift"
    >
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${a.glow}`} />
      <div className="flex items-center gap-4">
        {icon && (
          <div className={`relative rounded-xl p-2.5 ring-1 ${a.ring} ${a.icon}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="truncate font-display text-[1.55rem] font-extrabold tracking-tight text-slate-100">{value}</p>
          {sub && <p className="truncate text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
}

// ------- Toasts -------
interface Toast { id: number; kind: 'success' | 'error' | 'info'; message: string }
const ToastCtx = createContext<(kind: Toast['kind'], message: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_ICON = {
  success: <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />,
  error: <XCircle size={18} className="shrink-0 text-rose-500" />,
  info: <Info size={18} className="shrink-0 text-sky-500" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-slate-700 bg-white px-4 py-3 shadow-lift"
            >
              {TOAST_ICON[t.kind]}
              <span className="text-sm font-medium text-slate-300">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
