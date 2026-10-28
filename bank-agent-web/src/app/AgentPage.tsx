import { AnimatePresence, motion } from "framer-motion";
import { Mic, SendHorizonal, Square, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO } from "../api/bank";
import {
  AgentUnavailable,
  checkAgentHealth,
  streamChat,
  type AgentEvent,
  type FrontendEvent,
  type PendingAction,
} from "../api/agent";
import {
  PermissionCard,
  type ActionStatus,
  type PermissionAction,
  type PermissionRequest,
  type RiskLevel,
} from "./PermissionCard";
import { glass, Pressable, T } from "./theme";
import AgentIcon from "./AgentIcon";

type TraceItem = { id: string; kind: "reasoning" | "tool"; text: string; state?: string };

type Msg = {
  role: "user" | "ai";
  text: string;
  time: string;
  perm?: PermissionRequest;
  /** 后端返回的"操作状态：XXX"驱动的权限卡最终状态 */
  permStatus?: ActionStatus;
  trace?: TraceItem[];
  live?: boolean;
};

const QUICK = ["查一下我的余额", "这个月花了多少钱", "给 Bob 转 500 元", "推荐理财产品"];

// ---------- 后端不可用时的本地降级话术 ----------
const REPLIES: [RegExp, string][] = [
  [/余额|多少钱在|资产/, "您当前可用余额 ¥75,876.00，较上月增长 2.4%。需要查看明细吗？"],
  [/花|消费|账单|支出/, "本月已支出 ¥36,900.00，占预算 88%。其中餐饮占 34%、居住 28%。要我生成完整账单分析吗？"],
  [/转账|转给|转 ?\d+/, "已识别转账请求。为保护您的资金安全，请确认收款人与金额后完成二次确认。"],
  [/理财|投资|收益/, "根据您的风险偏好（稳健型），为您筛选出 3 款产品：7 天通知存款 1.8%、稳利 90 天 2.6%、指数增强 4.1%。需要对比详情吗？"],
];

const FALLBACK_REPLY = "我理解了你的需求。当前演示版支持余额查询、账单分析、转账与理财推荐，可以试试相关话术。";

function buildFallbackPerm(text: string): PermissionRequest | undefined {
  const amt = Number((text.match(/([\d,]+(?:\.\d+)?)/)?.[1] ?? "").replace(/,/g, "")) || 500;

  if (/转账|转给|转\s*\d+/.test(text)) {
    const risky = amt >= 1000;
    return {
      tool: "转账",
      capability: "payment.transfer.execute",
      summary: risky
        ? `向 Bob 转账 ¥${amt.toLocaleString("zh-CN")} 超出免密额度，需完成强验证后执行`
        : `向 Bob 转账 ¥${amt.toLocaleString("zh-CN")} 属黄级操作，确认后即可执行`,
      detail: [
        { label: "收款人", value: "Bob · 招商银行 •••• 6621" },
        { label: "金额", value: `¥${amt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` },
        { label: "手续费", value: "¥0.00" },
      ],
      level: risky ? "RED" : "YELLOW",
      requiresPassword: risky,
      requiresTotp: risky,
    };
  }

  if (/理财|投资|申购|购买/.test(text)) {
    return {
      tool: "购买理财",
      capability: "investment.purchase.execute",
      summary: "购买「稳利 90 天」会变更您的资金，需强验证后执行",
      detail: [
        { label: "产品", value: "稳利 90 天 · 年化 2.6%" },
        { label: "金额", value: "¥10,000.00" },
        { label: "到期日", value: "2026-12-28" },
      ],
      level: "RED",
      requiresPassword: false,
      requiresTotp: true,
    };
  }

  if (/余额|资产/.test(text)) {
    return {
      tool: "查询余额",
      capability: "account.balance.read",
      summary: "只读查询，已按绿级权限自动执行，无需你确认",
      detail: [],
      level: "GREEN",
      requiresPassword: false,
      requiresTotp: false,
    };
  }

  return undefined;
}

// ---------- 真实后端待授权动作 -> 权限卡 ----------
const ACTION_TEXT: Record<string, string> = {
  TRANSFER: "转账",
  FREEZE_CARD: "冻结银行卡",
  UNFREEZE_CARD: "解冻银行卡",
  REPORT_CARD_LOST: "挂失银行卡",
  SET_CARD_LIMIT: "调整银行卡额度",
  PURCHASE_INVESTMENT: "申购理财产品",
  REDEEM_INVESTMENT: "赎回理财产品",
  CANCEL_DIRECT_DEBIT: "解约代扣协议",
};

const FIELD_LABEL: Record<string, string> = {
  source_account_id: "付款账户",
  target_account_id: "收款账户",
  account_id: "账户",
  card_id: "银行卡",
  debit_id: "代扣协议",
  product: "产品",
  amount: "金额",
  note: "备注",
};

