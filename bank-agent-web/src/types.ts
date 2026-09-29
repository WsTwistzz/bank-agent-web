// ── 权限分级 ──────────────────────────────────────────────
export type RiskLevel = "green" | "yellow" | "red";

// ── 消息类型 ──────────────────────────────────────────────
export type MessageRole = "user" | "agent";

export interface BaseMessage {
  id: string;
  role: MessageRole;
  createdAt: number;
}

export interface TextMessage extends BaseMessage {
  kind: "text";
  text: string;
  /** Agent 文本是否正在打字机输出中 */
  streaming?: boolean;
}

export interface ToolStepMessage extends BaseMessage {
  kind: "tool-step";
  tool: string;
  label: string;
  status: "running" | "done";
  durationMs?: number;
}

export interface BalanceCardMessage extends BaseMessage {
  kind: "balance-card";
  account: AccountInfo;
}

export interface SpendingChartMessage extends BaseMessage {
  kind: "spending-chart";
  categories: SpendingCategory[];
  monthly: MonthlySpend[];
  totalSpent: number;
}

export interface TransferCardMessage extends BaseMessage {
  kind: "transfer-card";
  transfer: TransferInfo;
  /** 转账完成后的结果状态 */
  result?: "success" | "cancelled";
  /** 操作权限级别（成功时显示对应徽章） */
  risk?: RiskLevel;
}

export interface ProductsMessage extends BaseMessage {
  kind: "products";
  products: InvestmentProduct[];
}

export type Message =
  | TextMessage
  | ToolStepMessage
  | BalanceCardMessage
  | SpendingChartMessage
  | TransferCardMessage
  | ProductsMessage;

// ── 业务数据 ──────────────────────────────────────────────
export interface AccountInfo {
  id: string;
  name: string;
  balance: string;
  status: string;
}

export interface SpendingCategory {
  name: string;
  amount: number;
  color: string;
}

export interface MonthlySpend {
  month: string;
  amount: number;
}

export interface TransferInfo {
  id: string;
  from: string;
  to: string;
  toName: string;
  amount: string;
  note: string;
  status: "prepared" | "executed";
}

export interface InvestmentProduct {
  id: string;
  name: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  annualRate: string;
  minAmount: string;
}

// ── 待处理操作（黄/红权限） ────────────────────────────────
export interface PendingAction {
  id: string;
  risk: "yellow" | "red";
  title: string;
  description: string;
  detail: { label: string; value: string }[];
  transfer?: TransferInfo;
  /** 红色操作需要的 OTP（演示模式固定为 240816） */
  requiresOtp: boolean;
}
