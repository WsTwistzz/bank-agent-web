/**
 * Mock Bank REST 客户端
 *
 * 通过 Vite 代理访问后端 Mock Bank（默认 http://127.0.0.1:8000），
 * 避免后端无 CORS 配置导致的跨域问题。见 vite.config.ts。
 *
 * 接口契约以后端 bank_gateway / mock_bank/app.py 的路由为准。
 */

const BASE = "/api/bank";

/** 演示用户与主账户（后端 bank.db 种子数据） */
export const DEMO = {
  userId: "U1",
  userName: "Alice",
  accountId: "A1001",
} as const;

// ── 后端返回的原始结构 ─────────────────────────────────────
export interface Account {
  id: string;
  name: string;
  /** 字符串金额，如 "900.00" */
  balance: string;
  status: string;
}

export interface Transaction {
  id: number;
  kind: string;
  /** 带符号字符串，如 "-100.00" */
  amount: string;
  counterparty: string | null;
  note: string | null;
  created_at: string;
  direction: "in" | "out";
  category: string | null;
  merchant: string | null;
}

export interface BankCard {
  id: string;
  account_id: string;
  card_type: string;
  status: string;
  /** 字符串金额，如 "5000.00" */
  limit: string;
}

export interface Payee {
  id: string;
  owner_user_id: string;
  name: string;
  phone: string;
  account_id: string;
  alias: string | null;
}

export interface Debit {
  id: string;
  account_id: string;
  merchant: string;
  status: string;
  amount: string;
  frequency: string;
  next_charge_at: string;
  created_at: string;
}

export interface InvestmentProduct {
  id: string;
  name: string;
  product_type: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  expected_return_min: string;
  expected_return_max: string;
  minimum_amount: string;
  lock_days: number;
  liquidity: string;
  fee_rate: string;
  issuer: string;
}

export interface TransferRecord {
  id: string;
  from: string;
  to: string;
  amount: string;
  note: string;
  status: "prepared" | "executed";
}

/** 后端返回 {"error": "..."} 时抛出 */
export class BankApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BankApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (cause) {
    throw new BankApiError(`无法连接 Mock Bank（${BASE}）：请确认后端 8000 端口已启动`, 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* 响应非 JSON，沿用 statusText */
    }
    throw new BankApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── 查询 ───────────────────────────────────────────────────
export const getAccounts = (userId: string = DEMO.userId) =>
  request<Account[]>(`/users/${userId}/accounts`);

export const getCards = (userId: string = DEMO.userId) =>
  request<BankCard[]>(`/users/${userId}/cards`);

export const getPayees = (userId: string = DEMO.userId) =>
  request<Payee[]>(`/users/${userId}/payees`);

export const getDebits = (userId: string = DEMO.userId) =>
  request<Debit[]>(`/users/${userId}/debits`);

export const getTransactions = (accountId: string = DEMO.accountId, limit = 20) =>
  request<Transaction[]>(`/accounts/${accountId}/transactions?limit=${limit}`);

export const getHoldings = (accountId: string = DEMO.accountId) =>
  request<unknown[]>(`/accounts/${accountId}/holdings`);

export const getInvestmentProducts = () =>
  request<InvestmentProduct[]>("/investments/products");

export const getLoanProducts = () => request<unknown[]>("/loan-products");

// ── 转账（prepare + execute 两步，对应后端 HITL 语义） ─────
export const prepareTransfer = (input: {
  from: string;
  to: string;
  amount: string;
  note?: string;
}) =>
  request<TransferRecord>("/transfers/prepare", {
    method: "POST",
    body: JSON.stringify({ note: "", ...input }),
  });

export const executeTransfer = (transferId: string) =>
  request<TransferRecord>(`/transfers/${transferId}/execute`, { method: "POST" });

// ── 卡片管理 ───────────────────────────────────────────────
export const freezeCard = (cardId: string) =>
  request<BankCard>(`/cards/${cardId}/freeze`, { method: "POST" });

export const unfreezeCard = (cardId: string) =>
  request<BankCard>(`/cards/${cardId}/unfreeze`, { method: "POST" });

// ── 展示辅助 ───────────────────────────────────────────────
/** "900.00" -> 900 */
export const toNumber = (amount: string | null | undefined): number =>
  Number(String(amount ?? "0").replace(/,/g, "")) || 0;

/** 900 -> "¥900.00" */
export const formatMoney = (value: number, withSign = false): string => {
  const sign = withSign && value > 0 ? "+" : "";
  return (
    sign +
    "¥" +
    Math.abs(value).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

/** "2026-09-07T13:42:43.326692+00:00" -> "09-07 13:42" */
export const formatTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};