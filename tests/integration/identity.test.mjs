import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../packages/database/dist/index.js';
const db = createDatabase(process.env.DATABASE_URL);
after(async () => { await db.$disconnect(); });
const origin = 'http://localhost:3000';
async function request(path, body, cookie) {
  const response = await fetch(`http://localhost:4000/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function emailToken(email, subject) {
  const outbox = await db.emailOutbox.findFirstOrThrow({ where: { recipient: email, subject }, orderBy: { createdAt: 'desc' } });
  return outbox.body.split('#token=')[1];
}
test('identity flow protects spaces and invalidates consumed tokens and reset sessions', async () => {
  const suffix = crypto.randomUUID();
  const email = `alice-${suffix}@example.com`;
  const secondEmail = `bob-${suffix}@example.com`;
  const password = 'a long test password 123!';
  assert.equal((await request('auth/register', { name: 'Alice', email, password })).status, 201);
  assert.equal((await request('auth/login', { email, password })).status, 401);
  const token = await emailToken(email, 'Verify your email');
  assert.equal((await request('auth/verify', { token })).status, 201);
  assert.equal((await request('auth/verify', { token })).status, 400);
  const login = await request('auth/login', { email, password });
  assert.equal(login.status, 201);
  assert.ok(login.cookie);
  const spaces = await request('spaces', undefined, login.cookie);
  assert.equal(spaces.body.length, 1);
  assert.equal(spaces.body[0].type, 'PERSONAL');
  assert.equal(spaces.body[0].baseCurrency, 'GHS');
  const path = `spaces/${spaces.body[0].id}/dashboard`;
  assert.equal((await request(path, undefined, login.cookie)).status, 200);
  assert.equal((await request(path)).status, 401);
  await request('auth/register', { name: 'Bob', email: secondEmail, password });
  await request('auth/verify', { token: await emailToken(secondEmail, 'Verify your email') });
  const bob = await request('auth/login', { email: secondEmail, password });
  assert.equal((await request(path, undefined, bob.cookie)).status, 404);
  const csrf = await fetch('http://localhost:4000/auth/logout', { method: 'POST', headers: { Origin: 'http://untrusted.example', Cookie: login.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(csrf.status, 403);
  await request('auth/forgot-password', { email });
  const resetToken = await emailToken(email, 'Reset your password');
  const replacement = 'a different long password 456!';
  assert.equal((await request('auth/reset-password', { token: resetToken, password: replacement })).status, 201);
  assert.equal((await request('auth/me', undefined, login.cookie)).status, 401);
  assert.equal((await request('auth/reset-password', { token: resetToken, password: replacement })).status, 400);
  assert.equal((await request('auth/login', { email, password })).status, 401);
  const renewed = await request('auth/login', { email, password: replacement });
  assert.equal(renewed.status, 201);
  assert.equal((await request('auth/logout', {}, renewed.cookie)).status, 201);
  assert.equal((await request('auth/me', undefined, renewed.cookie)).status, 401);
});
