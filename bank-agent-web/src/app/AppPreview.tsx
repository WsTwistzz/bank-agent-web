import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChartPie,
  Eye,
  Home,
  LayoutGrid,
  ScanFace,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { useState } from "react";

// 深色大理石纹理（AI 生成素材）
const MARBLE_URL =
  "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=black%20marble%20stone%20texture%20background%2C%20dark%20elegant%20luxury%2C%20subtle%20thin%20white%20and%20gold%20veins%2C%20matte%20finish%2C%20high%20resolution%2C%20photorealistic%2C%20moody%20lighting&image_size=portrait_4_3";

const GOLD = "#d8b57e";
const GOLD_BRIGHT = "#ecd3a3";

const TRANSACTIONS = [
  { name: "Starbucks 咖啡", time: "今天 09:24", amount: "-32.00", icon: ArrowUpRight, out: true },
  { name: "工资入账", time: "昨天 18:00", amount: "+18,500.00", icon: ArrowDownLeft, out: false },
  { name: "Apple Store", time: "9月8日", amount: "-1,299.00", icon: ArrowUpRight, out: true },
  { name: "转账 · Bob", time: "9月7日", amount: "-500.00", icon: ArrowUpRight, out: true },
];

const QUICK = [
  { icon: Send, label: "转账" },
  { icon: ChartPie, label: "账单" },
  { icon: LayoutGrid, label: "理财" },
  { icon: ScanFace, label: "安全" },
];

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-7 pt-4 text-[12px] font-semibold text-white/90">
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[3, 5, 7, 9].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-white/90" style={{ height: h }} />
          ))}
        </span>
        <span className="ml-1 h-[11px] w-[22px] rounded-[4px] border border-white/50 p-[2px]">
          <span className="block h-full w-3/4 rounded-[2px] bg-white/90" />
        </span>
      </div>
    </div>
  );
}

function VaultHome() {
  return (
    <motion.div
      key="home"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-6 pt-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/40">
            BankSense Vault
          </p>
          <p className="mt-0.5 text-[15px] font-medium text-white">晚安，Alice</p>
        </div>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Bell size={15} className="text-white/70" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
        </button>
      </div>

      {/* 总资产 */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
          总资产 <Eye size={11} />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-[15px] font-light text-white/60">¥</span>
          <span className="text-[44px] font-extralight leading-none tracking-tight text-white">
            128,450
          </span>
          <span className="text-[20px] font-extralight text-white/50">.80</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "rgba(216,181,126,0.12)", color: GOLD_BRIGHT }}
          >
            +2.4%
          </span>
          <span className="text-[10px] text-white/30">较上月</span>
        </div>
      </div>

      {/* 大理石金库卡 */}
      <div className="px-6 pt-6">
        <motion.div
          whileHover={{ y: -3 }}
          className="relative h-[168px] overflow-hidden rounded-[22px] border border-white/10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
        >
          <img
            src={MARBLE_URL}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/30 via-transparent to-black/60" />
          {/* 金色描边光泽 */}
          <div
            className="absolute inset-0 rounded-[22px]"
            style={{ boxShadow: "inset 0 1px 0 rgba(236,211,163,0.25)" }}
          />
          <div className="relative flex h-full flex-col justify-between p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.35em] text-white/50">Obsidian Card</p>
                <p className="mt-1 font-mono text-[13px] tracking-[0.2em] text-white/90">
                  6217 •••• 1001
                </p>
              </div>
              <div
                className="flex h-8 w-11 items-center justify-center rounded-md border"
                style={{ borderColor: "rgba(216,181,126,0.4)", background: "rgba(216,181,126,0.1)" }}
              >
                <span className="h-3.5 w-6 rounded-sm border" style={{ borderColor: "rgba(236,211,163,0.6)" }} />
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[8px] uppercase tracking-[0.3em] text-white/40">Card Holder</p>
                <p className="text-[12px] font-medium tracking-[0.15em] text-white/90">ALICE</p>
              </div>
              <p className="text-[10px] tracking-[0.2em]" style={{ color: GOLD_BRIGHT }}>
                BankSense
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 快捷操作 */}
      <div className="flex justify-between px-8 pt-6">
        {QUICK.map((q, i) => (
          <motion.button
            key={q.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06 }}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
              style={i === 0 ? { borderColor: "rgba(216,181,126,0.45)", color: GOLD_BRIGHT } : { color: "rgba(255,255,255,0.75)" }}
            >
              <q.icon size={17} strokeWidth={1.8} />
            </span>
            <span className="text-[10px] text-white/50">{q.label}</span>
          </motion.button>
        ))}
      </div>

      {/* 交易列表 */}
      <div className="mt-5 shrink-0 rounded-t-[26px] border-t border-white/8 bg-white/[0.03] px-6 pb-5 pt-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-white/40">
            最近交易
          </p>
          <span className="text-[10px]" style={{ color: GOLD }}>全部</span>
        </div>
        <div className="space-y-3.5">
          {TRANSACTIONS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.06 }}
              className="flex items-center gap-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-white/60">
                <t.icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-white/85">{t.name}</p>
                <p className="text-[10px] text-white/35">{t.time}</p>
              </div>
              <span
                className="font-mono text-[12.5px] font-medium"
                style={{ color: t.out ? "rgba(255,255,255,0.85)" : GOLD_BRIGHT }}
              >
                {t.amount}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function VaultAI() {
  return (
    <motion.div
      key="ai"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col px-6 pt-4"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #8a6b3a)` }}
        >
          <Sparkles size={17} className="text-black" />
        </span>
        <div>
          <p className="text-[14px] font-medium text-white">BankSense AI</p>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">Private Banker</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-white/40">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
          在线
        </span>
      </div>

      <div className="mt-6 space-y-3">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/8 bg-white/[0.04] px-4 py-3 text-[12.5px] leading-relaxed text-white/80">
          晚上好，Alice。本月你已支出 ¥8,432，较上月下降 6%。需要我帮你做账单分析吗？
        </div>
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-md px-4 py-3 text-[12.5px] font-medium text-black"
          style={{ background: `linear-gradient(135deg, ${GOLD_BRIGHT}, ${GOLD})` }}
        >
          帮我看看餐饮花了多少
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/8 bg-white/[0.04] px-4 py-3 text-[12.5px] leading-relaxed text-white/80">
          本月餐饮支出 <span style={{ color: GOLD_BRIGHT }} className="font-semibold">¥2,860</span>，占比 33.9%，共 42 笔。
        </div>
      </div>

      <div className="mt-auto pb-3">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-5 pr-2">
          <span className="flex-1 text-[12px] text-white/30">问问你的私人银行家…</span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: `linear-gradient(135deg, ${GOLD_BRIGHT}, ${GOLD})` }}
          >
            <Send size={13} className="text-black" />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

