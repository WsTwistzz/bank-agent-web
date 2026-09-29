import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  ChevronRight,
  CreditCard,
  Landmark,
  Lock,
  Plus,
  Settings,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  formatMoney,
  freezeCard,
  toNumber,
  unfreezeCard,
  type BankCard,
} from "../api/bank";
import { useBankData } from "../api/useBankData";
import { cardIn, glass, Pressable, T } from "./theme";

/** 统一展示用卡片（真实卡 + 本地演示卡） */
type DisplayCard = {
  key: string;
  id: string;
  bank: string;
  type: string;
  last4: string;
  tint: string;
  status: string;
  limit: string;
  main?: boolean;
  local?: boolean;
};

const TINTS = ["rgba(26,127,158,0.16)", "rgba(181,71,8,0.12)", "rgba(122,90,248,0.14)"];

const CARD_TYPE_TEXT: Record<string, string> = {
  debit: "储蓄卡",
  credit: "信用卡",
};

const STATUS_TEXT: Record<string, { text: string; color: string; bg: string }> = {
  active: { text: "正常", color: "#067647", bg: "rgba(18,183,106,0.12)" },
  frozen: { text: "已冻结", color: "#b54708", bg: "rgba(181,71,8,0.12)" },
  reported_lost: { text: "已挂失", color: "#b42318", bg: "rgba(180,35,24,0.12)" },
};

/** 后端卡片 -> 展示卡片 */
function toDisplay(card: BankCard, index: number): DisplayCard {
  return {
    key: card.id,
    id: card.id,
    bank: "Mock Bank",
    type: CARD_TYPE_TEXT[card.card_type] ?? card.card_type,
    last4: card.id.slice(-4),
    tint: TINTS[index % TINTS.length],
    status: card.status,
    limit: card.limit,
    main: index === 0,
  };
}

