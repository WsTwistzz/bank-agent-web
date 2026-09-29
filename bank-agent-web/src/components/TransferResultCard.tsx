import { motion } from "framer-motion";
import { ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";
import type { TransferCardMessage } from "../types";
import { RiskBadge } from "./RiskBadge";

export function TransferResultCard({ msg }: { msg: TransferCardMessage }) {
  const { transfer, result } = msg;
  const success = result === "success";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative overflow-hidden rounded-2xl p-5"
    >
      {/* 顶部光带 */}
      <div
        className={`absolute inset-x-0 top-0 h-[2px] ${
          success
            ? "bg-gradient-to-r from-transparent via-safe-400 to-transparent"
            : "bg-gradient-to-r from-transparent via-risk-400/70 to-transparent"
        }`}
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-aurora-500/10 text-aurora-400">
            <ArrowRightLeft size={15} />
          </span>
          转账单 <span className="font-mono text-xs text-slate-500">{transfer.id}</span>
        </div>
        {success ? (
          <RiskBadge level={msg.risk ?? "green"} />
        ) : (
          <RiskBadge level="red" />
        )}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">付款方</p>
          <p className="truncate text-sm font-medium text-slate-200">
            Alice <span className="font-mono text-xs text-slate-500">{transfer.from}</span>
          </p>
        </div>
        <motion.div
          animate={{ x: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-aurora-300"
        >
          →
        </motion.div>
        <div className="min-w-0 text-right">
          <p className="text-xs text-slate-500">收款方</p>
          <p className="truncate text-sm font-medium text-slate-200">
            {transfer.toName} <span className="font-mono text-xs text-slate-500">{transfer.to}</span>
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between border-t border-white/5 pt-4">
        <div>
          <p className="text-xs text-slate-500">金额</p>
          <p className="text-aurora text-2xl font-semibold tracking-tight">
            ¥{transfer.amount}
          </p>
          {transfer.note && (
            <p className="mt-1 text-xs text-slate-500">备注：{transfer.note}</p>
          )}
        </div>
        <div
          className={`flex items-center gap-1.5 text-sm font-medium ${
            success ? "text-safe-400" : "text-risk-400"
          }`}
        >
          {success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {success ? "已执行" : "已取消"}
        </div>
      </div>
    </motion.div>
  );
}
