import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePaymentAmount, paymentAmountError, allocateSplit } from '../src/app/features/paymentMath.ts';

test('payment inputs keep cents exact and reject invalid precision', () => {
  assert.equal(parsePaymentAmount('100.01'), 10001);
  assert.equal(parsePaymentAmount('0.29'), 29);
  for (const input of ['', '0', '-1', '1.001', 'NaN', '1e3', '9007199254740991.99']) assert.equal(parsePaymentAmount(input), null);
});

test('payment validation distinguishes insufficient funds and card limits', () => {
  assert.match(paymentAmountError('101', 10000), /可用余额/);
  assert.match(paymentAmountError('51', 10000, 5000), /单笔限额/);
  assert.equal(paymentAmountError('50.00', 5000, 5000), '');
});

test('split keeps every cent and assigns remainder to the initiator', () => {
  assert.deepEqual(allocateSplit(10000, 2, true), { selfCents: 3334, participantCents: [3333, 3333] });
  assert.deepEqual(allocateSplit(10000, 3, false), { selfCents: 0, participantCents: [3334, 3333, 3333] });
  assert.deepEqual(allocateSplit(1, 1, false), { selfCents: 0, participantCents: [1] });
});

test('split never creates zero shares or invalid participant counts', () => {
  for (const args of [[1,2,true],[100,0,true],[100,-1,false],[100,1.5,false],[100,13,false]]) assert.throws(() => allocateSplit(...args), RangeError);
  for (let count = 1; count <= 10; count++) {
    const result = allocateSplit(12345, count, true);
    assert.equal(result.selfCents + result.participantCents.reduce((a,b) => a+b,0),12345);
  }
});
