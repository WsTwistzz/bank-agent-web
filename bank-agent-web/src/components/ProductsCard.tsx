import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import type { ProductsMessage } from "../types";
import { RiskBadge } from "./RiskBadge";

const RISK_STYLE = {
  LOW: { label: "低风险", cls: "text-safe-400 border-safe-500/30 bg-safe-500/10" },
  MEDIUM: { label: "中风险", cls: "text-warn-400 border-warn-500/30 bg-warn-500/10" },
  HIGH: { label: "高风险", cls: "text-risk-400 border-risk-500/30 bg-risk-500/10" },
} as const;

export function ProductsCard({ msg }: { msg: ProductsMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative overflow-hidden rounded-2xl p-5"
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-safe-400 to-transparent" />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-aurora-500/10 text-aurora-400">
            <TrendingUp size={15} />
          </span>
          理财产品
        </div>
        <RiskBadge level="green" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {msg.products.map((p, i) => {
          const risk = RISK_STYLE[p.riskLevel];
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-colors hover:border-aurora-500/30 hover:bg-aurora-500/5"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-300">{p.name}</span>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${risk.cls}`}>
                  {risk.label}
                </span>
              </div>
              <p className="text-lg font-semibold text-aurora-300">{p.annualRate}</p>
              <p className="text-[10px] text-slate-500">年化收益率</p>
              <p className="mt-2 text-[10px] text-slate-500">{p.minAmount} 起购 · {p.id}</p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
