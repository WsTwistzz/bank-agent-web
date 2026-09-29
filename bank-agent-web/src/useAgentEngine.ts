import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Message,
  PendingAction,
  SpendingChartMessage,
  TextMessage,
  ToolStepMessage,
  TransferCardMessage,
  TransferInfo,
} from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO_OTP = "240816";

const SPENDING_DATA: SpendingChartMessage = {
  id: uid(),
  role: "agent",
  kind: "spending-chart",
  createdAt: Date.now(),
  totalSpent: 8432.5,
  categories: [
    { name: "餐饮美食", amount: 2860, color: "#22d3a8" },
    { name: "购物消费", amount: 2150, color: "#f0b04e" },
    { name: "交通出行", amount: 1240, color: "#818cf8" },
    { name: "生活缴费", amount: 1182.5, color: "#fb7185" },
    { name: "其他", amount: 1000, color: "#64748b" },
  ],
  monthly: [
    { month: "4月", amount: 6420 },
    { month: "5月", amount: 7280 },
    { month: "6月", amount: 6110 },
    { month: "7月", amount: 8540 },
    { month: "8月", amount: 7920 },
    { month: "9月", amount: 8432.5 },
  ],
};

interface Scenario {
  match: (input: string) => boolean;
  run: (ctx: ScenarioCtx) => Promise<void>;
}

interface ScenarioCtx {
  pushText: (text: string, opts?: { stream?: boolean }) => Promise<string>;
  pushToolStep: (label: string, tool: string, durationMs?: number) => Promise<void>;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  setPending: (p: PendingAction | null) => void;
  push: (m: Message) => void;
}

