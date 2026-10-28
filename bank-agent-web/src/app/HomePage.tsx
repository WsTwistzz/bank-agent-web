import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  Send,
  Sparkles,
  Wallet,
  ArrowRightLeft,
  WifiOff,
  TrendingUp,
  Repeat2,
  ChartNoAxesCombined,
  CreditCard,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatMoney,
  formatTime,
  toNumber,
  type Transaction,
} from "../api/bank";
import { incomeThisMonth, monthlySeries, useBankData } from "../api/useBankData";
import { cardIn, CountUp, glass, Pressable, spring, T } from "./theme";

// ---------- 迷你柱状图（真实月度数据） ----------
function MiniBarChart({ series }: { series: { month: string; amount: number }[] }) {
  const max = Math.max(...series.map((s) => s.amount), 1);
  const hasData = series.some((s) => s.amount > 0);
  return (
    <>
      <div className="flex h-[52px] items-end gap-[3px]">
        {series.map((s, i) => (
          <motion.span
            key={s.month}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((s.amount / max) * 100, hasData ? 4 : 8)}%` }}
            transition={{ delay: 0.5 + i * 0.04, type: "spring", stiffness: 300, damping: 24 }}
            className="flex-1 rounded-full"
            style={{
              background:
                i === series.length - 1 && hasData
                  ? T.teal
                  : `rgba(26,127,158,${hasData ? 0.25 : 0.12})`,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[8px]" style={{ color: T.faint }}>
        {series.map((s) => (
          <span key={s.month}>{s.month}</span>
        ))}
      </div>
    </>
  );
}

// ---------- 交易记录行 ----------
function TransactionRow({ tx, index }: { tx: Transaction; index: number }) {
  const incoming = tx.direction === "in" || toNumber(tx.amount) > 0;
  const value = Math.abs(toNumber(tx.amount));
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  const title = tx.merchant || tx.counterparty || tx.note || tx.kind;
  const subtitle = [tx.category || tx.kind, formatTime(tx.created_at)].filter(Boolean).join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.7 + index * 0.08 }}
      className="flex items-center gap-3"
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: incoming ? T.greenSoft : T.redSoft }}
      >
        <Icon size={14} style={{ color: incoming ? T.green : T.red }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold" style={{ color: T.ink }}>
          {title}
        </p>
        <p className="truncate text-[9.5px]" style={{ color: T.faint }}>
          {subtitle}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[12px] font-bold" style={{ color: incoming ? T.green : T.red }}>
          {formatMoney(value, incoming)}
        </p>
        <p className="text-[8.5px]" style={{ color: T.faint }}>
          {incoming ? "Income" : "Transfer"}
        </p>
      </div>
    </motion.div>
  );
}

// ---------- 首页 Dashboard（磨砂玻璃风格 + 真实数据） ----------
export default function HomePage() {
  const [hide, setHide] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const { snapshot, source, error } = useBankData();

  const { account, transactions, debits, products } = snapshot;

  const series = useMemo(() => monthlySeries(transactions), [transactions]);
  const income = useMemo(() => incomeThisMonth(transactions), [transactions]);
  const balance = toNumber(account.balance);

  // AI 洞察：由真实的代扣项与理财产品推导
  const insights = useMemo(() => {
    const list: { tag: string; text: string }[] = [];
    for (const d of debits.slice(0, 2)) {
      list.push({
        tag: "代扣",
        text: `「${d.merchant}」将于 ${formatTime(d.next_charge_at).slice(0, 5)} 自动扣款 ${formatMoney(
          toNumber(d.amount),
        )}（${d.frequency === "monthly" ? "每月" : d.frequency}），请保持余额充足。`,
      });
    }
    const lowRisk = products.find((p) => p.risk_level === "LOW");
    if (lowRisk) {
      list.push({
        tag: "建议",
        text: `闲置资金可考虑「${lowRisk.name}」，预期年化 ${(toNumber(lowRisk.expected_return_min) * 100).toFixed(
          1,
        )}% ~ ${(toNumber(lowRisk.expected_return_max) * 100).toFixed(1)}%，${
          lowRisk.lock_days === 0 ? "随存随取" : `${lowRisk.lock_days} 天锁定期`
        }。`,
      });
    }
    list.push({
      tag: "账户",
      text: `主账户 ${account.id} 当前余额 ${formatMoney(balance)}，共 ${transactions.length} 笔近期交易记录。`,
    });
    return list;
  }, [debits, products, account.id, balance, transactions.length]);

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* 顶部：头像 + 品牌 + 数据来源 */}
      <motion.div variants={cardIn} custom={0} initial="hidden" animate="show" className="flex items-center justify-between pt-2">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,#344054,#667085)", boxShadow: "0 3px 10px rgba(16,24,40,0.2)" }}
        >
          {account.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-[17px] font-bold tracking-[-0.04em]" style={{ color: T.ink }}>
          BankSense
        </span>
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full" style={glass.pill}>
          {source === "fallback" ? (
            <WifiOff size={13} style={{ color: T.amber }} />
          ) : (
            <motion.span
              className="h-2 w-2 rounded-full"
              style={{ background: source === "live" ? T.green : T.faint }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          )}
        </span>
      </motion.div>

      {/* 余额 Hero —— 无卡片，直接浮在柔光上 */}
      <motion.div variants={cardIn} custom={1} initial="hidden" animate="show" className="mt-7 flex flex-col items-center">
        {/* 账户胶囊 */}
        <span
          className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] font-semibold"
          style={{ ...glass.pill, color: T.sub, boxShadow: "0 2px 10px rgba(16,24,40,0.06)" }}
        >
          <span className="font-black italic tracking-tight" style={{ color: T.navy }}>
            MOCK BANK
          </span>
          <span style={{ color: T.faint }}>···· {account.id}</span>
          <ChevronDown size={10} style={{ color: T.faint }} />
        </span>

        <p className="mt-4 text-[12px] font-medium" style={{ color: T.sub }}>
          Available balance
        </p>

        <div className="mt-1 flex items-center gap-2.5">
          <span
            className="text-[42px] font-bold leading-none tracking-tight"
            style={{ color: T.ink, fontVariantNumeric: "tabular-nums" }}
          >
            {hide ? "¥ ••••••" : <CountUp value={balance} decimals={2} />}
          </span>
          <Pressable onClick={() => setHide(!hide)} className="p-1" style={{}}>
            {hide ? <EyeOff size={16} style={{ color: T.faint }} /> : <Eye size={16} style={{ color: T.faint }} />}
          </Pressable>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {income > 0 ? (
            <span
              className="flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.6)", color: "#067647", border: "1px solid rgba(255,255,255,0.7)" }}
            >
              <ArrowUpRight size={10} /> 本月流入 {formatMoney(income)}
            </span>
          ) : (
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.6)", color: T.sub, border: "1px solid rgba(255,255,255,0.7)" }}
            >
              账户状态 {account.status}
            </span>
          )}
          <span className="text-[10.5px]" style={{ color: T.sub }}>
            {source === "live" ? "数据来自 Mock Bank 实时接口" : source === "loading" ? "正在同步…" : "后端未连接 · 本地演示数据"}
          </span>
        </div>
      </motion.div>

      {/* 三按钮 —— 参考图：深色实心 + 玻璃描边 */}
      <motion.div variants={cardIn} custom={2} initial="hidden" animate="show" className="mt-6 flex gap-2.5">
        {[
          { icon: Plus, label: "充值", primary: true, path: null },
          { icon: Send, label: "转账", primary: false, path: "/transfer" },
          { icon: Wallet, label: "收款", primary: false, path: "/receive" },
        ].map((btn) => (
          <Pressable
            key={btn.label}
            onClick={() => { if (btn.path) window.location.hash = btn.path; }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-[12.5px] font-semibold"
            style={
              btn.primary
                ? { background: T.black, color: "#fff", boxShadow: "0 6px 18px rgba(16,24,40,0.28)" }
                : {
                    background: "rgba(255,255,255,0.55)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid rgba(255,255,255,0.65)",
                    color: T.ink,
                  }
            }
          >
            <btn.icon size={14} strokeWidth={2.2} /> {btn.label}
          </Pressable>
        ))}
      </motion.div>

      {/* Total Income + Quick actions 双卡 */}
      <div className="mt-3 flex gap-3">
        {/* Total Income */}
        <motion.div
          variants={cardIn}
          custom={3}
          initial="hidden"
          animate="show"
          className="min-w-0 flex-1 rounded-[22px] p-4"
          style={{ ...glass.card, borderRadius: 22 }}
        >
          <p className="text-[11px] font-medium" style={{ color: T.sub }}>Total Income</p>
          <p className="mt-1 text-[19px] font-bold tracking-tight" style={{ color: T.ink }}>
            <CountUp value={income > 0 ? income : balance} decimals={2} />
          </p>
          <p className="mt-0.5 text-[10px]" style={{ color: T.faint }}>
            {income > 0 ? "This Month" : "当前余额"}
          </p>
          <div className="mt-3">
            <MiniBarChart series={series} />
          </div>
        </motion.div>

        {/* 四个业务入口，沿用圆形玻璃按钮与按压回弹 */}
        <motion.div
          variants={cardIn}
          custom={4}
          initial="hidden"
          animate="show"
          className="min-w-0 flex-1 rounded-[22px] p-4"
          style={{ ...glass.card, borderRadius: 22 }}
        >
          <p className="text-[11px] font-medium" style={{ color: T.sub }}>Quick actions</p>
          <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3">
            {[
              { label: "理财", icon: TrendingUp, path: "wealth", color: "#1a7f9e", bg: "rgba(26,127,158,.08)" },
              { label: "订阅", icon: Repeat2, path: "subscriptions", color: "#8d6caa", bg: "rgba(141,108,170,.08)" },
              { label: "账单分析", icon: ChartNoAxesCombined, path: "bills", color: "#b58c58", bg: "rgba(181,140,88,.08)" },
              { label: "银行卡管理", icon: CreditCard, path: "cards", color: "#638b86", bg: "rgba(99,139,134,.1)" },
            ].map((action, i) => (
              <motion.a key={action.path} href={`#/${action.path}`} aria-label={action.label}
                initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: .35 + i * .05 }} whileTap={{ scale: .91 }}
                className="group flex flex-col items-center gap-1.5 rounded-xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#1a7f9e]"
                style={{ textDecoration: "none" }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:-translate-y-0.5"
                  style={{ background: action.bg, border: "1px solid rgba(255,255,255,.85)", boxShadow: "0 3px 10px rgba(16,24,40,.04), inset 0 1px 2px rgba(255,255,255,.8)", color: action.color }}>
                  <action.icon size={17} strokeWidth={1.7} />
                </span>
                <span className="whitespace-nowrap text-[8px] font-medium" style={{ color: T.sub }}>{action.label}</span>
              </motion.a>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Transactions —— 真实流水 */}
      <motion.div
        variants={cardIn}
        custom={5}
        initial="hidden"
        animate="show"
        className="mt-3 rounded-[22px] p-4"
        style={{ ...glass.card, borderRadius: 22 }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold" style={{ color: T.ink }}>Transactions</p>
          <div className="flex items-center gap-2">
            <Pressable className="flex h-7 w-7 items-center justify-center rounded-full" style={glass.pill}>
              <ArrowRightLeft size={12} style={{ color: T.sub }} />
            </Pressable>
            <span className="text-[10px] font-medium" style={{ color: T.teal }}>
              {transactions.length} 笔
            </span>
          </div>
        </div>
        <div className="mt-3 space-y-2.5">
          {transactions.length > 0 ? (
            transactions.slice(0, 5).map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)
          ) : (
            <p className="py-4 text-center text-[11px]" style={{ color: T.faint }}>
              {source === "loading" ? "正在加载交易记录…" : "暂无交易记录"}
            </p>
          )}
        </div>
      </motion.div>

      {/* AI Insights —— 由真实代扣/产品推导 */}
      <motion.div
        variants={cardIn}
        custom={6}
        initial="hidden"
        animate="show"
        className="mt-3 overflow-hidden rounded-[22px]"
        style={{ ...glass.card, borderRadius: 22 }}
      >
        <Pressable className="flex w-full items-center justify-between p-4" style={{}} onClick={() => setInsightOpen(!insightOpen)}>
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: T.tealSoft }}>
              <Sparkles size={13} style={{ color: T.teal }} />
            </span>
            <span className="text-[12.5px] font-semibold" style={{ color: T.ink }}>AI 洞察</span>
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: T.teal }}>
              {insights.length} 条
            </span>
          </span>
          <motion.span animate={{ rotate: insightOpen ? 180 : 0 }} transition={spring}>
            <ChevronDown size={14} style={{ color: T.faint }} />
          </motion.span>
        </Pressable>
        <AnimatePresence initial={false}>
          {insightOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="space-y-2.5 px-4 pb-4">
                {insights.map((it, i) => (
                  <motion.div
                    key={it.tag + i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="rounded-[14px] p-3"
                    style={{ background: "rgba(255,255,255,0.5)" }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: T.teal }}>
                      {it.tag}
                    </span>
                    <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: T.sub }}>
                      {it.text}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!insightOpen && (
          <p className="px-4 pb-4 text-[11.5px] leading-relaxed" style={{ color: T.sub }}>
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: T.teal }}>
              {insights[0]?.tag}　
            </span>
            {insights[0]?.text}
          </p>
        )}
      </motion.div>

      {source === "fallback" && error && (
        <p className="mt-3 text-center text-[9.5px]" style={{ color: T.faint }}>
          {error}
        </p>
      )}
    </div>
  );
}
