export function parsePaymentAmount(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function paymentAmountError(value: string, availableCents: number, singleLimitCents?: number): string {
  const cents = parsePaymentAmount(value);
  if (cents === null) return "请输入大于零、最多两位小数的金额";
  if (cents > availableCents) return "金额超过账户可用余额";
  if (singleLimitCents !== undefined && cents > singleLimitCents) return "金额超过银行卡单笔限额，请调整金额或管理限额";
  return "";
}

/** participantCount excludes the initiator. The first allocation receives the remainder. */
export function allocateSplit(totalCents: number, participantCount: number, includeSelf: boolean) {
  const count = participantCount + (includeSelf ? 1 : 0);
  if (!Number.isSafeInteger(totalCents) || !Number.isInteger(participantCount) || participantCount < 1 || participantCount > 12 || totalCents < count) throw new RangeError("金额须足够每人至少分摊 0.01 元，参与人数为 1–12 人");
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return {
    selfCents: includeSelf ? base + remainder : 0,
    participantCents: Array.from({ length: participantCount }, (_, index) => base + (!includeSelf && index === 0 ? remainder : 0)),
  };
}
