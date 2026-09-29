import { motion } from "framer-motion";
import { Wallet } from "lucide-react";
import type { BalanceCardMessage } from "../types";
import { RiskBadge } from "./RiskBadge";

export function BalanceCard({ msg }: { msg: BalanceCardMessage }) {
  const { account } = msg;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative overflow-hidden rounded-2xl p-5"
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-safe-400 to-transparent" />
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-aurora-500/10 text-aurora-400">
            <Wallet size={15} />
          </span>
          {account.name} 的主账户
        </div>
        <RiskBadge level="green" />
      </div>
      <p className="font-mono text-xs tracking-widest text-slate-500">{account.id}</p>
      <p className="text-aurora mt-2 text-3xl font-semibold tracking-tight">
        ¥{account.balance}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        账户状态：{account.status === "active" ? "正常" : account.status} · 查询已自动执行
      </p>
    </motion.div>
  );
}
