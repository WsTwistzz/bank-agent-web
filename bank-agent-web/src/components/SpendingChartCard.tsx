import { motion } from "framer-motion";
import { PieChart as PieIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SpendingChartMessage } from "../types";
import { RiskBadge } from "./RiskBadge";

const tooltipStyle = {
  background: "#11141f",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 12,
  color: "#e2e8f0",
};

export function SpendingChartCard({ msg }: { msg: SpendingChartMessage }) {
  const { categories, monthly, totalSpent } = msg;

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
            <PieIcon size={15} />
          </span>
          本月账单分析
        </div>
        <RiskBadge level="green" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 饼图 */}
        <div className="relative h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categories}
                dataKey="amount"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={3}
                strokeWidth={0}
              >
                {categories.map((c) => (
                  <Cell key={c.name} fill={c.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `¥${Number(v).toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-slate-500">总支出</span>
            <span className="text-sm font-semibold text-slate-200">
              ¥{totalSpent.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 月度柱状图 */}
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 6, right: 0, left: -22, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [`¥${Number(v).toLocaleString()}`, "支出"]}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="amount" radius={[6, 6, 2, 2]} maxBarSize={22}>
                {monthly.map((m, i) => (
                  <Cell
                    key={m.month}
                    fill={i === monthly.length - 1 ? "#22d3a8" : "rgba(34,211,168,0.28)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 分类图例 */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/5 pt-3">
        {categories.map((c) => (
          <span key={c.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
            {c.name} ¥{c.amount.toLocaleString()}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
