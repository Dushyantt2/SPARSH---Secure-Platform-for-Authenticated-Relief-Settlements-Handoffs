import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PenLine, Eraser, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Modal } from './ui';

const VB_W = 600;
const VB_H = 220;

type Point = { x: number; y: number };
type Stroke = Point[];

function toSvgPath(strokes: Stroke[]): string {
  return strokes.map((pts) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  ).join(' ');
}

export function SignatureStamp({ data, className = '' }: { data: string; className?: string }) {
  if (!data) return null;
  const pts = parsePath(data);
  return (
    <motion.svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={`${className} h-12 w-36`}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'backOut' as const }}
      preserveAspectRatio="xMidYMid meet"
    >
      {pts.map((_, i) => (
        <path key={i} d={data} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ opacity: Math.max(0.45, 1 - i * 0.1) }} />
      ))}
    </motion.svg>
  );
}

function parsePath(d: string): Stroke[] {
  const strokes: Stroke[] = [];
  let cur: Stroke = [];
  const re = /([ML])([\d.]+) ([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1] === 'M') {
      if (cur.length) strokes.push(cur);
      cur = [];
    }
    cur.push({ x: parseFloat(m[2]), y: parseFloat(m[3]) });
  }
  if (cur.length) strokes.push(cur);
  return strokes;
}

export function ESignModal({ open, title, subtitle, signer, onClose, onConfirm }: {
  open: boolean;
  title: string;
  subtitle?: string;
  signer: string;
  onClose: () => void;
  onConfirm: (signature: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const lastRef = useRef<Point | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      strokesRef.current = [];
      setStrokes([]);
      setDone(false);
      lastRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#0b3d91';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const toPoint = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * VB_W, y: ((e.clientY - r.top) / r.height) * VB_H };
    };

    const redraw = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = '#0b3d91';
      ctx.lineWidth = 2.4;
      for (const stroke of strokesRef.current) {
        if (stroke.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    };

    const down = (e: PointerEvent) => {
      e.preventDefault();
      drawingRef.current = true;
      lastRef.current = toPoint(e);
      strokesRef.current.push([lastRef.current]);
      setStrokes([...strokesRef.current]);
    };
    const move = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const p = toPoint(e);
      const stroke = strokesRef.current[strokesRef.current.length - 1];
      stroke.push(p);
      redraw();
    };
    const up = () => {
      drawingRef.current = false;
      lastRef.current = null;
      setStrokes([...strokesRef.current]);
    };

    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [open]);

  const clear = () => {
    strokesRef.current = [];
    setStrokes([]);
    setDone(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const r = canvas.getBoundingClientRect();
      if (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, r.width, r.height); }
    }
  };

  const confirm = () => {
    if (strokesRef.current.length === 0) return;
    setDone(true);
    const d = toSvgPath(strokesRef.current);
    setTimeout(() => {
      onConfirm(d);
    }, 1400);
  };

  const path = toSvgPath(strokes);
  const hasStroke = strokes.some((s) => s.length > 1);

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <p className="mb-4 text-sm text-slate-500">{subtitle ?? 'Draw your official signature below. It is recorded against this action in the audit trail.'}</p>

      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-brand-200 bg-white">
        <canvas ref={canvasRef} className="h-48 w-full cursor-crosshair touch-none" />
        <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] font-medium uppercase tracking-widest text-slate-300">
          {done ? 'Signed' : hasStroke ? 'Signing…' : 'Draw signature here'}
        </span>
      </div>

      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-700">Signature captured & verified</p>
              <p className="text-xs text-emerald-600">Bound to {signer}. Attaching to the approval now…</p>
            </div>
            <div className="text-emerald-700">
              <SignatureStamp data={path} className="h-10 w-28" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button onClick={clear} disabled={done} className="btn-ghost inline-flex items-center gap-2 disabled:opacity-40">
          <Eraser size={15} /> Clear
        </button>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={confirm} disabled={!hasStroke || done} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40">
            <PenLine size={15} /> {done ? 'Signed' : 'Sign & confirm'}
          </button>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck size={12} /> Demo eSign — signature path is stored in the workflow stage and audit log (hash-chained).
      </p>
    </Modal>
  );
}
