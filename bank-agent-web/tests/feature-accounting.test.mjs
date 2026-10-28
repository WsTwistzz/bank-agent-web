import assert from 'node:assert/strict';
import test from 'node:test';
import { decimalCents, summarizeTransactions, transactionMonth, shanghaiDay, calendarDayValue, subscriptionCostsCents } from '../src/app/features/featureAccounting.ts';

const tx = (kind, amount, direction, created_at = '2026-10-29T10:00:00+08:00') => ({ id: 1, kind, amount, direction, created_at, category: null, counterparty: null, merchant: null, note: null });

test('legacy transfer rows do not inflate earned income or consumption', () => {
  assert.deepEqual(summarizeTransactions([
    tx('transfer_out', '-800.00', 'out'), tx('transfer_in', '200.00', 'in'), tx('EXTERNAL_CREDIT', '12000.00', 'in'), tx('CARD_SPEND', '-126.00', 'out'), tx('MANDATE', '-15.00', 'out'),
  ]), { spending: 14100, income: 1200000, transferIn: 20000, transferOut: 80000 });
});

test('canonical transfers and empty lists retain separate totals', () => {
  assert.deepEqual(summarizeTransactions([tx('P2P_EXTERNAL', '-50.00', 'out'), tx('TRANSFER_INTERNAL', '25.00', 'in')]), { spending: 0, income: 0, transferIn: 2500, transferOut: 5000 });
  assert.deepEqual(summarizeTransactions([]), { spending: 0, income: 0, transferIn: 0, transferOut: 0 });
});

test('consumption excludes investment and reversals, respects direction', () => {
  assert.equal(summarizeTransactions([tx('investment', '-1000.00', 'out'), tx('CARD_SPEND', '50.00', 'in'), tx('card_spend', '12.30', 'out')]).spending, 1230);
});

test('decimal money is parsed exactly into cents', () => {
  assert.equal(decimalCents('0.29') + decimalCents('0.01'), 30);
  assert.equal(decimalCents('-123.4'), -12340);
  assert.equal(decimalCents('1.234'), 0);
  assert.equal(decimalCents('not-money'), 0);
});

test('UTC charges and monthly boundaries use Shanghai calendar dates', () => {
  assert.equal(shanghaiDay('2026-10-31T18:00:00Z'), '2026-11-01');
  assert.equal(transactionMonth(tx('MANDATE', '-15.00', 'out', '2026-10-31T18:00:00Z')), '2026-11');
  assert.equal(calendarDayValue('2026-10-31T18:00:00Z') - calendarDayValue('2026-10-29'), 3 * 86400000);
  assert.equal(shanghaiDay('bad-date'), '');
});

test('weekly costs floor each monthly conversion before summing', () => {
  const first = subscriptionCostsCents('0.01', 'weekly');
  const second = subscriptionCostsCents('0.02', 'weekly');
  assert.deepEqual(first, { annual: 52, monthly: 4 });
  assert.equal(first.monthly + second.monthly, 12);
  assert.deepEqual(subscriptionCostsCents('199.00', 'monthly'), { annual: 238800, monthly: 19900 });
  assert.deepEqual(subscriptionCostsCents('12.00', 'unknown'), { annual: 0, monthly: 0 });
});