export function useAgentEngine() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<PendingAction | null>(null);
  pendingRef.current = pending;

  const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? ({ ...m, ...patch } as Message) : m)),
    );
  }, []);

  const push = useCallback((m: Message) => setMessages((prev) => [...prev, m]), []);

  const pushText = useCallback(
    async (text: string, opts?: { stream?: boolean }): Promise<string> => {
      const id = uid();
      if (!opts?.stream) {
        push({ id, role: "agent", kind: "text", text, createdAt: Date.now() } as TextMessage);
        return id;
      }
      push({ id, role: "agent", kind: "text", text: "", streaming: true, createdAt: Date.now() } as TextMessage);
      let acc = "";
      for (const ch of text) {
        acc += ch;
        updateMessage(id, { text: acc } as Partial<Message>);
        await sleep(14 + Math.random() * 22);
      }
      updateMessage(id, { streaming: false } as Partial<Message>);
      return id;
    },
    [push, updateMessage],
  );

  const pushToolStep = useCallback(
    async (label: string, tool: string, durationMs = 900) => {
      const id = uid();
      push({
        id, role: "agent", kind: "tool-step", tool, label,
        status: "running", createdAt: Date.now(),
      } as ToolStepMessage);
      await sleep(durationMs);
      updateMessage(id, { status: "done", durationMs } as Partial<Message>);
    },
    [push, updateMessage],
  );

  // ── 场景脚本 ──────────────────────────────────────────────
  const ctx: ScenarioCtx = { pushText, pushToolStep, updateMessage, setPending, push };

  const scenarios: Scenario[] = [
    // 🟢 余额查询
    {
      match: (i) => /余额|还有多少钱/.test(i),
      run: async () => {
        await pushToolStep("查询账户余额", "get_balance");
        push({
          id: uid(), role: "agent", kind: "balance-card", createdAt: Date.now(),
          account: { id: "A1001", name: "Alice", balance: "12,450.80", status: "active" },
        });
        await pushText(
          "您的主账户 A1001 当前余额为 **¥12,450.80**，账户状态正常。这是绿色操作，已自动执行完成。",
          { stream: true },
        );
      },
    },
    // 🟢 账单分析
    {
      match: (i) => /账单|消费|花了多少|支出|花费/.test(i),
      run: async () => {
        await pushToolStep("拉取近半年交易流水", "get_transactions", 1100);
        await pushToolStep("消费分类与异常检测", "analyze_spending", 1400);
        push({ ...SPENDING_DATA, id: uid(), createdAt: Date.now() });
        await pushText(
          "本月共支出 **¥8,432.50**，较上月上涨 6.5%。**餐饮美食**占比最高（33.9%）。检测到 1 笔异常交易：9 月 3 日 22:47 境外消费 ¥1,299.00，建议核实。",
          { stream: true },
        );
      },
    },
    // 🟡 小额转账
    {
      match: (i) => /转账|转给|打钱|给.*转/.test(i) && !/大额|2000|5000|10000/.test(i),
      run: async () => {
        await pushToolStep("识别收款人", "find_payee", 800);
        const transfer: TransferInfo = {
          id: "T" + uid().toUpperCase(),
          from: "A1001", to: "A1002", toName: "Bob",
          amount: "500.00", note: "周末聚餐", status: "prepared",
        };
        await pushText(
          "已找到收款人 **Bob**（尾号 A1002）。这是黄色操作（日累计 ≤ ¥1,000），请确认转账详情：",
          { stream: true },
        );
        setPending({
          id: uid(), risk: "yellow", title: "确认转账", requiresOtp: false,
          description: "小额转账需您明确确认后才会执行",
          detail: [
            { label: "付款账户", value: "A1001 · Alice" },
            { label: "收款账户", value: "A1002 · Bob" },
            { label: "转账金额", value: "¥500.00" },
            { label: "备注", value: "周末聚餐" },
          ],
          transfer,
        });
      },
    },
    // 🔴 大额转账
    {
      match: (i) => /大额|2000|5000|10000|挂失/.test(i),
      run: async () => {
        await pushToolStep("识别收款人", "find_payee", 700);
        await pushToolStep("风险评估：超出日累计限额", "risk_check", 900);
        const transfer: TransferInfo = {
          id: "T" + uid().toUpperCase(),
          from: "A1001", to: "A1003", toName: "Tujing He",
          amount: "5,000.00", note: "房租", status: "prepared",
        };
        await pushText(
          "检测到这是**红色操作**（日累计 > ¥1,000 的大额转账）。已向您手机 138****5678 发送 6 位验证码，请完成强身份验证：",
          { stream: true },
        );
        setPending({
          id: uid(), risk: "red", title: "大额转账强验证", requiresOtp: true,
          description: "需要短信验证码完成多因子认证",
          detail: [
            { label: "付款账户", value: "A1001 · Alice" },
            { label: "收款账户", value: "A1003 · Tujing He" },
            { label: "转账金额", value: "¥5,000.00" },
            { label: "备注", value: "房租" },
          ],
          transfer,
        });
      },
    },
    // 🟢 理财产品
    {
      match: (i) => /理财|投资|收益|产品/.test(i),
      run: async () => {
        await pushToolStep("获取理财产品列表", "get_investment_products", 1000);
        await pushToolStep("风险评估匹配", "risk_assessment", 800);
        push({
          id: uid(), role: "agent", kind: "products", createdAt: Date.now(),
          products: [
            { id: "I1001", name: "稳健理财", riskLevel: "LOW", annualRate: "2.50%", minAmount: "¥100" },
            { id: "I1002", name: "成长理财", riskLevel: "MEDIUM", annualRate: "4.50%", minAmount: "¥500" },
            { id: "I1003", name: "进取理财", riskLevel: "HIGH", annualRate: "6.80%", minAmount: "¥1,000" },
          ],
        });
        await pushText(
          "基于您**稳健型**的风险评估结果，推荐 **稳健理财**（年化 2.5%，100 元起购）。如需申购请告诉我，申购属于红色操作，将要求强验证。",
          { stream: true },
        );
      },
    },
  ];

  const runScenario = useCallback(
    async (input: string) => {
      const hit = scenarios.find((s) => s.match(input));
      if (hit) return hit.run(ctx);
      await pushText(
        "我可以帮您处理银行业务：查余额、账单分析、转账、理财申购、卡片管理等。试试点击下方快捷指令体验不同权限级别的操作。",
        { stream: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushText],
  );

  const send = useCallback(
    async (input: string) => {
      if (busy || !input.trim()) return;
      setBusy(true);
      push({ id: uid(), role: "user", kind: "text", text: input, createdAt: Date.now() } as TextMessage);
      try {
        await sleep(450);
        await runScenario(input);
      } finally {
        setBusy(false);
      }
    },
    [busy, push, runScenario],
  );

  // ── 确认 / 验证回调 ───────────────────────────────────────
  const confirmPending = useCallback(
    async (otp?: string) => {
      const p = pendingRef.current;
      if (!p || busy) return;
      if (p.requiresOtp && otp !== DEMO_OTP) return; // 校验失败由弹窗自己提示
      setPending(null);
      setBusy(true);
      try {
        await pushToolStep(
          p.requiresOtp ? "OTP 校验通过，执行转账" : "用户确认，执行转账",
          "execute_transfer", 1300,
        );
        if (p.transfer) {
          const done: TransferCardMessage = {
            id: uid(), role: "agent", kind: "transfer-card", createdAt: Date.now(),
            transfer: { ...p.transfer, status: "executed" }, result: "success",
            risk: p.risk,
          };
          push(done);
        }
        await pushText(
          `转账 **¥${p.transfer?.amount}** 已成功执行。本次操作已记录完整决策链路，可在审计视图中追溯。`,
          { stream: true },
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, push, pushText, pushToolStep],
  );

  const cancelPending = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    setBusy(true);
    try {
      if (p.transfer) {
        push({
          id: uid(), role: "agent", kind: "transfer-card", createdAt: Date.now(),
          transfer: p.transfer, result: "cancelled",
        });
      }
      await pushText("操作已取消，未产生任何资金变动。", { stream: true });
    } finally {
      setBusy(false);
    }
  }, [push, pushText]);

  // 欢迎语
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      await sleep(400);
      await pushText(
        "你好，我是 **Aurora**，你的 AI 银行智能体。我可以在严格的安全框架内帮你办理查询、转账、账单分析和理财业务。点击下方快捷指令，体验绿 / 黄 / 红三级权限的完整流程。",
        { stream: true },
      );
    })();
  }, [pushText]);

  return { messages, pending, busy, send, confirmPending, cancelPending };
}