export default function ProfilePage() {
  const { snapshot, source, error } = useBankData();
  const { account, cards: realCards, payees, debits } = snapshot;

  /** 冻结/解冻后的本地覆盖，避免整页重新请求 */
  const [overrides, setOverrides] = useState<Record<string, BankCard>>({});
  /** 本地绑定的演示卡（后端无建卡接口） */
  const [extra, setExtra] = useState<DisplayCard[]>([]);
  const [binding, setBinding] = useState(false);
  const [num, setNum] = useState("");
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const cards: DisplayCard[] = [
    ...realCards.map((c, i) => toDisplay(overrides[c.id] ?? c, i)),
    ...extra,
  ];

  const profileRows = [
    { label: "实名认证", value: `${account.name} · ${account.status === "active" ? "已认证" : account.status}`, icon: BadgeCheck },
    { label: "主账户", value: `${account.id} · 余额 ${formatMoney(toNumber(account.balance))}`, icon: CreditCard },
    {
      label: "常用收款人",
      value: payees.length ? payees.map((p) => p.alias || p.name).join("、") : "暂无",
      icon: ShieldCheck,
    },
    {
      label: "自动扣款签约",
      value: debits.length ? `${debits.length} 项 · ${debits[0].merchant}` : "无",
      icon: Settings,
    },
  ];

  /** 调用后端冻结/解冻接口 */
  async function toggleFreeze(card: DisplayCard) {
    if (card.local || busyCard) return;
    setBusyCard(card.key);
    setActionError(null);
    try {
      const updated =
        card.status === "frozen" ? await unfreezeCard(card.id) : await freezeCard(card.id);
      setOverrides((o) => ({ ...o, [card.id]: updated }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyCard(null);
    }
  }

  function bind() {
    if (num.replace(/\s/g, "").length < 12) return;
    setExtra((c) => [
      ...c,
      {
        key: "local-" + Date.now(),
        id: "local-" + Date.now(),
        bank: "Mock Bank",
        type: "储蓄卡",
        last4: num.replace(/\s/g, "").slice(-4),
        tint: TINTS[(c.length + 2) % TINTS.length],
        status: "active",
        limit: "0.00",
        local: true,
      },
    ]);
    setBinding(false);
    setNum("");
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* 用户信息 */}
      <motion.div variants={cardIn} custom={0} initial="hidden" animate="show" className="flex items-center gap-3.5 pt-3">
        <motion.div
          whileTap={{ scale: 0.92 }}
          className="flex h-14 w-14 items-center justify-center rounded-full text-[18px] font-bold text-white"
          style={{ background: "linear-gradient(135deg,#14344f,#1a7f9e)", boxShadow: "0 6px 18px rgba(20,52,79,0.3)" }}
        >
          {account.name.slice(0, 1).toUpperCase()}
        </motion.div>
        <div className="flex-1">
          <p className="text-[17px] font-bold" style={{ color: T.ink }}>{account.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10.5px]" style={{ color: T.sub }}>
            <BadgeCheck size={11} style={{ color: T.teal }} />
            {source === "live" ? "已实名 · Mock Bank 实时数据" : source === "loading" ? "正在同步…" : "后端未连接 · 本地演示"}
          </p>
        </div>
        <Pressable className="flex h-9 w-9 items-center justify-center rounded-full" style={glass.pill}>
          <Settings size={16} style={{ color: T.sub }} />
        </Pressable>
      </motion.div>

      {/* 我的银行卡（Stacked Card 堆叠） */}
      <motion.div variants={cardIn} custom={1} initial="hidden" animate="show" className="mt-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: T.ink }}>我的银行卡</span>
          <span className="text-[10px]" style={{ color: T.faint }}>{cards.length} 张</span>
        </div>

        {cards.length === 0 ? (
          <p className="mt-3 rounded-[18px] py-6 text-center text-[11px]" style={{ ...glass.card, borderRadius: 18, color: T.faint }}>
            {source === "loading" ? "正在加载银行卡…" : "暂无银行卡"}
          </p>
        ) : (
          <div className="mt-3" style={{ height: 148 + (cards.length - 1) * 40 }}>
            {cards.map((c, i) => {
              const st = STATUS_TEXT[c.status] ?? { text: c.status, color: T.sub, bg: "rgba(16,24,40,0.06)" };
              return (
                <motion.div
                  key={c.key}
                  layout
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.1 + i * 0.1 }}
                  className="relative overflow-hidden rounded-[22px] p-4"
                  style={{
                    // 奶白玻璃：透出背后的柔光与下方卡片
                    background: `linear-gradient(135deg, rgba(255,255,255,0.62), rgba(255,255,255,0.38)), radial-gradient(ellipse 80% 90% at 85% 0%, ${c.tint}, transparent 70%)`,
                    backdropFilter: "blur(20px) saturate(1.5)",
                    WebkitBackdropFilter: "blur(20px) saturate(1.5)",
                    border: "1.5px solid rgba(255,255,255,0.7)",
                    boxShadow: "0 12px 32px rgba(16,24,40,0.10), inset 0 1px 0 rgba(255,255,255,0.8)",
                    height: 148,
                    marginTop: i === 0 ? 0 : -108,
                    zIndex: cards.length - i,
                  }}
                >
                  {/* 顶部：银行 + 状态 */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: T.ink }}>
                      <Landmark size={12} style={{ color: T.sub }} /> {c.bank}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {/* 冻结/解冻：真实调用后端接口 */}
                      {!c.local && (
                        <Pressable
                          className="flex h-6 w-6 items-center justify-center rounded-full"
                          style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(16,24,40,0.08)" }}
                          onClick={() => toggleFreeze(c)}
                        >
                          {busyCard === c.key ? (
                            <motion.span
                              className="h-3 w-3 rounded-full border-[2px]"
                              style={{ borderColor: "rgba(16,24,40,0.15)", borderTopColor: T.navy }}
                              animate={{ rotate: 360 }}
                              transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
                            />
                          ) : (
                            <Lock size={11} style={{ color: c.status === "frozen" ? T.amber : T.sub }} />
                          )}
                        </Pressable>
                      )}
                      <span
                        className="rounded-full px-2 py-0.5 text-[8.5px] font-semibold"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.text}
                      </span>
                      {c.main && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[8.5px] font-semibold"
                          style={{ background: "rgba(20,52,79,0.08)", color: T.navy }}
                        >
                          默认
                        </span>
                      )}
                    </span>
                  </div>

                  {/* 中部：芯片 + 非接 */}
                  <div className="mt-4 flex items-center gap-2.5">
                    <span
                      className="flex h-6 w-8 items-center justify-center rounded-[5px]"
                      style={{
                        background: "linear-gradient(135deg, rgba(240,176,78,0.75), rgba(214,158,66,0.85))",
                        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.45), inset 0 -1px 2px rgba(120,80,20,0.25)",
                      }}
                    >
                      <span className="h-3 w-5 rounded-[2px]" style={{ border: "1px solid rgba(120,80,20,0.35)" }} />
                    </span>
                    <Wifi size={15} style={{ color: T.sub, transform: "rotate(90deg)" }} />
                  </div>

                  {/* 底部：卡号 + 额度 + 卡组织 */}
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[16px] font-bold tracking-[0.18em]" style={{ color: T.ink }}>
                        •••• {c.last4}
                      </p>
                      <p className="mt-0.5 text-[9px]" style={{ color: T.sub }}>
                        {c.type}
                        {toNumber(c.limit) > 0 && ` · 额度 ${formatMoney(toNumber(c.limit))}`}
                        {c.local && " · 本地演示"}
                      </p>
                    </div>
                    <span className="text-[13px] font-black italic tracking-tight" style={{ color: T.navy }}>
                      VISA
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {actionError && (
          <p className="mt-2 text-center text-[10px]" style={{ color: T.red }}>{actionError}</p>
        )}

        {/* 绑定新卡 */}
        <Pressable
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] border-2 border-dashed py-3.5"
          style={{ borderColor: "rgba(16,24,40,0.12)", color: T.sub, background: "transparent" }}
          onClick={() => setBinding(true)}
        >
          <Plus size={15} /> <span className="text-[12px] font-medium">绑定新银行卡</span>
        </Pressable>
      </motion.div>

      {/* 个人信息列表 */}
      <motion.div
        variants={cardIn}
        custom={2}
        initial="hidden"
        animate="show"
        className="mt-4 overflow-hidden rounded-[18px]"
        style={{ ...glass.card, borderRadius: 18 }}
      >
        {profileRows.map((p) => (
          <Pressable key={p.label} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" style={{}}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(16,24,40,0.05)" }}>
              <p.icon size={14} style={{ color: T.sub }} />
            </span>
            <span className="flex-1">
              <span className="block text-[12px] font-medium" style={{ color: T.ink }}>{p.label}</span>
              <span className="block truncate text-[10px]" style={{ color: T.faint }}>{p.value}</span>
            </span>
            <ChevronRight size={14} style={{ color: T.faint }} />
          </Pressable>
        ))}
      </motion.div>

      {source === "fallback" && error && (
        <p className="mt-3 text-center text-[9.5px]" style={{ color: T.faint }}>{error}</p>
      )}

      {/* 绑卡弹层 */}
      <AnimatePresence>
        {binding && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => setBinding(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="absolute inset-x-0 bottom-0 z-50 rounded-t-[28px] p-5 pb-8"
              style={{ ...glass.overlay, borderRadius: "28px 28px 0 0" }}
            >
              <div className="mx-auto h-1 w-10 rounded-full" style={{ background: "rgba(16,24,40,0.15)" }} />
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[15px] font-bold" style={{ color: T.ink }}>
                  <CreditCard size={17} style={{ color: T.teal }} /> 绑定银行卡
                </span>
                <Pressable className="p-1" style={{}} onClick={() => setBinding(false)}>
                  <X size={16} style={{ color: T.faint }} />
                </Pressable>
              </div>
              <p className="mt-3 text-[10.5px]" style={{ color: T.sub }}>
                卡号仅用于验证，传输过程全程加密
              </p>
              <input
                value={num}
                onChange={(e) =>
                  setNum(e.target.value.replace(/[^\d]/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 23))
                }
                placeholder="输入卡号"
                inputMode="numeric"
                className="mt-3 w-full rounded-[14px] px-4 py-3.5 text-[16px] font-semibold tracking-[0.12em] outline-none"
                style={{ background: "rgba(255,255,255,0.6)", color: T.ink, border: "1px solid rgba(255,255,255,0.5)" }}
              />
              <Pressable
                className="mt-4 flex w-full items-center justify-center rounded-full py-3.5 text-[13px] font-semibold text-white"
                style={{
                  background: num.replace(/\s/g, "").length >= 12 ? T.navy : "#d0d5dd",
                  boxShadow: num.replace(/\s/g, "").length >= 12 ? "0 6px 16px rgba(20,52,79,0.28)" : "none",
                }}
                onClick={bind}
              >
                确认绑定
              </Pressable>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}