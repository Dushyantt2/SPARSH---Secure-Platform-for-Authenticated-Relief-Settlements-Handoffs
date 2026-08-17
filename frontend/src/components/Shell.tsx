import { useEffect, useState } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderOpen, Landmark, MessageSquareWarning,
  ShieldCheck, BarChart3, Home, Bell, LogOut, Menu, X, Scale,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import type { Role, Notification } from '../api/types';

const OFFICIAL_NAV: { to: string; label: string; icon: React.ReactNode; roles?: Role[] }[] = [
  { to: '/official', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/official/cases', label: 'Case Management', icon: <FolderOpen size={18} /> },
  { to: '/official/treasury', label: 'Disbursement', icon: <Landmark size={18} />, roles: ['TREASURY', 'ADMIN'] },
  { to: '/official/grievances', label: 'Grievances', icon: <MessageSquareWarning size={18} />, roles: ['DWO', 'DM', 'ADMIN'] },
  { to: '/official/audit', label: 'Audit Trail', icon: <ShieldCheck size={18} />, roles: ['ADMIN', 'DM'] },
  { to: '/official/analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
];

const CITIZEN_NAV: { to: string; label: string; icon: React.ReactNode; roles?: Role[] }[] = [
  { to: '/citizen', label: 'Overview', icon: <Home size={18} /> },
  { to: '/citizen/cases', label: 'My Cases & Relief', icon: <FolderOpen size={18} /> },
  { to: '/citizen/grievances', label: 'Grievances', icon: <MessageSquareWarning size={18} /> },
];

const ROLE_LABEL: Record<Role, string> = {
  CITIZEN: 'Citizen',
  DWO: 'District Welfare Officer',
  DM: 'District Magistrate',
  TREASURY: 'Treasury Officer',
  ADMIN: 'Administrator',
};

export function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-violet-500 to-tealx-500 font-display font-extrabold text-white shadow-glow ring-1 ring-white/30 ring-inset"
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      <span className="relative z-10">S</span>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/25 via-transparent to-transparent" />
    </div>
  );
}

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isCitizen = user?.role === 'CITIZEN';
  const nav = (isCitizen ? CITIZEN_NAV : OFFICIAL_NAV).filter((n) => !n.roles || (user && n.roles.includes(user.role)));

  const sidebar = (
    <div className="flex h-full flex-col border-r border-slate-700/80 bg-white/90 backdrop-blur-xl">
      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-5">
        <BrandLogo />
        <div>
          <p className="font-display text-lg font-extrabold tracking-tight text-slate-100">
            SPARSH
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">PoA · PCR DBT</p>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="grad-border rounded-2xl bg-white p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-violet-500 to-tealx-500 font-display text-sm font-extrabold text-white shadow-glow">
              {user?.name?.slice(0, 1) ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-200">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
            </div>
          </div>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-600 ring-1 ring-brand-500/15">
            <Scale size={11} /> {ROLE_LABEL[user?.role ?? 'CITIZEN']}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'text-brand-700' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-50 to-tealx-50/60 ring-1 ring-brand-500/15"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-br from-brand-500 via-violet-500 to-tealx-500 text-white shadow-glow'
                      : 'bg-slate-800 text-slate-500 group-hover:bg-white group-hover:text-brand-500'
                  }`}
                >
                  {item.icon}
                </span>
                <span className="relative z-10">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
            <LogOut size={18} />
          </span>
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="absolute left-0 top-0 h-full w-64"
            >
              {sidebar}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-700/80 bg-white/70 px-5 backdrop-blur">
          <button className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 lg:hidden" onClick={() => setOpen(true)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex-1" />
          <BellPill />
        </header>
        <main className="flex-1 overflow-y-auto p-5 lg:p-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function BellPill() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    api.get<Notification[]>('/auth/notifications').then((n) => setCount(n.filter((x) => !x.read).length)).catch(() => setCount(0));
  }, []);
  return (
    <div className="relative rounded-xl border border-slate-700 bg-white p-2.5 text-slate-500 shadow-soft transition hover:border-brand-500/50 hover:text-brand-600">
      <Bell size={17} />
      {count !== null && count > 0 && (
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 px-1 text-[10px] font-bold text-white shadow-glow"
        >
          {count}
        </motion.span>
      )}
    </div>
  );
}
