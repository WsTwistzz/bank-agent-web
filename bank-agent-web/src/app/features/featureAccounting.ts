import type { Transaction } from "../../api/bank";

/** Parse the legacy decimal-string API into integer cents for UI aggregation. */
export function decimalCents(value: string): number {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return 0;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? (match[1] === "-" ? -cents : cents) : 0;
}

export function signedTransactionCents(tx: Transaction): number {
  const cents = Math.abs(decimalCents(tx.amount));
  return tx.direction === "in" ? cents : -cents;
}

export function isTransferTransaction(tx: Transaction): boolean {
  return /^(P2P|TRANSFER)(_|$)/i.test(tx.kind);
}

export function isConsumptionTransaction(tx: Transaction): boolean {
  return ["CARD_SPEND", "MANDATE"].includes(tx.kind.toUpperCase()) && signedTransactionCents(tx) < 0;
}

export function summarizeTransactions(rows: Transaction[]) {
  return rows.reduce((result, tx) => {
    const amount = signedTransactionCents(tx);
    if (isConsumptionTransaction(tx)) result.spending += Math.abs(amount);
    if (isTransferTransaction(tx)) {
      if (amount > 0) result.transferIn += amount;
      else result.transferOut += Math.abs(amount);
    } else if (amount > 0) result.income += amount;
    return result;
  }, { spending: 0, income: 0, transferIn: 0, transferOut: 0 });
}

export function shanghaiDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function transactionMonth(tx: Transaction): string {
  return shanghaiDay(tx.created_at).slice(0, 7);
}

export function calendarDayValue(value: string): number {
  const day = shanghaiDay(value);
  return day ? Date.parse(`${day}T00:00:00Z`) : NaN;
}

export function subscriptionCostsCents(amount: string, frequency: string) {
  const cents = Math.max(0, decimalCents(amount));
  const annual = frequency === "weekly" ? cents * 52 : frequency === "monthly" ? cents * 12 : 0;
  return { annual, monthly: frequency === "weekly" ? Math.floor(annual / 12) : frequency === "monthly" ? cents : 0 };
}
