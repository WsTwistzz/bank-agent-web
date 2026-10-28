import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Database, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { glass, T } from "../theme";
import { useFeatureData } from "./featureData";
import "./features.css";

export function FeatureShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { isDemo, loading } = useFeatureData();
  return <section className="feature-page" aria-label={title}>
    <header className="feature-header">
      <a href="#/home" className="feature-back" aria-label="返回首页"><ArrowLeft size={17} /></a>
      <span className="feature-brand">BankSense</span>
      <span className="feature-source"><Database size={10} />{loading ? "同步中" : isDemo ? "示例数据" : "实时数据"}</span>
    </header>
    <div className="feature-title"><p>{subtitle}</p><h1>{title}<span>．</span></h1></div>
    <div className="feature-content">{children}</div>
    <p className="feature-footnote"><ShieldCheck size={11} />{isDemo ? "示例体验 · 操作仅改变演示状态，不影响真实账户" : "账户数据来自 Mock Bank · 写操作需安全网关授权"}</p>
  </section>;
}

export function GlassCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }} className={`feature-card ${className}`} style={{ ...glass.card, ...style }}>{children}</motion.section>;
}

export function FeatureTabs({ items, value, onChange }: { items: readonly string[]; value: string; onChange: (value: string) => void }) {
  return <div className="feature-tabs" role="tablist">{items.map(item => <button key={item} type="button" role="tab" aria-selected={value === item} onClick={() => onChange(item)} className={value === item ? "is-active" : ""}>{item}</button>)}</div>;
}

export function Pill({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "green" | "amber" | "red" | "neutral" }) {
  return <span className={`feature-pill feature-pill--${tone}`}>{children}</span>;
}

export function Stat({ label, value, note, positive = false }: { label: string; value: ReactNode; note?: string; positive?: boolean }) {
  return <div className="feature-stat"><p>{label}</p><strong style={positive ? { color: T.teal } : undefined}>{value}</strong>{note && <small>{positive && <ArrowUpRight size={10} />}{note}</small>}</div>;
}

export function PrimaryButton({ children, onClick, disabled = false, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return <motion.button whileTap={{ scale: .97 }} type={type} disabled={disabled} onClick={onClick} className="feature-primary">{children}</motion.button>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="feature-empty"><Database size={23} /><strong>{title}</strong><p>{body}</p></div>;
}

export function FeatureSheet({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const els = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        const first = els[0], last = els[els.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  const host = document.getElementById("phone-frame");
  if (!host) return null;
  return createPortal(<AnimatePresence><div className="feature-sheet-layer">
    <button type="button" className="feature-sheet-backdrop" aria-label="关闭弹窗" onClick={onClose} />
    <motion.section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 350, damping: 34 }} className="feature-sheet">
      <div className="feature-sheet-handle" />
      <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header>
      <div className="feature-sheet-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </motion.section>
  </div></AnimatePresence>, host);
}