const TABS = [
  { key: "home", icon: Home, label: "金库" },
  { key: "ai", icon: Sparkles, label: "AI" },
  { key: "me", icon: User, label: "我的" },
] as const;

export default function AppPreview() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("home");

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-black">
      {/* 背景大理石微光 */}
      <img
        src={MARBLE_URL}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.14] blur-[2px]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(216,181,126,0.08),transparent_65%)]" />

      {/* 手机壳 */}
      <div className="relative h-[min(844px,94vh)] w-[min(390px,94vw)] overflow-hidden rounded-[46px] border border-white/12 bg-[#0a0a0b] shadow-[0_60px_120px_-30px_rgba(0,0,0,0.9),0_0_80px_-30px_rgba(216,181,126,0.15)] ring-1 ring-black">
        {/* 刘海 */}
        <div className="absolute left-1/2 top-2.5 z-30 h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black" />

        <div className="relative flex h-full flex-col">
          <StatusBar />
          <AnimatePresence mode="wait">
            {tab === "home" && <VaultHome />}
            {tab === "ai" && <VaultAI />}
            {tab === "me" && (
              <motion.div
                key="me"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 items-center justify-center text-[12px] text-white/30"
              >
                个人中心（占位）
              </motion.div>
            )}
          </AnimatePresence>

          {/* 底部 Tab Bar */}
          <div className="relative z-20 flex items-center justify-around border-t border-white/8 bg-black/60 px-6 pb-6 pt-3 backdrop-blur-2xl">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
                    style={
                      active
                        ? { background: "rgba(216,181,126,0.15)", color: GOLD_BRIGHT }
                        : { color: "rgba(255,255,255,0.4)" }
                    }
                  >
                    <t.icon size={17} strokeWidth={1.8} />
                  </span>
                  <span
                    className="text-[9px] tracking-wider"
                    style={{ color: active ? GOLD_BRIGHT : "rgba(255,255,255,0.35)" }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 侧边说明 */}
      <div className="absolute right-8 top-1/2 hidden -translate-y-1/2 space-y-4 text-right xl:block">
        <p className="text-[10px] uppercase tracking-[0.4em] text-white/30">Design Concept</p>
        <h2 className="text-3xl font-extralight tracking-wide text-white">
          Obsidian <span style={{ color: GOLD_BRIGHT }}>Vault</span>
        </h2>
        <p className="max-w-[220px] text-[12px] leading-relaxed text-white/40">
          黑曜石底色 · 大理石纹理 · 香槟金点缀，私人银行金库质感。
        </p>
        <p className="text-[11px] text-white/25">点击底部 Tab 可切换页面</p>
      </div>
    </div>
  );
}
