import { motion } from "framer-motion";
import {
  Activity,
  Bell,
  CalendarHeart,
  CreditCard,
  History,
  Snowflake,
  Sparkles,
} from "lucide-react";

function CreditCardVisual() {
  return (
    <motion.div
      whileHover={{ rotateY: 8, rotateX: -4, y: -4 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      className="relative h-40 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-ink-600 via-ink-800 to-ink-900 p-5 shadow-2xl shadow-black/50"
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* 极光反射 */}
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-aurora-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-gold-500/10 blur-3xl" />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-[0.2em] text-slate-400">
            BankSense
          </span>
          <span className="flex h-7 w-9 items-center justify-center rounded-md border border-gold-400/30 bg-gradient-to-br from-gold-400/30 to-gold-500/10">
            <span className="h-3 w-5 rounded-sm border border-gold-400/50" />
          </span>
        </div>
        <p className="font-mono text-sm tracking-[0.25em] text-slate-300">
          6217 •••• •••• 1001
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] tracking-widest text-slate-500">CARD HOLDER</p>
            <p className="text-xs font-medium text-slate-300">ALICE</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-safe-500/15 px-2 py-0.5 text-[10px] text-safe-400">
            <span className="h-1 w-1 rounded-full bg-safe-400" /> 正常
          </span>
        </div>
      </div>
    </motion.div>
  );
}

const MENU = [
  { icon: Sparkles, label: "AI 助手", active: true },
  { icon: Activity, label: "交易总览" },
  { icon: CreditCard, label: "卡片管理" },
  { icon: CalendarHeart, label: "智能场景" },
  { icon: History, label: "操作审计" },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col gap-5 border-r border-white/6 bg-ink-900/40 p-5 backdrop-blur-xl max-lg:hidden">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-aurora-500 to-gold-500 text-sm font-bold text-ink-950">
          A
        </span>
        <div>
          <p className="text-sm font-semibold tracking-wide text-slate-100">BankSense</p>
          <p className="text-[10px] tracking-widest text-slate-600">AI BANKING AGENT</p>
        </div>
        <Bell size={15} className="ml-auto text-slate-500 transition hover:text-slate-300" />
      </div>

      {/* 总资产 */}
      <div className="glass animate-float rounded-2xl p-4">
        <p className="text-[11px] text-slate-500">总资产（CNY）</p>
        <p className="text-aurora mt-1 text-[26px] font-semibold leading-tight tracking-tight">
          ¥12,450.80
        </p>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-safe-500/15 px-2 py-0.5 text-safe-400">+2.4%</span>
          <span className="text-slate-600">较上月</span>
        </div>
      </div>

      {/* 银行卡 */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[11px] font-medium tracking-widest text-slate-500">我的卡片</p>
          <button className="flex items-center gap-1 text-[11px] text-slate-500 transition hover:text-risk-400">
            <Snowflake size={11} /> 冻结
          </button>
        </div>
        <CreditCardVisual />
      </div>

      {/* 菜单 */}
      <nav className="mt-1 space-y-1">
        {MENU.map((m) => (
          <button
            key={m.label}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] transition ${
              m.active
                ? "bg-gradient-to-r from-aurora-500/15 to-transparent text-aurora-300"
                : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
            }`}
          >
            <m.icon size={15} />
            {m.label}
            {m.active && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-aurora-400 shadow-[0_0_8px_rgba(77,238,203,0.8)]" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-white/6 bg-white/[0.02] p-3.5">
        <p className="text-[11px] leading-relaxed text-slate-500">
          本演示为比赛沙箱环境，所有银行操作在 Mock Bank 中执行，不会产生真实资金变动。
        </p>
      </div>
    </aside>
  );
}
