import { useEffect, useState } from "react";
import {
  DEMO,
  getAccounts,
  getCards,
  getDebits,
  getInvestmentProducts,
  getPayees,
  getTransactions,
  toNumber,
  type Account,
  type BankCard,
  type Debit,
  type InvestmentProduct,
  type Payee,
  type Transaction,
} from "./bank";

export interface BankSnapshot {
  account: Account;
  transactions: Transaction[];
  cards: BankCard[];
  payees: Payee[];
  debits: Debit[];
  products: InvestmentProduct[];
}

/** loading=请求中，live=后端真实数据，fallback=后端不可用时的本地兜底 */
export type DataSource = "loading" | "live" | "fallback";

/** 后端不可用时的兜底快照，保证演示界面不空白 */
const FALLBACK: BankSnapshot = {
  account: { id: DEMO.accountId, name: DEMO.userName, balance: "0.00", status: "unavailable" },
  transactions: [],
  cards: [],
  payees: [],
  debits: [],
  products: [],
};

/**
 * 一次性拉取首页/我的页所需的全部 Mock Bank 数据。
 * 任一请求失败即整体降级为 fallback，并给出失败原因。
 */
export function useBankData() {
  const [snapshot, setSnapshot] = useState<BankSnapshot>(FALLBACK);
  const [source, setSource] = useState<DataSource>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [accounts, transactions, cards, payees, debits, products] = await Promise.all([
          getAccounts(),
          getTransactions(DEMO.accountId, 20),
          getCards(),
          getPayees(),
          getDebits(),
          getInvestmentProducts(),
        ]);
        if (cancelled) return;
        setSnapshot({
          account: accounts[0] ?? FALLBACK.account,
          transactions,
          cards,
          payees,
          debits,
          products,
        });
        setSource("live");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setSource("fallback");
        setError(err instanceof Error ? err.message : "加载失败");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { snapshot, source, error };
}

/** 按月份聚合交易金额，用于收入趋势图 */
export function monthlySeries(transactions: Transaction[], months = 6) {
  const now = new Date();
  const buckets: { month: string; amount: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ month: `${d.getMonth() + 1}月`, amount: 0 });
  }
  const startIndex = buckets.length - months;
  for (const tx of transactions) {
    const d = new Date(tx.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const diff =
      (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (diff < 0 || diff >= months) continue;
    buckets[startIndex + (months - 1 - diff)].amount += Math.abs(toNumber(tx.amount));
  }
  return buckets;
}

/** 本月流入合计 */
export function incomeThisMonth(transactions: Transaction[]): number {
  const now = new Date();
  return transactions
    .filter((tx) => {
      const d = new Date(tx.created_at);
      return (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        (tx.direction === "in" || toNumber(tx.amount) > 0)
      );
    })
    .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount)), 0);
}