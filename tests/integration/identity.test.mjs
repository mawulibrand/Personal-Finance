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
  assert.equal((await request('auth/me', undefined, login.cookie)).body.canManageFinancialRules, false);
  const notificationPreferencesPath = 'notifications/preferences';
  const initialNotificationPreferences = await request(notificationPreferencesPath, undefined, login.cookie);
  assert.equal(initialNotificationPreferences.status, 200);
  assert.equal(initialNotificationPreferences.body.paydayInApp, false);
  assert.equal(initialNotificationPreferences.body.maturityEmail, false);
  assert.equal((await request(notificationPreferencesPath)).status, 401);
  assert.equal((await request(notificationPreferencesPath, { ...initialNotificationPreferences.body, unexpected: true }, login.cookie)).status, 400);
  const savedNotificationPreferences = await request(notificationPreferencesPath, {
    paydayInApp: true,
    paydayEmail: false,
    maturityInApp: false,
    maturityEmail: true,
    monthlyReviewInApp: false,
    monthlyReviewEmail: false,
  }, login.cookie);
  assert.equal(savedNotificationPreferences.status, 201);
  assert.equal(savedNotificationPreferences.body.paydayInApp, true);
  assert.equal(savedNotificationPreferences.body.maturityEmail, true);
  assert.equal((await request('admin/financial-rules', undefined, login.cookie)).status, 403);
  assert.equal((await request('admin/financial-rules')).status, 401);
  const configuredAdminEmail = process.env.FINANCIAL_RULE_ADMIN_TEST_EMAIL;
  if (configuredAdminEmail) {
    const adminPassword = 'a long test admin password 123!';
    const existingAdmin = await db.user.findUnique({ where: { email: configuredAdminEmail } });
    if (!existingAdmin) {
      assert.equal((await request('auth/register', { name: 'Rule Admin', email: configuredAdminEmail, password: adminPassword })).status, 201);
      const adminToken = await emailToken(configuredAdminEmail, 'Verify your email');
      assert.equal((await request('auth/verify', { token: adminToken })).status, 201);
    }
    const adminLogin = await request('auth/login', { email: configuredAdminEmail, password: adminPassword });
    assert.equal(adminLogin.status, 201);
    assert.equal((await request('auth/me', undefined, adminLogin.cookie)).body.canManageFinancialRules, true);
    const ruleList = await request('admin/financial-rules', undefined, adminLogin.cookie);
    assert.equal(ruleList.status, 200);
    const savingsRule = ruleList.body.find(rule => rule.code === 'SAVINGS_RATE_BELOW_TARGET' && rule.market === '*');
    assert.ok(savingsRule);
    assert.equal((await request(`admin/financial-rules/${savingsRule.id}`, {
      enabled: savingsRule.enabled, threshold: '101', severity: savingsRule.severity,
    }, adminLogin.cookie)).status, 400);
    const updatedRule = await request(`admin/financial-rules/${savingsRule.id}`, {
      enabled: savingsRule.enabled, threshold: savingsRule.threshold, severity: savingsRule.severity,
    }, adminLogin.cookie);
    assert.equal(updatedRule.status, 201);
    assert.equal(updatedRule.body.threshold, savingsRule.threshold);
  }
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
  const liabilitiesPath = `spaces/${spaces.body[0].id}/liabilities`;
  assert.equal((await request(liabilitiesPath)).status, 401);
  const liability = await request(liabilitiesPath, {
    type: 'PERSONAL_LOAN', name: 'Education loan', provider: 'Local Bank', currencyCode: 'GHS',
    originalAmount: '1000', openingBalance: '800', annualInterestRate: '12.5', monthlyPayment: '100', startDate: receivedDate,
  }, login.cookie);
  assert.equal(liability.status, 201);
  assert.equal(liability.body.status, 'ACTIVE');
  assert.equal(liability.body.outstandingBalance, '800');
  const liabilityPaymentsPath = `${liabilitiesPath}/${liability.body.id}/payments`;
  const repayment = await request(liabilityPaymentsPath, { amount: '200', principalAmount: '150', paidAt: receivedDate, description: 'Monthly repayment' }, login.cookie);
  assert.equal(repayment.status, 201);
  assert.equal(repayment.body.interestAndFeesAmount, '50');
  assert.equal(repayment.body.outstandingBalance, '650');
  assert.equal((await request(liabilityPaymentsPath, { amount: '700', principalAmount: '651', paidAt: receivedDate }, login.cookie)).status, 400);
  assert.equal((await request(liabilityPaymentsPath, { amount: '10', principalAmount: '11', paidAt: receivedDate }, login.cookie)).status, 400);
  assert.equal((await request(liabilityPaymentsPath, { amount: '10', paidAt: '2000-01-01' }, login.cookie)).status, 400);
  const concurrentRepayments = await Promise.all([
    request(liabilityPaymentsPath, { amount: '400', paidAt: receivedDate }, login.cookie),
    request(liabilityPaymentsPath, { amount: '400', paidAt: receivedDate }, login.cookie),
  ]);
  assert.deepEqual(concurrentRepayments.map(result => result.status).sort(), [201, 400]);
  assert.equal((await request(liabilitiesPath, undefined, login.cookie)).body.liabilities[0].outstandingBalance, '250');
  const finalRepayment = await request(liabilityPaymentsPath, { amount: '250', paidAt: receivedDate }, login.cookie);
  assert.equal(finalRepayment.status, 201);
  assert.equal(finalRepayment.body.status, 'PAID_OFF');
  assert.equal((await request(liabilityPaymentsPath, { amount: '1', paidAt: receivedDate }, login.cookie)).status, 400);
  const liabilityList = await request(liabilitiesPath, undefined, login.cookie);
  assert.equal(liabilityList.status, 200);
  assert.equal(liabilityList.body.totalsByCurrency.GHS, '0');
  assert.equal(liabilityList.body.liabilities[0].status, 'PAID_OFF');
  assert.equal(liabilityList.body.liabilities[0].principalPaid, '800');
  assert.equal(liabilityList.body.liabilities[0].payments.length, 3);
  const goalsPath = `spaces/${spaces.body[0].id}/goals`;
  assert.equal((await request(goalsPath)).status, 401);
  const goal = await request(goalsPath, {
    name: 'Emergency fund', description: 'Three months of essential costs', targetAmount: '500', currencyCode: 'GHS', targetDate: '2030-12-31',
  }, login.cookie);
  assert.equal(goal.status, 201);
  assert.equal(goal.body.currentAmount, '0');
  assert.equal(goal.body.remainingAmount, '500');
  const goalContributionsPath = `${goalsPath}/${goal.body.id}/contributions`;
  assert.equal((await request(goalContributionsPath, { type: 'CONTRIBUTION', amount: '250.25', contributionDate: receivedDate, description: 'First deposit' }, login.cookie)).status, 201);
  assert.equal((await request(goalContributionsPath, { type: 'WITHDRAWAL', amount: '300', contributionDate: receivedDate }, login.cookie)).status, 400);
  const goalContribution = await request(goalContributionsPath, { type: 'CONTRIBUTION', amount: '249.75', contributionDate: receivedDate }, login.cookie);
  assert.equal(goalContribution.status, 201);
  assert.equal(goalContribution.body.currentAmount, '500');
  assert.equal(goalContribution.body.remainingAmount, '0');
  assert.equal(goalContribution.body.isCompleted, true);
  const goals = await request(goalsPath, undefined, login.cookie);
  assert.equal(goals.status, 200);
  assert.equal(goals.body.goals[0].progressPercent, 100);
  assert.equal(goals.body.goals[0].isCompleted, true);
  assert.equal(goals.body.goals[0].contributions.length, 2);
  const goalWithdrawal = await request(goalContributionsPath, { type: 'WITHDRAWAL', amount: '20', contributionDate: receivedDate }, login.cookie);
  assert.equal(goalWithdrawal.status, 201);
  assert.equal(goalWithdrawal.body.currentAmount, '480');
  assert.equal(goalWithdrawal.body.isCompleted, false);
  const invalidDatedGoalWithdrawal = await request(goalContributionsPath, { type: 'WITHDRAWAL', amount: '100', contributionDate: '2000-01-01' }, login.cookie);
  assert.equal(invalidDatedGoalWithdrawal.status, 400);
  const netWorthPath = `spaces/${spaces.body[0].id}/net-worth`;
  assert.equal((await request(netWorthPath)).status, 401);
  const netWorth = await request(netWorthPath, undefined, login.cookie);
  assert.equal(netWorth.status, 200);
  assert.equal(netWorth.body.current.find(item => item.currencyCode === 'GHS').assets, '30.25');
  assert.equal(netWorth.body.current.find(item => item.currencyCode === 'GHS').liabilities, '0');
  assert.equal(netWorth.body.current.find(item => item.currencyCode === 'GHS').netWorth, '30.25');
  const netWorthSnapshotPath = `${netWorthPath}/snapshots`;
  const netWorthSnapshot = await request(netWorthSnapshotPath, { snapshotDate: receivedDate }, login.cookie);
  assert.equal(netWorthSnapshot.status, 201);
  assert.equal(netWorthSnapshot.body.currencies.find(item => item.currencyCode === 'GHS').netWorth, '30.25');
  assert.equal((await request(netWorthSnapshotPath, { snapshotDate: receivedDate }, login.cookie)).status, 409);
  assert.equal((await request(netWorthSnapshotPath, { snapshotDate: futureDate }, login.cookie)).status, 400);
  const netWorthHistory = await request(netWorthPath, undefined, login.cookie);
  assert.equal(netWorthHistory.body.snapshots.length, 1);
  assert.equal(netWorthHistory.body.snapshots[0].snapshotDate, receivedDate);
  const investmentsPath = `spaces/${spaces.body[0].id}/investments`;
  assert.equal((await request(investmentsPath)).status, 401);
  const investmentAccount = await request(`spaces/${spaces.body[0].id}/investment-accounts`, {
    name: 'Test brokerage', provider: 'Test provider', currencyCode: 'GHS',
  }, login.cookie);
  assert.equal(investmentAccount.status, 201);
  const investment = await request(`spaces/${spaces.body[0].id}/investment-accounts/${investmentAccount.body.id}/investments`, {
    type: 'STOCK', name: 'Test shares', costBasis: '100', quantity: '10', startDate: receivedDate,
  }, login.cookie);
  assert.equal(investment.status, 201);
  assert.equal((await request(`${investmentsPath}/${investment.body.id}/valuations`, { method: 'QUANTITY_X_PRICE', valuationDate: receivedDate, unitPrice: '12' }, login.cookie)).status, 201);
  let portfolio = await request(investmentsPath, undefined, login.cookie);
  let shares = portfolio.body.accounts[0].investments.find(item => item.id === investment.body.id);
  assert.equal(shares.quantity, '10');
  assert.equal(shares.currentValue, '120.0000');
  assert.equal((await request(`${investmentsPath}/${investment.body.id}/transactions`, { type: 'SELL', amount: '24', quantity: '2', transactionDate: receivedDate }, login.cookie)).status, 201);
  assert.equal((await request(`${investmentsPath}/${investment.body.id}/transactions`, { type: 'SELL', amount: '200', quantity: '20', transactionDate: receivedDate }, login.cookie)).status, 400);
  assert.equal((await request(`${investmentsPath}/${investment.body.id}/valuations`, { method: 'MANUAL', valuationDate: receivedDate, marketValue: '97' }, login.cookie)).status, 201);
  portfolio = await request(investmentsPath, undefined, login.cookie);
  shares = portfolio.body.accounts[0].investments.find(item => item.id === investment.body.id);
  assert.equal(shares.quantity, '8');
  assert.equal(shares.currentValue, '97');
  assert.equal(shares.valuations.length, 2);
  const oneYearAgo = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const fixedDeposit = await request(`spaces/${spaces.body[0].id}/investment-accounts/${investmentAccount.body.id}/investments`, {
    type: 'FIXED_DEPOSIT', name: 'Matured test deposit', costBasis: '1000', startDate: oneYearAgo, maturityDate: receivedDate,
    annualInterestRate: '10', interestMethod: 'SIMPLE', compoundingFrequency: 1,
  }, login.cookie);
  assert.equal(fixedDeposit.status, 201);
  assert.equal(fixedDeposit.body.expectedMaturityValue, '1100');
  portfolio = await request(investmentsPath, undefined, login.cookie);
  const depositBeforePayout = portfolio.body.accounts[0].investments.find(item => item.id === fixedDeposit.body.id);
  assert.equal(depositBeforePayout.valuations.length, 2);
  assert.equal(depositBeforePayout.valuations[0].method, 'CONTRACTUAL');
  assert.equal(depositBeforePayout.valuations[0].marketValue, '1100');
  assert.equal((await request(`${investmentsPath}/${fixedDeposit.body.id}/maturity`, { actualMaturityValue: '1095', maturityDate: receivedDate }, login.cookie)).status, 201);
  portfolio = await request(investmentsPath, undefined, login.cookie);
  const maturedDeposit = portfolio.body.accounts[0].investments.find(item => item.id === fixedDeposit.body.id);
  assert.equal(maturedDeposit.status, 'CLOSED');
  assert.equal(maturedDeposit.actualMaturityValue, '1095');
  assert.equal(maturedDeposit.currentValue, '0');
  assert.equal(maturedDeposit.valuations.length, 3);
  assert.equal((await request(`${investmentsPath}/${fixedDeposit.body.id}/maturity`, { actualMaturityValue: '1095', maturityDate: receivedDate }, login.cookie)).status, 400);
  const netWorthWithInvestments = await request(netWorthPath, undefined, login.cookie);
  assert.equal(netWorthWithInvestments.body.current.find(item => item.currencyCode === 'GHS').assets, '127.25');
  const analyticsPath = `spaces/${spaces.body[0].id}/portfolio-analytics`;
  assert.equal((await request(analyticsPath)).status, 401);
  const portfolioAnalytics = await request(analyticsPath, undefined, login.cookie);
  assert.equal(portfolioAnalytics.status, 200);
  assert.equal(portfolioAnalytics.body.status, 'READY');
  assert.equal(portfolioAnalytics.body.currencies.length, 1);
  assert.equal(portfolioAnalytics.body.currencies[0].currencyCode, 'GHS');
  assert.equal(portfolioAnalytics.body.currencies[0].totalValue, 97);
  assert.equal(portfolioAnalytics.body.currencies[0].absoluteReturn, 116);
  assert.equal(portfolioAnalytics.body.currencies[0].contributions.investmentIncome, 0);
  assert.equal(portfolioAnalytics.body.currencies[0].explanations.xirr.formula.includes('bounded bisection'), true);
  const financialReviewsPath = `spaces/${spaces.body[0].id}/financial-reviews`;
  assert.equal((await request(financialReviewsPath)).status, 401);
  for (const monthOffset of [-3, -2, -1]) {
    const historicDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 15)).toISOString().slice(0, 10);
    assert.equal((await request(`${incomePath}/${selfEmployment.body.id}/records`, { amount: '100', receivedDate: historicDate }, login.cookie)).status, 201);
    assert.equal((await request(expensesPath, { categoryId: customCategory.body.id, amount: '200', spentAt: historicDate }, login.cookie)).status, 201);
  }
  const review = await request(financialReviewsPath, { trigger: 'ON_DEMAND' }, login.cookie);
  assert.equal(review.status, 201);
  assert.equal(review.body.profile.currencyCode, 'GHS');
  assert.equal(review.body.profile.monthlyIncome, 100);
  assert.equal(review.body.profile.monthlyExpenses, 200);
  assert.equal(review.body.profile.monthlyCashFlow, -100);
  assert.equal(review.body.strategies.length, 3);
  assert.equal(review.body.strategies[0].code, 'EXPENSES_EXCEED_INCOME');
  const strategy = review.body.strategies[0];
  assert.equal((await request(`${financialReviewsPath}/${review.body.id}/strategies/${strategy.id}/response`, {
    decision: 'MODIFIED',
  }, login.cookie)).status, 400);
  const strategyPlanPath = `${financialReviewsPath}/${review.body.id}/strategies/${strategy.id}/convert`;
  const strategyPlanInput = {
    name: strategy.title,
    startingCapital: '0',
    recurringContribution: '50',
    contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: '0',
    durationYears: 1,
    inflationRate: '0',
    annualContributionGrowth: '0',
  };
  assert.equal((await request(strategyPlanPath, strategyPlanInput, login.cookie)).status, 409);
  const strategyResponse = await request(`${financialReviewsPath}/${review.body.id}/strategies/${strategy.id}/response`, {
    decision: 'MODIFIED', feedback: 'HELPFUL', userNote: 'Check the records and revisit the flexible spending categories.',
  }, login.cookie);
  assert.equal(strategyResponse.status, 201);
  assert.equal(strategyResponse.body.decision, 'MODIFIED');
  assert.equal(strategyResponse.body.feedback, 'HELPFUL');
  assert.equal((await request(strategyPlanPath, {}, login.cookie)).status, 400);
  const convertedStrategyReview = await request(strategyPlanPath, strategyPlanInput, login.cookie);
  assert.equal(convertedStrategyReview.status, 201);
  const convertedStrategy = convertedStrategyReview.body.strategies.find(item => item.id === strategy.id);
  assert.equal(convertedStrategy.financialPlan.name, strategy.title);
  assert.equal(convertedStrategy.financialPlan.projectedTarget, '600');
  assert.equal(convertedStrategy.financialPlan.actualContributions, '0');
  assert.equal((await request(strategyPlanPath, strategyPlanInput, login.cookie)).status, 409);
  assert.equal((await request(`${financialReviewsPath}/${review.body.id}/strategies/${strategy.id}/response`, {
    decision: 'REJECTED',
  }, login.cookie)).status, 409);
  const monthlyReview = await request(financialReviewsPath, { trigger: 'MONTHLY' }, login.cookie);
  assert.equal(monthlyReview.status, 201);
  const duplicateMonthlyReview = await request(financialReviewsPath, { trigger: 'MONTHLY' }, login.cookie);
  assert.equal(duplicateMonthlyReview.body.id, monthlyReview.body.id);
  assert.equal((await request(financialReviewsPath, undefined, login.cookie)).body.length, 2);
  const scenariosPath = `spaces/${spaces.body[0].id}/scenarios`;
  assert.equal((await request(scenariosPath)).status, 401);
  assert.equal((await request(scenariosPath, {
    name: 'Invalid return', startingCapital: '0', recurringContribution: '100', contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: '101', durationYears: 10,
  }, login.cookie)).status, 400);
  const steadyScenario = await request(scenariosPath, {
    name: 'Steady plan', startingCapital: '1000', recurringContribution: '100', contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: '5', durationYears: 10, inflationRate: '2', annualContributionGrowth: '3',
  }, login.cookie);
  assert.equal(steadyScenario.status, 201);
  assert.equal(steadyScenario.body.currencyCode, 'GHS');
  assert.equal(steadyScenario.body.projection.length, 10);
  assert.ok(steadyScenario.body.projection[0].nominalValue > 2200);
  assert.ok(steadyScenario.body.projection[0].inflationAdjustedValue < steadyScenario.body.projection[0].nominalValue);
  const alternativeScenario = await request(scenariosPath, {
    name: 'No growth alternative', startingCapital: '0', recurringContribution: '200', contributionFrequency: 'MONTHLY',
    expectedAnnualReturn: '0', durationYears: 10,
  }, login.cookie);
  assert.equal(alternativeScenario.status, 201);
  const comparedScenarios = await request(scenariosPath, undefined, login.cookie);
  assert.equal(comparedScenarios.status, 200);
  assert.equal(comparedScenarios.body.length, 3);
  const strategyScenario = comparedScenarios.body.find(item => item.name === strategy.title);
  assert.ok(strategyScenario.financialPlan.id);
  assert.equal(strategyScenario.financialPlan.projectedTarget, convertedStrategy.financialPlan.projectedTarget);
  const convertedScenario = await request(`${scenariosPath}/${steadyScenario.body.id}/convert`, {}, login.cookie);
  assert.equal(convertedScenario.status, 201);
  assert.ok(convertedScenario.body.financialPlan.id);
  assert.equal(convertedScenario.body.financialPlan.actualContributions, '0');
  assert.equal((await request(`${scenariosPath}/${steadyScenario.body.id}/convert`, {}, login.cookie)).status, 409);
  const goalsAfterConversion = await request(goalsPath, undefined, login.cookie);
  const scenarioGoal = goalsAfterConversion.body.goals.find(item => item.id === convertedScenario.body.financialPlan.goalId);
  assert.equal(scenarioGoal.targetAmount, convertedScenario.body.financialPlan.projectedTarget);
  const paydayPath = `spaces/${spaces.body[0].id}/payday-routines`;
  assert.equal((await request(paydayPath)).status, 401);
  const routineSalary = await request(incomePath, {
    name: 'Routine salary', type: 'SALARY', expectedAmount: '1000', currencyCode: 'GHS', paydayDays: [25], adjustmentRule: 'NO_ADJUSTMENT',
  }, login.cookie);
  assert.equal(routineSalary.status, 201);
  const routineSavingsAction = await request(paydayPath, {
    sourceId: routineSalary.body.id, type: 'SAVINGS_DEPOSIT', name: 'Monthly reserve', plannedAmount: '30', targetId: savingsAccount.body.id,
  }, login.cookie);
  assert.equal(routineSavingsAction.status, 201);
  const routineGoalAction = await request(paydayPath, {
    sourceId: routineSalary.body.id, type: 'GOAL_CONTRIBUTION', name: 'Build emergency fund', plannedAmount: '200', targetId: goal.body.id,
  }, login.cookie);
  assert.equal(routineGoalAction.status, 201);
  const routineLiability = await request(liabilitiesPath, {
    type: 'PERSONAL_LOAN', name: 'Routine loan', originalAmount: '100', openingBalance: '100', startDate: receivedDate, currencyCode: 'GHS',
  }, login.cookie);
  assert.equal(routineLiability.status, 201);
  const routineDebtAction = await request(paydayPath, {
    sourceId: routineSalary.body.id, type: 'LIABILITY_PAYMENT', name: 'Pay down routine loan', plannedAmount: '50', targetId: routineLiability.body.id,
  }, login.cookie);
  assert.equal(routineDebtAction.status, 201);
  const foreignSalary = await request(incomePath, {
    name: 'Foreign salary', type: 'SALARY', expectedAmount: '1000', currencyCode: 'USD', paydayDays: [25], adjustmentRule: 'NO_ADJUSTMENT',
  }, login.cookie);
  assert.equal(foreignSalary.status, 201);
  assert.equal((await request(paydayPath, {
    sourceId: foreignSalary.body.id, type: 'SAVINGS_DEPOSIT', name: 'Wrong currency target', plannedAmount: '30', targetId: savingsAccount.body.id,
  }, login.cookie)).status, 400);
  const routineSalaryReceipt = await request(`${incomePath}/${routineSalary.body.id}/records`, {
    amount: '1000', receivedDate, periodYear: now.getUTCFullYear(), periodMonth: now.getUTCMonth() + 1,
  }, login.cookie);
  assert.equal(routineSalaryReceipt.status, 201);
  let paydayRoutines = await request(paydayPath, undefined, login.cookie);
  assert.equal(paydayRoutines.status, 200);
  assert.equal(paydayRoutines.body.actions.length, 3);
  assert.equal(paydayRoutines.body.entries.length, 3);
  const goalRoutineEntry = paydayRoutines.body.entries.find(entry => entry.type === 'GOAL_CONTRIBUTION');
  const debtRoutineEntry = paydayRoutines.body.entries.find(entry => entry.type === 'LIABILITY_PAYMENT');
  const savingsRoutineEntry = paydayRoutines.body.entries.find(entry => entry.type === 'SAVINGS_DEPOSIT');
  assert.equal(goalRoutineEntry.status, 'DUE');
  const partialGoalRoutine = await request(`${paydayPath}/${goalRoutineEntry.id}/complete`, { amount: '120', completedDate: receivedDate }, login.cookie);
  assert.equal(partialGoalRoutine.status, 201);
  assert.equal(partialGoalRoutine.body.status, 'PARTIALLY_COMPLETED');
  assert.equal(partialGoalRoutine.body.remainingAmount, '80');
  const completeGoalRoutine = await request(`${paydayPath}/${goalRoutineEntry.id}/complete`, { amount: '80', completedDate: receivedDate }, login.cookie);
  assert.equal(completeGoalRoutine.body.status, 'COMPLETED');
  const partialDebtRoutine = await request(`${paydayPath}/${debtRoutineEntry.id}/complete`, { amount: '25', principalAmount: '20', completedDate: receivedDate }, login.cookie);
  assert.equal(partialDebtRoutine.body.status, 'PARTIALLY_COMPLETED');
  const completeDebtRoutine = await request(`${paydayPath}/${debtRoutineEntry.id}/complete`, { amount: '25', completedDate: receivedDate }, login.cookie);
  assert.equal(completeDebtRoutine.body.status, 'COMPLETED');
  assert.equal((await request(`${paydayPath}/${goalRoutineEntry.id}/complete`, { amount: '1', completedDate: receivedDate }, login.cookie)).status, 400);
  assert.equal((await request(`${paydayPath}/${savingsRoutineEntry.id}/skip`, {}, login.cookie)).body.status, 'SKIPPED');
  assert.equal((await request(`${paydayPath}/${savingsRoutineEntry.id}/skip`, {}, login.cookie)).status, 400);
  assert.equal((await request(`${paydayPath}/${routineGoalAction.body.id}/status`, { isActive: false }, login.cookie)).body.isActive, false);
  assert.equal((await request(`${paydayPath}/${routineGoalAction.body.id}/status`, { isActive: true }, login.cookie)).body.isActive, true);
  paydayRoutines = await request(paydayPath, undefined, login.cookie);
  assert.equal(paydayRoutines.body.entries.find(entry => entry.id === goalRoutineEntry.id).status, 'COMPLETED');
  assert.equal(paydayRoutines.body.entries.find(entry => entry.id === savingsRoutineEntry.id).status, 'SKIPPED');
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
  assert.equal(dashboardData.body.income.total, '7850.25');
  assert.equal(dashboardData.body.income.excludedCurrencyCount, 1);
  assert.equal(dashboardData.body.expenses.total, '53.45');
  assert.equal(dashboardData.body.netCashFlow, '7796.8');
  assert.equal(dashboardData.body.expenses.byCategory[0].total, '53.45');
  assert.equal(dashboardData.body.budget.remaining, '66.55');
  await request('auth/register', { name: 'Bob', email: secondEmail, password });
  await request('auth/verify', { token: await emailToken(secondEmail, 'Verify your email') });
  const bob = await request('auth/login', { email: secondEmail, password });
  const bobNotificationPreferences = await request(notificationPreferencesPath, undefined, bob.cookie);
  assert.equal(bobNotificationPreferences.status, 200);
  assert.equal(bobNotificationPreferences.body.paydayInApp, false);
  assert.equal(bobNotificationPreferences.body.maturityEmail, false);
  assert.equal((await request(path, undefined, bob.cookie)).status, 404);
  assert.equal((await request(categoryPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(incomePath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(recurringPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(budgetsPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(savingsPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(liabilitiesPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(goalsPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(netWorthPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(paydayPath, undefined, bob.cookie)).status, 404);
  const bobSpaces = await request('spaces', undefined, bob.cookie);
  assert.equal((await request(investmentsPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(analyticsPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(financialReviewsPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(scenariosPath, undefined, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/investment-accounts/${investmentAccount.body.id}/investments`, { type: 'STOCK', name: 'Private', costBasis: '1', startDate: receivedDate }, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/savings-accounts/${savingsAccount.body.id}/transactions`, { type: 'DEPOSIT', amount: '1', transactionDate: receivedDate }, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/liabilities/${liability.body.id}/payments`, { amount: '1', paidAt: receivedDate }, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/goals/${goal.body.id}/contributions`, { type: 'CONTRIBUTION', amount: '1', contributionDate: receivedDate }, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/payday-routines/${goalRoutineEntry.id}/skip`, {}, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/expenses`, { categoryId: customCategory.body.id, amount: '3', spentAt: receivedDate }, bob.cookie)).status, 400);
  assert.equal((await request(expensesPath, undefined, bob.cookie)).status, 404);
  const household = await request('spaces', { name: 'Shared home', baseCurrency: 'GHS' }, login.cookie);
  assert.equal(household.status, 201);
  assert.equal(household.body.type, 'HOUSEHOLD');
  assert.equal(household.body.role, 'OWNER');
  const householdId = household.body.id;
  const ownerUserId = (await request('auth/me', undefined, login.cookie)).body.id;
  const householdPath = `spaces/${householdId}/household`;
  assert.equal((await request(householdPath, undefined, login.cookie)).body.members[0].role, 'OWNER');
  const householdSavingsPath = `spaces/${householdId}/savings-accounts`;
  const householdSavings = await request(householdSavingsPath, {
    name: 'Joint savings', currencyCode: 'GHS', openingBalance: '200', openedAt: receivedDate,
  }, login.cookie);
  assert.equal(householdSavings.status, 201);
  const householdLiabilitiesPath = `spaces/${householdId}/liabilities`;
  const householdLiability = await request(householdLiabilitiesPath, {
    type: 'PERSONAL_LOAN', name: 'Shared home loan', currencyCode: 'GHS',
    originalAmount: '50', openingBalance: '50', annualInterestRate: '0', startDate: receivedDate,
  }, login.cookie);
  assert.equal(householdLiability.status, 201);
  assert.equal((await request(`spaces/${spaces.body[0].id}/ownership`, undefined, login.cookie)).status, 404);
  assert.equal((await request(`spaces/${householdId}/ownership`, undefined, login.cookie)).body.allocations.length, 2);
  const householdSharedItemsPath = `spaces/${householdId}/shared-personal-items`;
  assert.deepEqual(await request(householdSharedItemsPath, undefined, login.cookie).then(result => result.body), []);
  const dependant = await request(`spaces/${householdId}/dependants`, {
    name: 'Taylor', relationship: 'Child', dateOfBirth: '2015-04-12',
  }, login.cookie);
  assert.equal(dependant.status, 201);
  assert.equal(dependant.body.dateOfBirth, '2015-04-12');
  assert.equal((await request(`spaces/${spaces.body[0].id}/goals`, {
    name: 'Cross-space dependant goal', targetAmount: '50', dependantId: dependant.body.id,
  }, login.cookie)).status, 400);
  assert.equal((await request(`spaces/${householdId}/dependants`, {
    name: 'Future date', relationship: 'Child', dateOfBirth: '2999-01-01',
  }, login.cookie)).status, 400);
  const personalSharesPath = `spaces/${spaces.body[0].id}/shares`;
  const personalShare = await request(personalSharesPath, {
    targetHouseholdSpaceId: householdId,
    entityType: 'SAVINGS_ACCOUNT',
    entityId: savingsAccount.body.id,
    permission: 'BALANCE_ONLY',
  }, login.cookie);
  assert.equal(personalShare.status, 201);
  const invitation = await request(`spaces/${householdId}/household-invitations`, {
    email: secondEmail, role: 'MEMBER',
  }, login.cookie);
  assert.equal(invitation.status, 201);
  const invitationEmail = await db.emailOutbox.findFirstOrThrow({
    where: { recipient: secondEmail, subject: { contains: 'Invitation to join Shared home' } },
    orderBy: { createdAt: 'desc' },
  });
  const invitationToken = invitationEmail.body.match(/invite=([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(invitationToken);
  assert.equal((await request('household-invitations/accept', { token: invitationToken }, login.cookie)).status, 403);
  assert.equal((await request(householdSharedItemsPath, undefined, bob.cookie)).status, 404);
  const acceptedInvitation = await request('household-invitations/accept', { token: invitationToken }, bob.cookie);
  assert.equal(acceptedInvitation.status, 201);
  assert.equal(acceptedInvitation.body.spaceId, householdId);
  const bobSpacesAfterJoin = await request('spaces', undefined, bob.cookie);
  assert.ok(bobSpacesAfterJoin.body.some(space => space.id === householdId && space.type === 'HOUSEHOLD'));
  const bobUserId = (await request('auth/me', undefined, bob.cookie)).body.id;
  assert.equal((await request(`spaces/${spaces.body[0].id}/dashboard`, undefined, bob.cookie)).status, 404);
  const memberDetails = await request(householdPath, undefined, bob.cookie);
  assert.equal(memberDetails.status, 200);
  assert.equal(memberDetails.body.role, 'MEMBER');
  assert.equal(memberDetails.body.dependants[0].name, 'Taylor');
  for (const [entityType, entityId, percentages] of [
    ['SAVINGS_ACCOUNT', householdSavings.body.id, [{ ownerUserId, percentage: '60' }, { ownerUserId: bobUserId, percentage: '40' }]],
    ['LIABILITY', householdLiability.body.id, [{ ownerUserId, percentage: '40' }, { ownerUserId: bobUserId, percentage: '60' }]],
  ]) {
    assert.equal((await request(`spaces/${householdId}/ownership`, { entityType, entityId, allocations: percentages.slice(0, 1) }, login.cookie)).status, 400);
    assert.equal((await request(`spaces/${householdId}/ownership`, { entityType, entityId, allocations: percentages }, login.cookie)).status, 201);
  }
  const householdGoalsPath = `spaces/${householdId}/goals`;
  const householdGoal = await request(householdGoalsPath, {
    name: 'Household education fund', targetAmount: '1000', currencyCode: 'GHS', targetDate: '2030-12-31',
    dependantId: dependant.body.id,
  }, bob.cookie);
  assert.equal(householdGoal.status, 201);
  assert.equal(householdGoal.body.dependant.id, dependant.body.id);
  assert.equal((await request(`${householdGoalsPath}/${householdGoal.body.id}/contributions`, {
    type: 'CONTRIBUTION', amount: '25', contributionDate: receivedDate,
  }, bob.cookie)).status, 201);
  const householdGoals = await request(householdGoalsPath, undefined, bob.cookie);
  assert.equal(householdGoals.body.goals.find(goal => goal.id === householdGoal.body.id).dependant.name, 'Taylor');
  const householdBudgetPath = `spaces/${householdId}/budgets`;
  const householdCategories = await request(`spaces/${householdId}/categories`, undefined, bob.cookie);
  const householdExpenseCategory = householdCategories.body.find(category => category.type === 'EXPENSE');
  assert.ok(householdExpenseCategory);
  const householdMonth = receivedDate.slice(0, 7);
  assert.equal((await request(`${householdBudgetPath}/allocations`, {
    month: householdMonth, categoryId: householdExpenseCategory.id, limitAmount: '300',
  }, bob.cookie)).status, 201);
  assert.equal((await request(`spaces/${householdId}/expenses`, {
    categoryId: householdExpenseCategory.id, amount: '75', spentAt: receivedDate,
  }, bob.cookie)).status, 201);
  const householdDashboard = await request(`spaces/${householdId}/dashboard?month=${householdMonth}`, undefined, login.cookie);
  assert.equal(householdDashboard.status, 200);
  assert.equal(householdDashboard.body.expenses.total, '75');
  assert.equal(householdDashboard.body.budget.remaining, '225');
  const householdNetWorth = await request(`spaces/${householdId}/net-worth`, undefined, login.cookie);
  const householdReport = await request(`spaces/${householdId}/household/report?month=${householdMonth}`, undefined, login.cookie);
  assert.equal(householdReport.status, 200);
  assert.equal(householdReport.body.monthly.income.total, '0');
  assert.equal(householdReport.body.monthly.expenses.total, '75');
  assert.equal(householdReport.body.monthly.budget.remaining, '225');
  assert.equal(householdReport.body.netWorth.current.find(item => item.currencyCode === 'GHS').netWorth, '150');
  const dependantGoalSummary = householdReport.body.goalsByDependant.find(item => item.dependant?.id === dependant.body.id);
  assert.equal(dependantGoalSummary.goalCount, 1);
  assert.equal(dependantGoalSummary.currencies[0].currentAmount, '25');
  assert.equal((await request(`spaces/${spaces.body[0].id}/household/report`, undefined, login.cookie)).status, 404);
  assert.equal(householdNetWorth.status, 200);
  assert.equal(householdNetWorth.body.current.find(item => item.currencyCode === 'GHS').netWorth, '150');
  const ownerHouseholdShare = householdNetWorth.body.ownership.memberShares.find(item => item.owner.id === ownerUserId);
  const bobHouseholdShare = householdNetWorth.body.ownership.memberShares.find(item => item.owner.id === bobUserId);
  assert.equal(ownerHouseholdShare.currencies[0].assets, '120');
  assert.equal(ownerHouseholdShare.currencies[0].liabilities, '20');
  assert.equal(ownerHouseholdShare.currencies[0].netWorth, '100');
  assert.equal(bobHouseholdShare.currencies[0].assets, '80');
  assert.equal(bobHouseholdShare.currencies[0].liabilities, '30');
  assert.equal(bobHouseholdShare.currencies[0].netWorth, '50');
  assert.equal((await request(`spaces/${householdId}/household-invitations`, { email: 'outsider@example.com', role: 'MEMBER' }, bob.cookie)).status, 403);
  assert.equal((await request(`spaces/${householdId}/dependants`, { name: 'Unauthorized', relationship: 'Child' }, bob.cookie)).status, 403);
  const householdSharedItems = await request(householdSharedItemsPath, undefined, bob.cookie);
  assert.equal(householdSharedItems.status, 200);
  assert.equal(householdSharedItems.body.length, 1);
  assert.equal(householdSharedItems.body[0].entityType, 'SAVINGS_ACCOUNT');
  assert.equal(householdSharedItems.body[0].balance, '30.25');
  assert.equal(householdSharedItems.body[0].name, undefined);
  assert.equal(householdSharedItems.body[0].transactions, undefined);
  const bobPersonalSavings = await request(`spaces/${bobSpaces.body[0].id}/savings-accounts`, {
    name: 'Bob private savings', currencyCode: 'GHS', openingBalance: '75', openedAt: receivedDate,
  }, bob.cookie);
  assert.equal(bobPersonalSavings.status, 201);
  const bobShare = await request(`spaces/${bobSpaces.body[0].id}/shares`, {
    targetHouseholdSpaceId: householdId,
    entityType: 'SAVINGS_ACCOUNT',
    entityId: bobPersonalSavings.body.id,
    permission: 'SUMMARY',
  }, bob.cookie);
  assert.equal(bobShare.status, 201);
  assert.ok((await request(householdSharedItemsPath, undefined, login.cookie)).body.some(item => item.name === 'Bob private savings'));
  const householdMembers = memberDetails.body.members;
  const memberToUpdate = householdMembers.find(member => member.email === secondEmail);
  assert.ok(memberToUpdate);
  assert.equal((await request(`${householdPath.replace('/household', '')}/household-members/${memberToUpdate.id}/role`, { role: 'VIEWER' }, login.cookie)).status, 201);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/shares`, undefined, login.cookie)).status, 404);
  const viewerShareAttempt = await request(`spaces/${bobSpaces.body[0].id}/shares`, {
    targetHouseholdSpaceId: householdId,
    entityType: 'SAVINGS_ACCOUNT',
    entityId: bobPersonalSavings.body.id,
    permission: 'SUMMARY',
  }, bob.cookie);
  assert.equal(viewerShareAttempt.status, 403);
  assert.equal((await request(`spaces/${householdId}/ownership`, {
    entityType: 'SAVINGS_ACCOUNT',
    entityId: householdSavings.body.id,
    allocations: [{ ownerUserId, percentage: '60' }, { ownerUserId: bobUserId, percentage: '40' }],
  }, bob.cookie)).status, 403);
  assert.equal((await request(`${householdPath.replace('/household', '')}/household-members/${memberToUpdate.id}/role`, { role: 'MEMBER' }, login.cookie)).status, 201);
  assert.equal((await request(`spaces/${spaces.body[0].id}/shares/${personalShare.body.id}/revoke`, {}, login.cookie)).status, 201);
  assert.equal((await request(`spaces/${bobSpaces.body[0].id}/shares/${bobShare.body.id}/revoke`, {}, bob.cookie)).status, 201);
  assert.deepEqual((await request(householdSharedItemsPath, undefined, bob.cookie)).body, []);
  assert.equal((await request(`spaces/${householdId}/dependants/${dependant.body.id}/remove`, {}, login.cookie)).status, 201);
  const goalAfterDependantRemoval = await request(householdGoalsPath, undefined, login.cookie);
  assert.equal(goalAfterDependantRemoval.body.goals.find(goal => goal.id === householdGoal.body.id).dependant, null);
  assert.equal((await request(`${householdPath.replace('/household', '')}/household-members/${memberToUpdate.id}/remove`, {}, login.cookie)).status, 201);
  const householdAfterBobLeaves = await request(`spaces/${householdId}/net-worth`, undefined, login.cookie);
  const formerBobShare = householdAfterBobLeaves.body.ownership.memberShares.find(item => item.owner.id === bobUserId);
  assert.equal(householdAfterBobLeaves.body.current.find(item => item.currencyCode === 'GHS').netWorth, '150');
  assert.equal(formerBobShare.owner.isCurrentMember, false);
  assert.equal(formerBobShare.currencies[0].netWorth, '50');
  assert.equal((await request(`spaces/${householdId}/household/report`, undefined, bob.cookie)).status, 404);
  assert.equal((await request(`spaces/${householdId}/ownership`, {
    entityType: 'SAVINGS_ACCOUNT',
    entityId: householdSavings.body.id,
    allocations: [{ ownerUserId, percentage: '100' }],
  }, login.cookie)).status, 409);
  assert.equal((await request(householdPath, undefined, bob.cookie)).status, 404);
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
