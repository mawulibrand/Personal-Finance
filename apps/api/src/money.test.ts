import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDecimals, decimalToUnits, subtractDecimals, unitsToDecimal } from './money.js';

test('decimal helpers preserve precision and handle negative cash flow', () => {
  assert.equal(unitsToDecimal(decimalToUnits('123.4500')), '123.45');
  assert.equal(addDecimals('0.1', '0.2', '1.0001'), '1.3001');
  assert.equal(subtractDecimals('10', '10.25'), '-0.25');
});
