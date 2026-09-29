import { motion } from "framer-motion";
import {
  ArrowRightLeft,
  Check,
  CreditCard,
  Loader2,
  PieChart,
  SendHorizonal,
  Sparkles,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { Message, PendingAction, TextMessage, ToolStepMessage } from "../types";
import { BalanceCard } from "./BalanceCard";
import { ProductsCard } from "./ProductsCard";
import { SpendingChartCard } from "./SpendingChartCard";
import { TransferResultCard } from "./TransferResultCard";

const QUICK_ACTIONS = [
  { icon: Wallet, label: "查一下我的余额", risk: "green" as const },
  { icon: PieChart, label: "分析我这个月的账单", risk: "green" as const },
  { icon: ArrowRightLeft, label: "给 Bob 转 500 元", risk: "yellow" as const },
  { icon: ArrowRightLeft, label: "转 5000 元房租给 Tujing", risk: "red" as const },
  { icon: TrendingUp, label: "推荐理财产品", risk: "green" as const },
  { icon: CreditCard, label: "帮我挂失银行卡", risk: "red" as const },
];

const RISK_DOT = {
  green: "text-safe-400 border-safe-500/30 hover:bg-safe-500/10",
  yellow: "text-warn-400 border-warn-500/30 hover:bg-warn-500/10",
  red: "text-risk-400 border-risk-500/30 hover:bg-risk-500/10",
};

function renderInline(text: string) {
  // 极简 **加粗** 渲染
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") ? (
      <strong key={i} className="font-semibold text-slate-100">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.kind === "text") {
    const m = msg as TextMessage;
    const isUser = m.role === "user";
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`max-w-[78%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed ${
            isUser
              ? "rounded-br-md bg-gradient-to-br from-aurora-500/90 to-aurora-500/70 text-ink-950 font-medium"
              : `rounded-bl-md border border-white/8 bg-white/[0.04] text-slate-300 ${
                  m.streaming ? "type-cursor" : ""
                }`
          }`}
        >
          {renderInline(m.text)}
        </div>
      </motion.div>
    );
  }

  if (msg.kind === "tool-step") {
    const m = msg as ToolStepMessage;
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2.5 pl-1"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-lg border ${
            m.status === "done"
              ? "border-safe-500/30 bg-safe-500/10 text-safe-400"
              : "border-aurora-500/30 bg-aurora-500/10 text-aurora-400"
          }`}
        >
          {m.status === "done" ? (
            <Check size={12} strokeWidth={3} />
          ) : (
            <Loader2 size={12} className="animate-spin" />
          )}
        </span>
        <span className="text-xs text-slate-500">
          {m.label}
          <span className="mx-1.5 font-mono text-[10px] text-slate-600">
            <Wrench size={9} className="mr-0.5 inline" />
            {m.tool}
          </span>
          {m.status === "done" && m.durationMs != null && (
            <span className="font-mono text-[10px] text-slate-600">
              {(m.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </span>
      </motion.div>
    );
  }

  if (msg.kind === "balance-card") return <BalanceCard msg={msg} />;
  if (msg.kind === "spending-chart") return <SpendingChartCard msg={msg} />;
  if (msg.kind === "transfer-card") return <TransferResultCard msg={msg} />;
  if (msg.kind === "products") return <ProductsCard msg={msg} />;
  return null;
}

interface Props {
  messages: Message[];
  busy: boolean;
  pending: PendingAction | null;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, busy, pending, onSend }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const submit = () => {
    const v = inputRef.current?.value.trim();
    if (!v) return;
    onSend(v);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* 顶栏 */}
      <header className="flex items-center justify-between border-b border-white/6 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-aurora-500 to-gold-500 text-ink-950 shadow-lg shadow-aurora-500/20">
              <Sparkles size={17} />
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-950 bg-safe-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">
              Aurora <span className="text-aurora font-normal">AI</span>
            </h1>
            <p className="text-[11px] text-slate-500">在线 · LangGraph 编排 · 决策全链路审计</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/8 px-2.5 py-1 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-safe-400" /> 查询自动执行
          </span>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/8 px-2.5 py-1 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-warn-400" /> 转账需确认
          </span>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/8 px-2.5 py-1 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-risk-400" /> 大额强验证
          </span>
        </div>
      </header>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          {busy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 pl-1 text-xs text-slate-500"
            >
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-aurora-400"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.18 }}
                  />
                ))}
              </span>
              Aurora 正在思考…
            </motion.div>
          )}
        </div>
      </div>

      {/* 快捷指令 */}
      <div className="px-6 pb-2">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q.label}
              onClick={() => onSend(q.label)}
              disabled={busy || !!pending}
              className={`flex items-center gap-1.5 rounded-full border bg-white/[0.02] px-3 py-1.5 text-xs transition disabled:opacity-40 ${RISK_DOT[q.risk]}`}
            >
              <q.icon size={12} />
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* 输入区 */}
      <div className="px-6 pb-5 pt-2">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-white/10 bg-ink-800/70 p-2 pl-5 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-aurora-500/40 focus-within:shadow-[0_0_40px_-10px_rgba(34,211,168,0.25)]">
          <input
            ref={inputRef}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={busy || !!pending}
            placeholder={
              pending ? "请先处理当前的安全验证…" : "用自然语言描述你的银行业务需求…"
            }
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600 disabled:opacity-50"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            onClick={submit}
            disabled={busy || !!pending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-aurora-500 to-gold-500 text-ink-950 shadow-lg shadow-aurora-500/25 transition disabled:opacity-40"
          >
            <SendHorizonal size={17} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
