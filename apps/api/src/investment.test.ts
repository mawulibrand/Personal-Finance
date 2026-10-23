import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFixedDepositValue, calculateInvestmentQuantity, validateInvestmentQuantityHistory } from './investment.js';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('fixed-deposit simple interest uses elapsed days and stops at maturity', () => {
  const value = calculateFixedDepositValue({
    principal: '1000',
    annualInterestRate: '12',
    interestMethod: 'SIMPLE',
    compoundingFrequency: 12,
    startDate: date('2025-01-01'),
    maturityDate: date('2026-01-01'),
    valuationDate: date('2025-07-02'),
  });
  assert.equal(value, '1059.8356');
  assert.equal(calculateFixedDepositValue({
    principal: '1000',
    annualInterestRate: '12',
    interestMethod: 'SIMPLE',
    compoundingFrequency: 12,
    startDate: date('2025-01-01'),
    maturityDate: date('2026-01-01'),
    valuationDate: date('2027-01-01'),
  }), '1120.0000');
});

test('fixed-deposit compound interest applies the configured compounding frequency', () => {
  assert.equal(calculateFixedDepositValue({
    principal: '1000',
    annualInterestRate: '12',
    interestMethod: 'COMPOUND',
    compoundingFrequency: 12,
    startDate: date('2025-01-01'),
    maturityDate: date('2026-01-01'),
    valuationDate: date('2026-01-01'),
  }), '1126.8250');
});

test('investment unit valuation includes buys and contributions and subtracts sells and withdrawals as of date', () => {
  const transactions = [
    { type: 'BUY', quantity: '2.5', transactionDate: date('2025-01-01') },
    { type: 'CONTRIBUTION', quantity: '1', transactionDate: date('2025-02-01') },
    { type: 'SELL', quantity: '0.25', transactionDate: date('2025-03-01') },
    { type: 'WITHDRAWAL', quantity: '0.5', transactionDate: date('2025-04-01') },
  ];
  assert.equal(calculateInvestmentQuantity(transactions, date('2025-03-01')).toString(), '3.25');
  assert.equal(calculateInvestmentQuantity(transactions, date('2025-04-01')).toString(), '2.75');
});

test('dated investment transaction history prevents selling units before they are held', () => {
  const transactions = [
    { id: 'buy', type: 'BUY', quantity: '3', transactionDate: date('2025-02-01'), createdAt: date('2025-02-01') },
  ];
  assert.equal(validateInvestmentQuantityHistory(transactions, {
    type: 'SELL',
    quantity: '2',
    transactionDate: date('2025-03-01'),
  }), true);
  assert.equal(validateInvestmentQuantityHistory(transactions, {
    type: 'SELL',
    quantity: '4',
    transactionDate: date('2025-03-01'),
  }), false);
  assert.equal(validateInvestmentQuantityHistory(transactions, {
    type: 'SELL',
    quantity: '1',
    transactionDate: date('2025-01-01'),
  }), false);
});