function buildLivePerm(action: PendingAction, event: AgentEvent): PermissionRequest {
  const level = (action.risk_level as RiskLevel) ?? "YELLOW";
  const payload = action.payload ?? {};
  const detail = Object.entries(payload)
    .filter(([key, value]) => value !== null && value !== "" && key !== "user_id")
    .map(([key, value]) => ({
      label: FIELD_LABEL[key] ?? key,
      value: key === "amount" ? `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : String(value),
    }));
  const name = ACTION_TEXT[action.action_type] ?? action.action_type;
  return {
    tool: String(event.display_name || action.action_type),
    capability: String(event.capability || ""),
    summary:
      level === "RED"
        ? `「${name}」超出免密额度，需完成动态口令强验证后执行`
        : `「${name}」属黄级操作，确认后即可执行`,
    detail,
    level,
    requiresPassword: false,
    requiresTotp: level === "RED",
  };
}

/** 后端 _action_response 返回 "操作状态：SUCCEEDED" 之类的文本 */
function readActionStatus(text: string): ActionStatus | undefined {
  const match = text.match(/操作状态：([A-Z_]+)/);
  return match ? (match[1] as ActionStatus) : undefined;
}

function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 语音波形条
function WaveBars({ active }: { active: boolean }) {
  return (
    <div className="flex h-4 items-center gap-[3px]">
      {[0.5, 1, 0.7, 1, 0.5].map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: "#fff", height: 4 }}
          animate={active ? { height: [4, 16 * h, 6, 14 * h, 4] } : { height: 4 }}
          transition={active ? { duration: 0.9, repeat: Infinity, delay: i * 0.09, ease: "easeInOut" } : {}}
        />
      ))}
    </div>
  );
}

// 后端执行轨迹（推理阶段 + 工具调用）
function Trace({ items }: { items: TraceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {items.map((t) => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-1.5 text-[9.5px]"
          style={{ color: T.faint }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background: t.state === "failed" ? T.red : t.state === "running" ? T.amber : T.teal,
            }}
          />
          <span className="truncate">{t.text}</span>
        </motion.div>
      ))}
    </div>
  );
}

export default function AgentPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", text: "你好，我是你的 AI 银行助理。可以帮你查余额、分析账单、办理转账，试试下面的话术或按住说话。", time: now() },
  ]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [offlineReason, setOfflineReason] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionId = useMemo(() => "SESWEB" + Math.random().toString(16).slice(2, 10).toUpperCase(), []);
  const traceSeq = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [msgs, busy]);

  // 探测桥接服务与后端 Agent 是否就绪，决定走真实对话还是本地降级
  useEffect(() => {
    let alive = true;
    checkAgentHealth()
      .then((h) => {
        if (!alive) return;
        setLive(h.ready);
        setOfflineReason(h.ready ? "" : h.agent.reason || "Mock Bank 未连接");
      })
      .catch((err) => {
        if (!alive) return;
        setLive(false);
        setOfflineReason(err instanceof Error ? err.message : "桥接服务不可用");
      });
    return () => {
      alive = false;
    };
  }, []);

  /** 发送一轮对话；permIndex 指向需要回填"操作状态"的那条权限卡消息 */
  async function send(raw?: string, permIndex?: number, silent = false) {
    const content = (raw ?? input).trim();
    if (!content || busy) return;
    setInput("");
    if (!silent) setMsgs((m) => [...m, { role: "user", text: content, time: now() }]);

    if (!live) {
      setBusy(true);
      window.setTimeout(() => {
        const hit = REPLIES.find(([re]) => re.test(content));
        setMsgs((m) => [
          ...m,
          {
            role: "ai",
            text: hit ? hit[1] : FALLBACK_REPLY,
            time: now(),
            perm: buildFallbackPerm(content),
          },
        ]);
        setBusy(false);
      }, 900);
      return;
    }

    setBusy(true);
    const trace: TraceItem[] = [];
    let pending: { action: PendingAction; event: AgentEvent } | null = null;

    try {
      const result = await streamChat(
        { userId: DEMO.userId, sessionId, message: content },
        {
          onEvent: (event) => {
            const e = event as FrontendEvent & AgentEvent;
            if (e.type === "reasoning" && typeof e.summary === "string") {
              traceSeq.current += 1;
              trace.push({ id: `r${traceSeq.current}`, kind: "reasoning", text: e.summary });
            } else if (e.type === "tool") {
              traceSeq.current += 1;
              trace.push({
                id: `t${traceSeq.current}`,
                kind: "tool",
                text: `${e.display_name || e.tool}${e.duration_ms ? ` · ${e.duration_ms}ms` : ""}`,
                state: e.status,
              });
              const data = e.result?.data as PendingAction | undefined;
              if (
                e.status === "completed" &&
                e.access === "write" &&
                data &&
                (data.status === "WAITING_CONFIRMATION" || data.status === "WAITING_STRONG_AUTH")
              ) {
                pending = { action: data, event: e };
              }
            }
          },
          onOtp: setDemoOtp,
        },
      );

      const status = readActionStatus(result.response);
      const text = result.error ? `${result.response}\n\n⚠️ ${result.error}` : result.response;

      setMsgs((m) => {
        const next = [...m];
        // 回填既有权限卡的最终状态
        if (permIndex !== undefined && status && next[permIndex]) {
          next[permIndex] = { ...next[permIndex], permStatus: status };
        }
        return [
          ...next,
          {
            role: "ai" as const,
            text: text || "（后端未返回内容）",
            time: now(),
            perm: pending ? buildLivePerm(pending.action, pending.event) : undefined,
            trace,
            live: true,
          },
        ];
      });
    } catch (err) {
      const reason = err instanceof AgentUnavailable ? err.reason || err.message : "对话失败";
      setLive(false);
      setOfflineReason(reason);
      setMsgs((m) => [
        ...m,
        { role: "ai", text: `后端 Agent 暂时不可用（${reason}），已切换为本地演示。`, time: now() },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /** 权限卡上的操作 -> 一轮真实对话 */
  function handlePerm(index: number, action: PermissionAction) {
    if (action.kind === "request-code") {
      // 申请验证码是卡片内部的隐式动作，不插入用户气泡
      void send("发送验证码", index, true);
      return;
    }
    const text =
      action.kind === "confirm" ? "确认" : action.kind === "reject" ? "取消" : action.code;
    void send(text, index);
  }

  function toggleVoice() {
    if (recording) {
      setRecording(false);
      void send("帮我看看这个月花了多少钱");
    } else {
      setRecording(true);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-5 pt-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: T.ink }}>AI 银行助理</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px]" style={{ color: T.sub }}>
            {live ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.green }} />
                在线 · 后端 Agent 实时对话
              </>
            ) : (
              <>
                <WifiOff size={10} style={{ color: T.amber }} />
                本地演示 · {offlineReason || "后端未连接"}
              </>
            )}
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: T.tealSoft }}>
          <AgentIcon size={29} />
        </span>
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex flex-col gap-2 ${m.perm ? "w-[86%]" : "max-w-[78%]"} ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className="max-w-full whitespace-pre-wrap rounded-[20px] px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: T.navy, color: "#fff", borderBottomRightRadius: 6 }
                      : {
                          ...glass.card,
                          color: T.ink,
                          borderBottomLeftRadius: 6,
                        }
                  }
                >
                  {m.text}
                  <span className="mt-1 block text-right text-[8.5px] opacity-50">
                    {m.time}
                    {m.live ? " · 后端" : ""}
                  </span>
                </div>
                {m.trace && m.trace.length > 0 && (
                  <div className="w-full rounded-[14px] px-3 py-2" style={{ background: "rgba(255,255,255,0.35)" }}>
                    <Trace items={m.trace} />
                  </div>
                )}
                {m.perm && (
                  <div className="w-full">
                    <PermissionCard
                      req={m.perm}
                      demoOtp={demoOtp}
                      statusOverride={m.permStatus}
                      onAction={m.live ? (action) => handlePerm(i, action) : undefined}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex">
            <div
              className="flex items-center gap-1.5 rounded-[20px] px-4 py-3"
              style={{ ...glass.card, borderBottomLeftRadius: 6 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: T.faint }}
                  animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* 快捷话术 */}
        {msgs.length <= 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex flex-wrap gap-2 pt-1">
            {QUICK.map((q, i) => (
              <motion.span key={q} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 + i * 0.06 }}>
                <Pressable
                  className="rounded-full px-3 py-1.5 text-[11px] font-medium"
                  style={{ ...glass.pill, color: T.teal, border: `1px solid ${T.tealSoft}` }}
                  onClick={() => send(q)}
                >
                  {q}
                </Pressable>
              </motion.span>
            ))}
          </motion.div>
        )}
      </div>

      {/* 输入区 */}
      <div className="px-5 pb-5">
        <AnimatePresence mode="wait">
          {recording ? (
            <motion.div
              key="rec"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="flex items-center gap-3 rounded-full p-2 pl-5"
              style={{ background: T.navy, boxShadow: "0 8px 24px rgba(20,52,79,0.3)" }}
            >
              <WaveBars active />
              <span className="flex-1 text-[12px] text-white/80">正在聆听… 再次点击结束</span>
              <Pressable
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white"
                style={{}}
                onClick={toggleVoice}
              >
                <Square size={13} style={{ color: T.navy }} />
              </Pressable>
            </motion.div>
          ) : (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="flex items-center gap-2"
            >
              <div
                className="flex flex-1 items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5"
                style={{ ...glass.card, borderRadius: 999 }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // 中文输入法选字时按 Enter 也会触发 keydown，此时不能发送
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    void send();
                  }}
                  placeholder="输入消息…"
                  className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#98a2b3]"
                  style={{ color: T.ink }}
                />
                <Pressable
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ background: T.tealSoft }}
                  onClick={toggleVoice}
                >
                  <Mic size={15} style={{ color: T.teal }} />
                </Pressable>
                <Pressable
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ background: T.navy }}
                  onClick={() => send()}
                >
                  <SendHorizonal size={15} style={{ color: "#fff" }} />
                </Pressable>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
