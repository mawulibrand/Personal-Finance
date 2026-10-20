import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../packages/database/dist/index.js';
const db = createDatabase(process.env.DATABASE_URL);
after(async () => { await db.$disconnect(); });
const origin = 'http://localhost:3000';
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';
async function request(path, body, cookie) {
  const response = await fetch(`${apiOrigin}/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  const categoryPath = `spaces/${spaces.body[0].id}/categories`;
  const initialCategories = await request(categoryPath, undefined, login.cookie);
  assert.equal(initialCategories.status, 200);
  assert.ok(initialCategories.body.some(category => category.name === 'Food and groceries' && category.type === 'EXPENSE' && category.isSystem));
  const customCategory = await request(categoryPath, { name: 'Pet care', type: 'EXPENSE' }, login.cookie);
  assert.equal(customCategory.status, 201);
  assert.equal(customCategory.body.isSystem, false);
  assert.equal((await request(categoryPath, { name: 'pet care', type: 'EXPENSE' }, login.cookie)).status, 409);
  const incomePath = `spaces/${spaces.body[0].id}/income-sources`;
  assert.equal((await request(incomePath)).status, 401);
  const salary = await request(incomePath, {
    name: 'Main employer', type: 'SALARY', expectedAmount: '6000.00', currencyCode: 'GHS',
    paydayDays: [25, 26, 27, 28], adjustmentRule: 'PREVIOUS_WORKING_DAY',
  }, login.cookie);
  assert.equal(salary.status, 201);
  assert.equal(salary.body.type, 'SALARY');
  assert.equal(Number(salary.body.expectedAmount), 6000);
  assert.equal(salary.body.possiblePaydays.length, 4);
  const now = new Date();
  const receivedDate = now.toISOString().slice(0, 10);
  const payment = await request(`${incomePath}/${salary.body.id}/records`, {
    amount: '6100.25', receivedDate, periodYear: now.getUTCFullYear(), periodMonth: now.getUTCMonth() + 1,
  }, login.cookie);
  assert.equal(payment.status, 201);
  assert.equal(payment.body.amount, '6100.25');
  assert.equal((await request(`${incomePath}/${salary.body.id}/records`, {
    amount: '6100.25', receivedDate, periodYear: now.getUTCFullYear(), periodMonth: now.getUTCMonth() + 1,
  }, login.cookie)).status, 409);
  const selfEmployment = await request(incomePath, { name: 'Weekend work', type: 'SELF_EMPLOYMENT' }, login.cookie);
  assert.equal(selfEmployment.status, 201);
  assert.equal((await request(`${incomePath}/${selfEmployment.body.id}/records`, { amount: '250', receivedDate }, login.cookie)).status, 201);
  const incomeList = await request(incomePath, undefined, login.cookie);
  const confirmedSalary = incomeList.body.find(source => source.id === salary.body.id);
  assert.equal(confirmedSalary.currentPeriod.status, 'RECEIVED');
  assert.equal(confirmedSalary.currentPeriod.record.amount, '6100.25');
  assert.equal((await request(`spaces/${spaces.body[0].id}/income-sources/${salary.body.id}/records`, {
    amount: '1', receivedDate,
  })).status, 401);
  const expensesPath = `spaces/${spaces.body[0].id}/expenses`;
  const recordedExpense = await request(expensesPath, { categoryId: customCategory.body.id, amount: '23.45', spentAt: receivedDate, description: 'Weekly pet food' }, login.cookie);
  assert.equal(recordedExpense.status, 201);
  assert.equal(recordedExpense.body.amount, '23.45');
  assert.equal(recordedExpense.body.currencyCode, 'GHS');
  assert.equal(recordedExpense.body.category.name, 'Pet care');
  const incomeCategory = initialCategories.body.find(category => category.type === 'INCOME');
  assert.equal((await request(expensesPath, { categoryId: incomeCategory.id, amount: '2', spentAt: receivedDate }, login.cookie)).status, 400);
  const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.equal((await request(expensesPath, { categoryId: customCategory.body.id, amount: '2', spentAt: futureDate }, login.cookie)).status, 400);
  const expenseList = await request(`${expensesPath}?month=${receivedDate.slice(0, 7)}`, undefined, login.cookie);
  assert.equal(expenseList.status, 200);
  assert.equal(expenseList.body.total, '23.45');
  assert.equal(expenseList.body.records.length, 1);
  assert.equal(expenseList.body.records[0].description, 'Weekly pet food');
  assert.equal((await request(expensesPath, { categoryId: customCategory.body.id, amount: '2', spentAt: receivedDate })).status, 401);
  const savingsPath = `spaces/${spaces.body[0].id}/savings-accounts`;
  assert.equal((await request(savingsPath)).status, 401);
  const savingsAccount = await request(savingsPath, {
    name: 'Emergency savings', provider: 'Local Bank', currencyCode: 'ghs', openingBalance: '100.00', openedAt: receivedDate,
  }, login.cookie);
  assert.equal(savingsAccount.status, 201);
  assert.equal(savingsAccount.body.balance, '100');
  assert.equal(savingsAccount.body.currencyCode, 'GHS');
  const savingsTransactionsPath = `${savingsPath}/${savingsAccount.body.id}/transactions`;
  assert.equal((await request(savingsTransactionsPath, { type: 'DEPOSIT', amount: '50.25', transactionDate: receivedDate, description: 'Monthly savings' }, login.cookie)).status, 201);
  assert.equal((await request(savingsTransactionsPath, { type: 'WITHDRAWAL', amount: '20', transactionDate: receivedDate }, login.cookie)).status, 201);
  assert.equal((await request(savingsTransactionsPath, { type: 'WITHDRAWAL', amount: '131', transactionDate: receivedDate }, login.cookie)).status, 400);
  const savings = await request(savingsPath, undefined, login.cookie);
  assert.equal(savings.status, 200);
  assert.equal(savings.body.accounts[0].balance, '130.25');
  assert.equal(savings.body.accounts[0].transactions.length, 2);
  assert.equal(savings.body.totalsByCurrency.GHS, '130.25');
  const concurrentWithdrawals = await Promise.all([
    request(savingsTransactionsPath, { type: 'WITHDRAWAL', amount: '100', transactionDate: receivedDate }, login.cookie),
    request(savingsTransactionsPath, { type: 'WITHDRAWAL', amount: '100', transactionDate: receivedDate }, login.cookie),
  ]);
  assert.deepEqual(concurrentWithdrawals.map(result => result.status).sort(), [201, 400]);
  assert.equal((await request(savingsPath, undefined, login.cookie)).body.accounts[0].balance, '30.25');
  const savingsBeforeOpened = await request(savingsTransactionsPath, { type: 'DEPOSIT', amount: '1', transactionDate: '2000-01-01' }, login.cookie);
  assert.equal(savingsBeforeOpened.status, 400);
  const recurringPath = `spaces/${spaces.body[0].id}/recurring-records`;
  const recurringExpense = await request(recurringPath, {
    name: 'Monthly pet food', flow: 'EXPENSE', amount: '30', frequency: 'MONTHLY', startDate: receivedDate, categoryId: customCategory.body.id,
  }, login.cookie);
  assert.equal(recurringExpense.status, 201);
  assert.equal((await request(recurringPath, undefined, login.cookie)).body.find(item => item.id === recurringExpense.body.id).isDue, true);
  const recurringExpenseRecord = await request(`${recurringPath}/${recurringExpense.body.id}/record`, { actualDate: receivedDate }, login.cookie);
  assert.equal(recurringExpenseRecord.status, 201);
  assert.equal(recurringExpenseRecord.body.flow, 'EXPENSE');
  assert.equal((await request(`${recurringPath}/${recurringExpense.body.id}/record`, { actualDate: receivedDate }, login.cookie)).status, 400);
  assert.equal((await request(`${recurringPath}/${recurringExpense.body.id}/status`, { isActive: false }, login.cookie)).body.isActive, false);
  assert.equal((await request(`${recurringPath}/${recurringExpense.body.id}/status`, { isActive: true }, login.cookie)).body.isActive, true);
  const recurringIncome = await request(recurringPath, {
    name: 'Monthly side work', flow: 'INCOME', amount: '500', frequency: 'MONTHLY', startDate: receivedDate, sourceId: selfEmployment.body.id,
  }, login.cookie);
  assert.equal(recurringIncome.status, 201);
  assert.equal((await request(`${recurringPath}/${recurringIncome.body.id}/record`, { actualDate: receivedDate }, login.cookie)).status, 201);
  assert.equal((await request(recurringPath, { name: 'Salary recurrence', flow: 'INCOME', amount: '6000', frequency: 'MONTHLY', startDate: receivedDate, sourceId: salary.body.id }, login.cookie)).status, 400);
  const foreignSource = await request(incomePath, { name: 'USD contract', type: 'OTHER', currencyCode: 'USD' }, login.cookie);
  assert.equal(foreignSource.status, 201);
  assert.equal((await request(`${incomePath}/${foreignSource.body.id}/records`, { amount: '100', receivedDate }, login.cookie)).status, 201);
  assert.equal((await request(recurringPath, { name: 'Foreign monthly pay', flow: 'INCOME', amount: '100', frequency: 'MONTHLY', startDate: receivedDate, sourceId: foreignSource.body.id }, login.cookie)).status, 400);
  const budgetsPath = `spaces/${spaces.body[0].id}/budgets`;
  const budgetMonth = receivedDate.slice(0, 7);
  assert.equal((await request(`${budgetsPath}/allocations`, { month: budgetMonth, categoryId: customCategory.body.id, limitAmount: '100' }, login.cookie)).status, 201);
  const budget = await request(`${budgetsPath}?month=${budgetMonth}`, undefined, login.cookie);
  assert.equal(budget.status, 200);
  assert.equal(budget.body.totalLimit, '100');
  assert.equal(budget.body.allocations[0].spent, '53.45');
  assert.equal(budget.body.allocations[0].remaining, '46.55');
  assert.equal((await request(`${budgetsPath}/allocations`, { month: budgetMonth, categoryId: customCategory.body.id, limitAmount: '120' }, login.cookie)).status, 201);
  const updatedBudget = await request(`${budgetsPath}?month=${budgetMonth}`, undefined, login.cookie);
  assert.equal(updatedBudget.body.totalLimit, '120');
  assert.equal(updatedBudget.body.allocations[0].remaining, '66.55');
  assert.equal((await request(`${budgetsPath}/allocations`, { month: budgetMonth, categoryId: incomeCategory.id, limitAmount: '100' }, login.cookie)).status, 400);
  const dashboardData = await request(`${path}?month=${budgetMonth}`, undefined, login.cookie);
  assert.equal(dashboardData.body.income.total, '6850.25');
  assert.equal(dashboardData.body.income.excludedCurrencyCount, 1);
  assert.equal(dashboardData.body.expenses.total, '53.45');
  assert.equal(dashboardData.body.netCashFlow, '6796.8');
  assert.equal(dashboardData.body.expenses.byCategory[0].total, '53.45');
  assert.equal(dashboardData.body.budget.remaining, '66.55');
  await request('auth/register', { name: 'Bob', email: secondEmail, password });
  await request('auth/verify', { token: await emailToken(secondEmail, 'Verify your email') });
  const bob = await request('auth/login', { email: secondEmail, password });
  assert.equal((await request(path, undefined, bob.cookie)).status, 404);
  assert.equal((await request(categoryPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(incomePath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(recurringPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(budgetsPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(savingsPath, undefined, bob.cookie)).status, 404);
  const bobSpaces = await request('spaces', undefined, bob.cookie);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/savings-accounts/${savingsAccount.body.id}/transactions`, { type: 'DEPOSIT', amount: '1', transactionDate: receivedDate }, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/expenses`, { categoryId: customCategory.body.id, amount: '3', spentAt: receivedDate }, bob.cookie)).status, 400);
  assert.equal((await request(expensesPath, undefined, bob.cookie)).status, 404);
  const csrf = await fetch(`${apiOrigin}/auth/logout`, { method: 'POST', headers: { Origin: 'http://untrusted.example', Cookie: login.cookie, 'Content-Type': 'application/json' }, body: '{}' });
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
