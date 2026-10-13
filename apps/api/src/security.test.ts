import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, hashToken, newToken, mayAccessPersonalSpace } from './security.js';
test('passwords are salted and reject incorrect credentials', async () => {
  const a = await hashPassword('a sufficiently long password');
  const b = await hashPassword('a sufficiently long password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('a sufficiently long password', a), true);
  assert.equal(await verifyPassword('wrong password', a), false);
});
test('session tokens have independent hashes', () => {
  const token = newToken();
  assert.equal(hashToken(token).length, 64);
  assert.notEqual(hashToken(token), hashToken(newToken()));
});
test('household membership does not grant personal-space access', () => {
  assert.equal(mayAccessPersonalSpace('member', 'owner'), false);
  assert.equal(mayAccessPersonalSpace('owner', 'owner'), true);
  assert.equal(mayAccessPersonalSpace('member', null), false);
});
