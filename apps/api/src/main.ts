import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Controller, Module, Get, Post, Body, Req, Res, Param, Query, Injectable, Inject, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException, ConflictException, ServiceUnavailableException, Catch, HttpException } from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Request, RequestHandler, Response } from 'express';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createDatabase, Prisma } from '@pf/database';
import { hashPassword, verifyPassword, newToken, hashToken, mayAccessPersonalSpace } from './security.js';
import { DEFAULT_CATEGORIES, normalizeCategoryName } from './categories.js';
import { expectedPaydayDates, salaryPeriodStatus } from './income.js';
import { nextRecurringDate } from './recurring.js';
import { calculateFixedDepositValue, calculateInvestmentQuantity, validateInvestmentQuantityHistory } from './investment.js';
import { calculatePortfolioAnalytics } from './portfolio-analytics.js';
import { calculateScenarioProjection, type ContributionFrequency } from './scenario-planning.js';
import { evaluateFinancialRules, isFinancialRuleMetric, type FinancialProfile } from './financial-insights.js';
import { addDecimals, decimalToUnits, subtractDecimals, unitsToDecimal } from './money.js';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const helmetExport: unknown = createRequire(import.meta.url)('helmet');
if (typeof helmetExport !== 'function') throw new TypeError('Helmet CommonJS export is not a middleware factory');
const helmet = helmetExport as () => RequestHandler;
const origin = required('WEB_ORIGIN');
const production = process.env.NODE_ENV === 'production';
if (production && !origin.startsWith('https://')) throw new Error('Production WEB_ORIGIN requires HTTPS');
const db = createDatabase(required('DATABASE_URL'));
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(12).max(128);
const amount = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/).refine(value => Number(value) > 0, 'Amount must be greater than zero.');
const financialRuleAdminEmails = new Set((process.env.FINANCIAL_RULE_ADMIN_EMAILS ?? '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean));
const isFinancialRuleAdmin = (user: { email: string }) => financialRuleAdminEmails.has(user.email.toLowerCase());
const notificationPreferenceInput = z.object({
  paydayInApp: z.boolean(),
  paydayEmail: z.boolean(),
  maturityInApp: z.boolean(),
  maturityEmail: z.boolean(),
  monthlyReviewInApp: z.boolean(),
  monthlyReviewEmail: z.boolean(),
}).strict();
const householdSpaceInput = z.object({
  name: z.string().trim().min(1).max(100),
  baseCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('GHS'),
}).strict();
const householdInvitationInput = z.object({
  email,
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
}).strict();
const householdInvitationTokenInput = z.object({ token: z.string().min(40).max(100) }).strict();
const householdMemberRoleInput = z.object({ role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']) }).strict();
const sharedFinancialItemInput = z.object({
  targetHouseholdSpaceId: z.string().uuid(),
  entityType: z.enum(['SAVINGS_ACCOUNT', 'INVESTMENT', 'LIABILITY', 'GOAL']),
  entityId: z.string().uuid(),
  permission: z.enum(['BALANCE_ONLY', 'SUMMARY', 'FULL_READ']),
}).strict();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.');
const dependantInput = z.object({
  name: z.string().trim().min(1).max(100),
  relationship: z.string().trim().min(1).max(60),
  dateOfBirth: dateOnly.optional(),
}).strict();
const householdOwnershipInput = z.object({
  entityType: z.enum(['SAVINGS_ACCOUNT', 'INVESTMENT', 'LIABILITY']),
  entityId: z.string().uuid(),
  allocations: z.array(z.object({
    ownerUserId: z.string().uuid(),
    percentage: z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/)
      .refine(value => new Prisma.Decimal(value).greaterThan(0) && new Prisma.Decimal(value).lessThanOrEqualTo(100)),
  }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  const owners = input.allocations.map(allocation => allocation.ownerUserId);
  if (new Set(owners).size !== owners.length) {
    context.addIssue({ code: 'custom', path: ['allocations'], message: 'Each owner can only be listed once.' });
  }
  const total = input.allocations.reduce((sum, allocation) => sum.plus(allocation.percentage), new Prisma.Decimal(0));
  if (!total.equals(100)) {
    context.addIssue({ code: 'custom', path: ['allocations'], message: 'Ownership percentages must total exactly 100%.' });
  }
});
const incomeSourceInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['SALARY', 'SELF_EMPLOYMENT', 'BUSINESS', 'INVESTMENT', 'GIFT', 'OTHER']),
  expectedAmount: amount.optional(),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('GHS'),
  paydayDays: z.array(z.number().int().min(1).max(31)).max(10).default([]),
  adjustmentRule: z.enum(['PREVIOUS_WORKING_DAY', 'NEXT_WORKING_DAY', 'NO_ADJUSTMENT']).default('NO_ADJUSTMENT'),
}).strict().superRefine((input, context) => {
  if (input.type === 'SALARY') {
    if (!input.expectedAmount) context.addIssue({ code: 'custom', path: ['expectedAmount'], message: 'Enter the expected salary amount.' });
    if (!input.paydayDays.length) context.addIssue({ code: 'custom', path: ['paydayDays'], message: 'Add at least one possible payday.' });
  } else if (input.paydayDays.length) {
    context.addIssue({ code: 'custom', path: ['paydayDays'], message: 'Payday dates are only available for salary sources.' });
  }
  if (new Set(input.paydayDays).size !== input.paydayDays.length) {
    context.addIssue({ code: 'custom', path: ['paydayDays'], message: 'Possible payday dates must be unique.' });
  }
});
const incomeRecordInput = z.object({
  amount,
  receivedDate: dateOnly,
  periodYear: z.number().int().min(2000).max(9999).optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
}).strict().superRefine((input, context) => {
  if ((input.periodYear === undefined) !== (input.periodMonth === undefined)) {
    context.addIssue({ code: 'custom', path: ['periodMonth'], message: 'Salary period year and month must be supplied together.' });
  }
});
const expenseInput = z.object({
  categoryId: z.string().uuid(),
  amount,
  spentAt: dateOnly,
  description: z.string().trim().max(240).optional().transform(value => value || undefined),
}).strict();
const savingsAccountInput = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().max(100).optional().transform(value => value || undefined),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  openingBalance: z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/).default('0'),
  openedAt: dateOnly.optional(),
}).strict();
const savingsTransactionInput = z.object({
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  amount,
  transactionDate: dateOnly,
  description: z.string().trim().max(240).optional().transform(value => value || undefined),
}).strict();
const nonNegativeAmount = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/);
const interestRate = z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/).refine(value => decimalToUnits(value) <= 1_000_000n, 'Annual interest rate cannot exceed 100%.');
const liabilityInput = z.object({
  type: z.enum(['CREDIT_CARD', 'PERSONAL_LOAN', 'MORTGAGE', 'STUDENT_LOAN', 'AUTO_LOAN', 'BUY_NOW_PAY_LATER', 'OTHER']),
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().max(100).optional().transform(value => value || undefined),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  originalAmount: amount,
  openingBalance: nonNegativeAmount,
  annualInterestRate: interestRate.default('0'),
  monthlyPayment: amount.optional(),
  startDate: dateOnly,
  expectedPayoffDate: dateOnly.optional(),
}).strict().superRefine((input, context) => {
  if (input.expectedPayoffDate && input.expectedPayoffDate < input.startDate) {
    context.addIssue({ code: 'custom', path: ['expectedPayoffDate'], message: 'Expected payoff date must be on or after the debt start date.' });
  }
});
const liabilityPaymentInput = z.object({
  amount,
  principalAmount: nonNegativeAmount.optional(),
  paidAt: dateOnly,
  description: z.string().trim().max(240).optional().transform(value => value || undefined),
}).strict();
const financialGoalInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().transform(value => value || undefined),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  targetAmount: amount,
  targetDate: dateOnly.optional(),
  dependantId: z.string().uuid().optional(),
}).strict();
const goalContributionInput = z.object({
  type: z.enum(['CONTRIBUTION', 'WITHDRAWAL']),
  amount,
  contributionDate: dateOnly,
  description: z.string().trim().max(240).optional().transform(value => value || undefined),
}).strict();
const snapshotInput = z.object({ snapshotDate: dateOnly.optional() }).strict();
const financialReviewInput = z.object({ trigger: z.enum(['MONTHLY', 'ON_DEMAND']).default('ON_DEMAND') }).strict();
const strategyResponseInput = z.object({
  decision: z.enum(['SELECTED', 'MODIFIED', 'REJECTED']).optional(),
  feedback: z.enum(['HELPFUL', 'NOT_HELPFUL', 'NOT_APPLICABLE']).optional(),
  userNote: z.string().trim().max(500).optional(),
}).strict().superRefine((input, context) => {
  if (!input.decision && !input.feedback) context.addIssue({ code: 'custom', message: 'Choose a decision or provide feedback.' });
  if (input.decision === 'MODIFIED' && !input.userNote) context.addIssue({ code: 'custom', path: ['userNote'], message: 'Describe your modified strategy.' });
});
const financialRuleThreshold = z.string().regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/);
const financialRuleUpdateInput = z.object({
  enabled: z.boolean(),
  threshold: financialRuleThreshold,
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
}).strict().superRefine((input, context) => {
  const threshold = Number(input.threshold);
  if (!Number.isFinite(threshold)) context.addIssue({ code: 'custom', path: ['threshold'], message: 'Enter a valid threshold.' });
});
const scenarioRate = z.string().regex(/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/);
const scenarioInput = z.object({
  name: z.string().trim().min(1).max(100),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  startingCapital: nonNegativeAmount,
  recurringContribution: amount,
  contributionFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY']),
  expectedAnnualReturn: scenarioRate,
  durationYears: z.number().int().min(1).max(50),
  inflationRate: scenarioRate.default('0'),
  annualContributionGrowth: scenarioRate.default('0'),
}).strict().superRefine((input, context) => {
  if (Number(input.expectedAnnualReturn) < -100 || Number(input.expectedAnnualReturn) > 100) {
    context.addIssue({ code: 'custom', path: ['expectedAnnualReturn'], message: 'Expected annual return must be between -100% and 100%.' });
  }
  if (Number(input.inflationRate) < 0 || Number(input.inflationRate) > 100) {
    context.addIssue({ code: 'custom', path: ['inflationRate'], message: 'Inflation must be between 0% and 100%.' });
  }
  if (Number(input.annualContributionGrowth) < -100 || Number(input.annualContributionGrowth) > 100) {
    context.addIssue({ code: 'custom', path: ['annualContributionGrowth'], message: 'Contribution growth must be between -100% and 100%.' });
  }
});
const strategyPlanInput = scenarioInput.omit({ currencyCode: true });
const paydayRoutineActionInput = z.object({
  sourceId: z.string().uuid(),
  type: z.enum(['SAVINGS_DEPOSIT', 'GOAL_CONTRIBUTION', 'LIABILITY_PAYMENT']),
  name: z.string().trim().min(1).max(100),
  plannedAmount: amount,
  targetId: z.string().uuid(),
}).strict();
const paydayRoutineCompletionInput = z.object({
  amount,
  completedDate: dateOnly,
  principalAmount: nonNegativeAmount.optional(),
  description: z.string().trim().max(240).optional().transform(value => value || undefined),
}).strict();
const quantity = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/).refine(value => new Prisma.Decimal(value).greaterThan(0), 'Quantity must be greater than zero.');
const unitPrice = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,8})?$/).refine(value => new Prisma.Decimal(value).greaterThan(0), 'Unit price must be greater than zero.');
const investmentAccountInput = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().max(100).optional().transform(value => value || undefined),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
}).strict();
const investmentInput = z.object({
  type: z.enum(['STOCK', 'BOND', 'TREASURY_BILL', 'MUTUAL_FUND', 'ETF', 'FIXED_INCOME', 'REAL_ESTATE', 'BUSINESS_INVESTMENT', 'CRYPTOCURRENCY', 'FIXED_DEPOSIT', 'OTHER']),
  name: z.string().trim().min(1).max(100),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  costBasis: nonNegativeAmount.default('0'),
  quantity: quantity.optional(),
  startDate: dateOnly,
  maturityDate: dateOnly.optional(),
  annualInterestRate: interestRate.optional(),
  interestMethod: z.enum(['SIMPLE', 'COMPOUND']).optional(),
  compoundingFrequency: z.number().int().refine(value => [1, 2, 4, 12, 365].includes(value)).optional(),
}).strict().superRefine((input, context) => {
  if (input.maturityDate && input.maturityDate < input.startDate) {
    context.addIssue({ code: 'custom', path: ['maturityDate'], message: 'Maturity date must be on or after the investment start date.' });
  }
  if (input.type === 'FIXED_DEPOSIT') {
    if (input.quantity) context.addIssue({ code: 'custom', path: ['quantity'], message: 'Fixed deposits do not have tradable units.' });
    if (decimalToUnits(input.costBasis) <= 0n) context.addIssue({ code: 'custom', path: ['costBasis'], message: 'Enter the fixed-deposit principal.' });
    if (!input.maturityDate) context.addIssue({ code: 'custom', path: ['maturityDate'], message: 'Enter the fixed-deposit maturity date.' });
    if (!input.annualInterestRate) context.addIssue({ code: 'custom', path: ['annualInterestRate'], message: 'Enter the annual interest rate.' });
    if (!input.interestMethod) context.addIssue({ code: 'custom', path: ['interestMethod'], message: 'Choose an interest method.' });
    if (!input.compoundingFrequency) context.addIssue({ code: 'custom', path: ['compoundingFrequency'], message: 'Choose a compounding frequency.' });
  } else if (input.annualInterestRate !== undefined || input.interestMethod !== undefined || input.compoundingFrequency !== undefined) {
    context.addIssue({ code: 'custom', path: ['type'], message: 'Fixed-deposit interest terms are only available for fixed deposits.' });
  }
});
const investmentTransactionInput = z.object({
  type: z.enum(['BUY', 'CONTRIBUTION', 'SELL', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST', 'FEE', 'TAX']),
  amount,
  quantity: quantity.optional(),
  transactionDate: dateOnly,
  description: z.string().trim().max(240).optional().transform(value => value || undefined),
}).strict().superRefine((input, context) => {
  if (['BUY', 'SELL'].includes(input.type) && !input.quantity) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'Enter units bought or sold.' });
  }
  if (input.quantity && !['BUY', 'SELL', 'CONTRIBUTION', 'WITHDRAWAL'].includes(input.type)) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'Units are only available for buys, sells, contributions, and withdrawals.' });
  }
});
const investmentValuationInput = z.object({
  method: z.enum(['MANUAL', 'QUANTITY_X_PRICE']),
  valuationDate: dateOnly,
  marketValue: nonNegativeAmount.optional(),
  unitPrice: unitPrice.optional(),
}).strict().superRefine((input, context) => {
  if (input.method === 'MANUAL' && (input.marketValue === undefined || input.unitPrice !== undefined)) {
    context.addIssue({ code: 'custom', path: ['marketValue'], message: 'Enter a manual market value only.' });
  }
  if (input.method === 'QUANTITY_X_PRICE' && (input.unitPrice === undefined || input.marketValue !== undefined)) {
    context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Enter a unit price only.' });
  }
});
const investmentMaturityInput = z.object({
  actualMaturityValue: amount,
  maturityDate: dateOnly,
}).strict();
const recurringInput = z.object({
  name: z.string().trim().min(1).max(100),
  flow: z.enum(['INCOME', 'EXPENSE']),
  amount,
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY']),
  startDate: dateOnly,
  endDate: dateOnly.optional(),
  categoryId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
}).strict().superRefine((input, context) => {
  if (input.endDate && input.endDate < input.startDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date.' });
  if (input.flow === 'EXPENSE' && (!input.categoryId || input.sourceId)) context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose an expense category only for recurring expenses.' });
  if (input.flow === 'INCOME' && (!input.sourceId || input.categoryId)) context.addIssue({ code: 'custom', path: ['sourceId'], message: 'Choose an income source only for recurring income.' });
});
const monthPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
function monthParts(month: string) {
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
}
function monthBounds(month: string) {
  const { year, month: monthNumber } = monthParts(month);
  return { from: new Date(Date.UTC(year, monthNumber - 1, 1)), until: new Date(Date.UTC(year, monthNumber, 1)) };
}
function currentMonth() { return toDateOnly(new Date()).slice(0, 7); }
function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Please check the supplied fields.');
  return result.data;
}
const safeUser = (u: { id: string; name: string; email: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  canManageFinancialRules: isFinancialRuleAdmin(u),
});
const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
type InvestmentWithHistory = Prisma.InvestmentGetPayload<{ include: { transactions: true; valuations: true } }>;
function investmentValueAt(investment: InvestmentWithHistory, asOfDate: Date) {
  if (investment.startDate > asOfDate) return null;
  if (investment.closedAt && investment.closedAt <= asOfDate) return '0';
  if (investment.type === 'FIXED_DEPOSIT') {
    if (!investment.maturityDate || !investment.annualInterestRate || !investment.interestMethod || !investment.compoundingFrequency) {
      throw new Error(`Fixed-deposit terms are incomplete for investment ${investment.id}.`);
    }
    return calculateFixedDepositValue({
      principal: investment.costBasis.toString(),
      annualInterestRate: investment.annualInterestRate.toString(),
      interestMethod: investment.interestMethod,
      compoundingFrequency: investment.compoundingFrequency,
      startDate: investment.startDate,
      maturityDate: investment.maturityDate,
      valuationDate: asOfDate,
    });
  }
  const valuation = investment.valuations
    .filter(item => item.valuationDate <= asOfDate)
    .sort((left, right) => right.valuationDate.getTime() - left.valuationDate.getTime() || right.createdAt.getTime() - left.createdAt.getTime())[0];
  if (!valuation) return null;
  if (valuation.method === 'QUANTITY_X_PRICE') {
    if (!valuation.unitPrice) throw new Error(`Unit-price valuation ${valuation.id} is missing its price.`);
    const held = calculateInvestmentQuantity(investment.transactions, asOfDate);
    return held.mul(valuation.unitPrice).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
  }
  return valuation.marketValue.toString();
}
async function calculateNetWorth(spaceId: string, snapshotDate: Date, baseCurrency: string) {
  const [accounts, liabilities, investments] = await Promise.all([
    db.savingsAccount.findMany({
      where: { spaceId, openedAt: { lte: snapshotDate } },
      include: { transactions: { where: { transactionDate: { lte: snapshotDate } } } },
    }),
    db.liability.findMany({
      where: { spaceId, startDate: { lte: snapshotDate } },
      include: { payments: { where: { paidAt: { lte: snapshotDate } } } },
    }),
    db.investment.findMany({
      where: { account: { spaceId }, startDate: { lte: snapshotDate } },
      include: {
        transactions: { where: { transactionDate: { lte: snapshotDate } } },
        valuations: { where: { valuationDate: { lte: snapshotDate } } },
      },
    }),
  ]);
  const totals = new Map<string, { assets: string; liabilities: string }>();
  const forCurrency = (currencyCode: string) => {
    const currency = currencyCode.trim();
    let totalsForCurrency = totals.get(currency);
    if (!totalsForCurrency) {
      totalsForCurrency = { assets: '0', liabilities: '0' };
      totals.set(currency, totalsForCurrency);
    }
    return totalsForCurrency;
  };
  forCurrency(baseCurrency);
  for (const account of accounts) {
    const currency = forCurrency(account.currencyCode);
    const deposits = account.transactions.filter(item => item.type === 'DEPOSIT').map(item => item.amount.toString());
    const withdrawals = account.transactions.filter(item => item.type === 'WITHDRAWAL').map(item => item.amount.toString());
    currency.assets = addDecimals(currency.assets, account.openingBalance.toString(), ...deposits);
    currency.assets = subtractDecimals(currency.assets, addDecimals(...withdrawals));
  }
  for (const liability of liabilities) {
    const currency = forCurrency(liability.currencyCode);
    const principalPaid = addDecimals(...liability.payments.map(payment => payment.principalAmount.toString()));
    const outstanding = subtractDecimals(liability.openingBalance.toString(), principalPaid);
    currency.liabilities = addDecimals(currency.liabilities, outstanding);
  }
  for (const investment of investments) {
    const value = investmentValueAt(investment, snapshotDate);
    if (value !== null) {
      const currency = forCurrency(investment.currencyCode);
      currency.assets = addDecimals(currency.assets, value);
    }
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, totalsForCurrency]) => ({
    currencyCode,
    assets: totalsForCurrency.assets,
    liabilities: totalsForCurrency.liabilities,
    netWorth: subtractDecimals(totalsForCurrency.assets, totalsForCurrency.liabilities),
  }));
}
function setSession(res: Response, token: string) {
  res.cookie('pf_session', token, { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 86400000 });
}
async function queueEmail(tx: Prisma.TransactionClient, recipient: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', userId: string) {
  const token = newToken();
  await tx.authToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  const path = purpose === 'VERIFY_EMAIL' ? 'verify' : 'reset';
  await tx.emailOutbox.create({ data: { recipient, subject: purpose === 'VERIFY_EMAIL' ? 'Verify your email' : 'Reset your password', body: `Open this link within one hour: ${origin}/${path}#token=${token}` } });
}

type ScenarioRecord = Prisma.ScenarioGetPayload<{
  include: { financialPlan: { include: { goal: { include: { contributions: true } } } } };
}>;
function scenarioResponse(scenario: ScenarioRecord) {
  const projection = calculateScenarioProjection({
    startingCapital: Number(scenario.startingCapital),
    recurringContribution: Number(scenario.recurringContribution),
    contributionFrequency: scenario.contributionFrequency as ContributionFrequency,
    expectedAnnualReturn: Number(scenario.expectedAnnualReturn),
    durationYears: scenario.durationYears,
    inflationRate: Number(scenario.inflationRate),
    annualContributionGrowth: Number(scenario.annualContributionGrowth),
  });
  const plan = scenario.financialPlan;
  return {
    id: scenario.id,
    name: scenario.name,
    currencyCode: scenario.currencyCode.trim(),
    startingCapital: scenario.startingCapital.toString(),
    recurringContribution: scenario.recurringContribution.toString(),
    contributionFrequency: scenario.contributionFrequency,
    expectedAnnualReturn: scenario.expectedAnnualReturn.toString(),
    durationYears: scenario.durationYears,
    inflationRate: scenario.inflationRate.toString(),
    annualContributionGrowth: scenario.annualContributionGrowth.toString(),
    createdAt: scenario.createdAt.toISOString(),
    projection,
    financialPlan: plan ? {
      id: plan.id,
      goalId: plan.goalId,
      projectedTarget: plan.projectedTarget.toString(),
      actualContributions: subtractDecimals(
        addDecimals(...plan.goal.contributions.filter(contribution => contribution.type === 'CONTRIBUTION').map(contribution => contribution.amount.toString())),
        addDecimals(...plan.goal.contributions.filter(contribution => contribution.type === 'WITHDRAWAL').map(contribution => contribution.amount.toString())),
      ),
    } : null,
  };
}

function addYearsToDate(date: Date, years: number) {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const dayOfMonth = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, dayOfMonth));
}

async function createPlanFromScenario(
  tx: Prisma.TransactionClient,
  scenario: Prisma.ScenarioGetPayload<{}>,
  userId: string,
  recommendationStrategyId?: string,
  goalDescription = 'Scenario projection target; actual results may differ and investment returns are not guaranteed.',
) {
  const projection = calculateScenarioProjection({
    startingCapital: Number(scenario.startingCapital),
    recurringContribution: Number(scenario.recurringContribution),
    contributionFrequency: scenario.contributionFrequency as ContributionFrequency,
    expectedAnnualReturn: Number(scenario.expectedAnnualReturn),
    durationYears: scenario.durationYears,
    inflationRate: Number(scenario.inflationRate),
    annualContributionGrowth: Number(scenario.annualContributionGrowth),
  });
  const finalProjection = projection.at(-1);
  if (!finalProjection || finalProjection.nominalValue <= 0 || finalProjection.nominalValue > 999_999_999_999_999) {
    throw new BadRequestException('The projected target is outside the supported goal amount range.');
  }
  const targetDate = addYearsToDate(new Date(`${toDateOnly(new Date())}T00:00:00.000Z`), scenario.durationYears);
  const goal = await tx.financialGoal.create({
    data: {
      spaceId: scenario.spaceId,
      name: scenario.name,
      description: goalDescription,
      currencyCode: scenario.currencyCode,
      targetAmount: finalProjection.nominalValue.toFixed(4),
      targetDate,
      createdBy: userId,
    },
  });
  return tx.financialPlan.create({
    data: {
      spaceId: scenario.spaceId,
      scenarioId: scenario.id,
      goalId: goal.id,
      recommendationStrategyId,
      name: scenario.name,
      currencyCode: scenario.currencyCode,
      startingCapital: scenario.startingCapital,
      recurringContribution: scenario.recurringContribution,
      contributionFrequency: scenario.contributionFrequency,
      expectedAnnualReturn: scenario.expectedAnnualReturn,
      durationYears: scenario.durationYears,
      inflationRate: scenario.inflationRate,
      annualContributionGrowth: scenario.annualContributionGrowth,
      projectedTarget: finalProjection.nominalValue.toFixed(4),
      createdBy: userId,
    },
  });
}

const financialReviewInclude = {
  strategies: {
    orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    include: { financialPlan: { include: { goal: { include: { contributions: true } } } } },
  },
} satisfies Prisma.FinancialProfileSnapshotInclude;
type FinancialReviewRecord = Prisma.FinancialProfileSnapshotGetPayload<{ include: typeof financialReviewInclude }>;
function financialReviewResponse(snapshot: FinancialReviewRecord) {
  return {
    id: snapshot.id,
    trigger: snapshot.trigger,
    monthlyPeriod: snapshot.monthlyPeriod,
    currencyCode: snapshot.currencyCode.trim(),
    periodStart: toDateOnly(snapshot.periodStart),
    periodEnd: toDateOnly(snapshot.periodEnd),
    createdAt: snapshot.createdAt.toISOString(),
    profile: snapshot.profile,
    strategies: snapshot.strategies.map(strategy => ({
      id: strategy.id,
      code: strategy.ruleCode,
      severity: strategy.severity,
      title: strategy.title,
      explanation: strategy.explanation,
      observedValue: strategy.observedValue.toString(),
      threshold: strategy.threshold.toString(),
      decision: strategy.decision,
      feedback: strategy.feedback,
      userNote: strategy.userNote,
      respondedAt: strategy.respondedAt?.toISOString() ?? null,
      financialPlan: strategy.financialPlan ? {
        id: strategy.financialPlan.id,
        name: strategy.financialPlan.name,
        goalId: strategy.financialPlan.goalId,
        projectedTarget: strategy.financialPlan.projectedTarget.toString(),
        actualContributions: subtractDecimals(
          addDecimals(...strategy.financialPlan.goal.contributions.filter(contribution => contribution.type === 'CONTRIBUTION').map(contribution => contribution.amount.toString())),
          addDecimals(...strategy.financialPlan.goal.contributions.filter(contribution => contribution.type === 'WITHDRAWAL').map(contribution => contribution.amount.toString())),
        ),
      } : null,
    })),
  };
}

@Injectable()
class Identity {
  async user(req: Request) {
    const token = req.cookies?.pf_session;
    if (typeof token !== 'string') throw new UnauthorizedException();
    const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || !session.user.emailVerifiedAt) throw new UnauthorizedException();
    return session.user;
  }
}
@Controller()
class Api {
  constructor(@Inject(Identity) private readonly identity: Identity) {}
  @Get('health/live') live() { return { status: 'ok' }; }
  @Get('health/ready') async ready() {
    try { await db.$queryRaw`SELECT 1`; return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
  }
  @Post('auth/register') async register(@Body() body: unknown) {
    const input = validate(z.object({ email, password, name: z.string().trim().min(1).max(100) }).strict(), body);
    const passwordHash = await hashPassword(input.password);
    try {
      await db.$transaction(async tx => {
        const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash } });
        const space = await tx.financialSpace.create({ data: { name: 'My Personal Space', type: 'PERSONAL', personalOwnerId: user.id, memberships: { create: { userId: user.id, role: 'OWNER' } } } });
        await tx.category.createMany({ data: DEFAULT_CATEGORIES.map(category => ({ ...category, normalizedName: normalizeCategoryName(category.name), spaceId: space.id, isSystem: true })) });
        await queueEmail(tx, user.email, 'VERIFY_EMAIL', user.id);
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: space.id, action: 'REGISTER' } });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
    return { message: 'If this address can be registered, a verification email will arrive shortly.' };
  }
  @Post('auth/verify') async verify(@Body() body: unknown) {
    const { token } = validate(z.object({ token: z.string().min(40).max(100) }).strict(), body);
    await this.consume(token, 'VERIFY_EMAIL');
    return { message: 'Email verified. You can now sign in.' };
  }
  private async consume(token: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', passwordHash?: string) {
    await db.$transaction(async tx => {
      const record = await tx.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!record || record.purpose !== purpose || record.expiresAt <= new Date()) throw new BadRequestException('Link is invalid or expired.');
      const removed = await tx.authToken.deleteMany({ where: { id: record.id } });
      if (removed.count !== 1) throw new BadRequestException('Link has already been used.');
      await tx.user.update({ where: { id: record.userId }, data: purpose === 'VERIFY_EMAIL' ? { emailVerifiedAt: new Date() } : { passwordHash } });
      if (purpose === 'RESET_PASSWORD') {
        await tx.session.deleteMany({ where: { userId: record.userId } });
        await tx.authToken.deleteMany({ where: { userId: record.userId, purpose } });
      }
      await tx.auditEvent.create({ data: { actorUserId: record.userId, action: purpose === 'VERIFY_EMAIL' ? 'EMAIL_VERIFIED' : 'PASSWORD_CHANGE' } });
    });
  }
  @Post('auth/login') async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = validate(z.object({ email, password: z.string().min(1).max(128) }).strict(), body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    const fallback = await dummyHash;
    const matches = await verifyPassword(input.password, user?.passwordHash ?? fallback);
    if (!user || !matches || !user.emailVerifiedAt) throw new UnauthorizedException('Check your credentials and verify your email before signing in.');
    const token = newToken();
    await db.$transaction(async tx => {
      await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: 'LOGIN' } });
    });
    setSession(res, token);
    return safeUser(user);
  }
  @Post('auth/logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.identity.user(req);
    await db.$transaction(async tx => {
      await tx.session.deleteMany({ where: { tokenHash: hashToken(req.cookies.pf_session), userId: user.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: 'LOGOUT' } });
    });
    res.clearCookie('pf_session', { httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
    return { message: 'Signed out.' };
  }
  @Post('auth/forgot-password') async forgot(@Body() body: unknown) {
    const input = validate(z.object({ email }).strict(), body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (user) await db.$transaction(async tx => {
      await tx.authToken.deleteMany({ where: { userId: user.id, purpose: 'RESET_PASSWORD' } });
      await queueEmail(tx, user.email, 'RESET_PASSWORD', user.id);
    });
    return { message: 'If an account exists, a password reset email will arrive shortly.' };
  }
  @Post('auth/resend-verification') async resend(@Body() body: unknown) {
    const input = validate(z.object({ email }).strict(), body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (user && !user.emailVerifiedAt) await db.$transaction(async tx => {
      await tx.authToken.deleteMany({ where: { userId: user.id, purpose: 'VERIFY_EMAIL' } });
      await queueEmail(tx, user.email, 'VERIFY_EMAIL', user.id);
    });
    return { message: 'If verification is needed, an email will arrive shortly.' };
  }
  @Post('auth/reset-password') async reset(@Body() body: unknown) {
    const input = validate(z.object({ token: z.string().min(40).max(100), password }).strict(), body);
    await this.consume(input.token, 'RESET_PASSWORD', await hashPassword(input.password));
    return { message: 'Password changed. Please sign in again.' };
  }
  @Get('auth/me') async me(@Req() req: Request) { return safeUser(await this.identity.user(req)); }
  @Get('notifications/preferences') async notificationPreferences(@Req() req: Request) {
    const user = await this.identity.user(req);
    const preferences = await db.notificationPreference.findUnique({ where: { userId: user.id } });
    return preferences ? {
      paydayInApp: preferences.paydayInApp,
      paydayEmail: preferences.paydayEmail,
      maturityInApp: preferences.maturityInApp,
      maturityEmail: preferences.maturityEmail,
      monthlyReviewInApp: preferences.monthlyReviewInApp,
      monthlyReviewEmail: preferences.monthlyReviewEmail,
      updatedAt: preferences.updatedAt.toISOString(),
    } : {
      paydayInApp: false,
      paydayEmail: false,
      maturityInApp: false,
      maturityEmail: false,
      monthlyReviewInApp: false,
      monthlyReviewEmail: false,
      updatedAt: null,
    };
  }
  @Post('notifications/preferences') async updateNotificationPreferences(@Req() req: Request, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const input = validate(notificationPreferenceInput, body);
    const preferences = await db.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...input },
      update: input,
    });
    await db.auditEvent.create({
      data: { actorUserId: user.id, action: 'NOTIFICATION_PREFERENCES_UPDATED' },
    });
    return {
      paydayInApp: preferences.paydayInApp,
      paydayEmail: preferences.paydayEmail,
      maturityInApp: preferences.maturityInApp,
      maturityEmail: preferences.maturityEmail,
      monthlyReviewInApp: preferences.monthlyReviewInApp,
      monthlyReviewEmail: preferences.monthlyReviewEmail,
      updatedAt: preferences.updatedAt.toISOString(),
    };
  }
  @Get('notifications') async notifications(@Req() req: Request, @Query('unreadOnly') unreadOnly?: string) {
    const user = await this.identity.user(req);
    const validatedUnreadOnly = unreadOnly === undefined
      ? false
      : validate(z.enum(['true', 'false']), unreadOnly) === 'true';
    const where = { userId: user.id, ...(validatedUnreadOnly ? { readAt: null } : {}) };
    const [items, unreadCount] = await Promise.all([
      db.inAppNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: { id: true, type: true, title: true, message: true, readAt: true, createdAt: true },
      }),
      db.inAppNotification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return {
      notifications: items.map(item => ({
        ...item,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      unreadCount,
    };
  }
  @Post('notifications/:notificationId/read') async markNotificationRead(
    @Req() req: Request,
    @Param('notificationId') notificationId: string,
  ) {
    const user = await this.identity.user(req);
    const validNotificationId = validate(z.string().uuid(), notificationId);
    const notification = await db.inAppNotification.findFirst({
      where: { id: validNotificationId, userId: user.id },
      select: { id: true, readAt: true },
    });
    if (!notification) throw new NotFoundException();
    const updated = notification.readAt ? notification : await db.inAppNotification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
      select: { id: true, readAt: true },
    });
    return { id: updated.id, readAt: updated.readAt?.toISOString() ?? null };
  }
  @Post('notifications/read-all') async markAllNotificationsRead(@Req() req: Request) {
    const user = await this.identity.user(req);
    const result = await db.inAppNotification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { markedRead: result.count };
  }
  @Get('admin/financial-rules') async financialRules(@Req() req: Request) {
    const user = await this.identity.user(req);
    if (!isFinancialRuleAdmin(user)) throw new ForbiddenException('You do not have permission to manage financial review rules.');
    const rules = await db.financialRule.findMany({ orderBy: [{ market: 'asc' }, { code: 'asc' }] });
    return rules.map(rule => ({
      id: rule.id,
      code: rule.code,
      market: rule.market,
      metric: rule.metric,
      operator: rule.operator,
      threshold: rule.threshold.toString(),
      severity: rule.severity,
      enabled: rule.enabled,
      updatedAt: rule.updatedAt.toISOString(),
    }));
  }
  @Post('admin/financial-rules/:ruleId') async updateFinancialRule(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: unknown,
  ) {
    const user = await this.identity.user(req);
    if (!isFinancialRuleAdmin(user)) throw new ForbiddenException('You do not have permission to manage financial review rules.');
    const input = validate(financialRuleUpdateInput, body);
    const validRuleId = validate(z.string().uuid(), ruleId);
    const rule = await db.financialRule.findUnique({ where: { id: validRuleId } });
    if (!rule) throw new NotFoundException();
    const threshold = Number(input.threshold);
    if ((rule.metric === 'savingsRatePercent' && (threshold < 0 || threshold > 100))
      || (rule.metric === 'emergencyFundMonths' && (threshold < 0 || threshold > 1200))) {
      throw new BadRequestException('Threshold is outside the supported range for this metric.');
    }
    const updated = await db.$transaction(async tx => {
      const result = await tx.financialRule.update({
        where: { id: rule.id },
        data: { enabled: input.enabled, threshold: input.threshold, severity: input.severity },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: 'FINANCIAL_RULE_UPDATED' } });
      return result;
    });
    return {
      id: updated.id,
      code: updated.code,
      market: updated.market,
      metric: updated.metric,
      operator: updated.operator,
      threshold: updated.threshold.toString(),
      severity: updated.severity,
      enabled: updated.enabled,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
  @Get('spaces') async spaces(@Req() req: Request) {
    const user = await this.identity.user(req);
    const memberships = await db.membership.findMany({ where: { userId: user.id }, include: { space: true } });
    return memberships.filter(m => m.space.type !== 'PERSONAL' || mayAccessPersonalSpace(user.id, m.space.personalOwnerId)).map(m => ({ ...m.space, role: m.role }));
  }
  @Post('spaces') async createHouseholdSpace(@Req() req: Request, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const input = validate(householdSpaceInput, body);
    const space = await db.$transaction(async tx => {
      const created = await tx.financialSpace.create({
        data: {
          name: input.name,
          baseCurrency: input.baseCurrency,
          type: 'HOUSEHOLD',
          memberships: { create: { userId: user.id, role: 'OWNER' } },
        },
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map(category => ({
          ...category,
          normalizedName: normalizeCategoryName(category.name),
          spaceId: created.id,
          isSystem: true,
        })),
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: created.id, action: 'HOUSEHOLD_SPACE_CREATED' } });
      return created;
    });
    return { ...space, baseCurrency: space.baseCurrency.trim(), role: 'OWNER' };
  }
  @Get('spaces/:id/household') async householdDetails(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    const [household, members, dependants] = await Promise.all([
      db.financialSpace.findUniqueOrThrow({ where: { id: membership.spaceId } }),
      db.membership.findMany({
        where: { spaceId: membership.spaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { userId: 'asc' },
      }),
      db.dependant.findMany({
        where: { spaceId: membership.spaceId },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const canManage = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const invitations = canManage ? await db.householdInvitation.findMany({
      where: { spaceId: membership.spaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, invitedEmail: true, role: true, expiresAt: true, createdAt: true },
    }) : [];
    return {
      id: household.id,
      name: household.name,
      baseCurrency: household.baseCurrency.trim(),
      role: membership.role,
      members: members.map(item => ({
        id: item.id,
        userId: item.user.id,
        name: item.user.name,
        email: item.user.email,
        role: item.role,
      })),
      dependants: dependants.map(item => ({
        id: item.id,
        name: item.name,
        relationship: item.relationship,
        dateOfBirth: item.dateOfBirth ? toDateOnly(item.dateOfBirth) : null,
      })),
      invitations,
      canManage,
    };
  }
  @Post('spaces/:id/household-invitations') async inviteHouseholdMember(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only household owners and admins can invite members.');
    }
    const input = validate(householdInvitationInput, body);
    if (input.role === 'ADMIN' && membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the household owner can invite an admin.');
    }
    const existingUser = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existingUser && await db.membership.findUnique({ where: { userId_spaceId: { userId: existingUser.id, spaceId: membership.spaceId } } })) {
      throw new ConflictException('This person is already a member of the household.');
    }
    const token = newToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    try {
      const invitation = await db.$transaction(async tx => {
        const created = await tx.householdInvitation.create({
          data: {
            spaceId: membership.spaceId,
            invitedEmail: input.email,
            role: input.role,
            tokenHash: hashToken(token),
            expiresAt,
            invitedBy: user.id,
          },
        });
        await tx.emailOutbox.create({
          data: {
            recipient: input.email,
            subject: `Invitation to join ${membership.space.name}`,
            body: `You have been invited to join ${membership.space.name} as a ${input.role.toLowerCase()}. Sign in or create an account with this email address, then accept the invitation here: ${origin}/household?invite=${token}. This invitation expires in seven days.`,
          },
        });
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'HOUSEHOLD_INVITATION_CREATED' } });
        return created;
      });
      return { id: invitation.id, invitedEmail: invitation.invitedEmail, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('There is already an active invitation for this email address.');
      }
      throw error;
    }
  }
  @Post('household-invitations/accept') async acceptHouseholdInvitation(@Req() req: Request, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const { token } = validate(householdInvitationTokenInput, body);
    const tokenHash = hashToken(token);
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "HouseholdInvitation" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
      const invitation = await tx.householdInvitation.findUnique({
        where: { tokenHash },
        include: { space: true },
      });
      if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
        throw new NotFoundException('This household invitation is invalid, expired, or already used.');
      }
      if (user.email.toLowerCase() !== invitation.invitedEmail) {
        throw new ForbiddenException('Sign in with the email address that received this invitation.');
      }
      if (await tx.membership.findUnique({ where: { userId_spaceId: { userId: user.id, spaceId: invitation.spaceId } } })) {
        throw new ConflictException('You are already a member of this household.');
      }
      await tx.membership.create({ data: { userId: user.id, spaceId: invitation.spaceId, role: invitation.role } });
      await tx.householdInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: invitation.spaceId, action: 'HOUSEHOLD_INVITATION_ACCEPTED' } });
      return { spaceId: invitation.spaceId, name: invitation.space.name, role: invitation.role };
    });
  }
  @Post('spaces/:id/household-invitations/:invitationId/revoke') async revokeHouseholdInvitation(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException();
    const validInvitationId = validate(z.string().uuid(), invitationId);
    const invitation = await db.householdInvitation.findFirst({ where: { id: validInvitationId, spaceId: membership.spaceId } });
    if (!invitation) throw new NotFoundException();
    await db.$transaction(async tx => {
      await tx.householdInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'HOUSEHOLD_INVITATION_REVOKED' } });
    });
    return { id: invitation.id, revoked: true };
  }
  @Post('spaces/:id/household-members/:memberId/role') async updateHouseholdMemberRole(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException();
    const input = validate(householdMemberRoleInput, body);
    const validMemberId = validate(z.string().uuid(), memberId);
    const target = await db.membership.findFirst({ where: { id: validMemberId, spaceId: membership.spaceId } });
    if (!target) throw new NotFoundException();
    if (target.role === 'OWNER' || target.userId === user.id) throw new ForbiddenException('The household owner cannot be changed here, and you cannot change your own role.');
    if (membership.role === 'ADMIN' && (target.role === 'ADMIN' || input.role === 'ADMIN')) {
      throw new ForbiddenException('Only the household owner can manage admin roles.');
    }
    const updated = await db.$transaction(async tx => {
      const result = await tx.membership.update({ where: { id: target.id }, data: { role: input.role } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'HOUSEHOLD_MEMBER_ROLE_UPDATED' } });
      return result;
    });
    return { id: updated.id, role: updated.role };
  }
  @Post('spaces/:id/household-members/:memberId/remove') async removeHouseholdMember(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    const validMemberId = validate(z.string().uuid(), memberId);
    const target = await db.membership.findFirst({ where: { id: validMemberId, spaceId: membership.spaceId } });
    if (!target) throw new NotFoundException();
    const isSelf = target.userId === user.id;
    const isManager = membership.role === 'OWNER' || membership.role === 'ADMIN';
    if (!isSelf && !isManager) throw new ForbiddenException();
    if (target.role === 'OWNER') throw new ConflictException('The household owner cannot leave or be removed before transferring ownership.');
    if (membership.role === 'ADMIN' && !isSelf && target.role === 'ADMIN') throw new ForbiddenException('Only the household owner can remove an admin.');
    await db.$transaction(async tx => {
      await tx.membership.delete({ where: { id: target.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: isSelf ? 'HOUSEHOLD_MEMBER_LEFT' : 'HOUSEHOLD_MEMBER_REMOVED' } });
    });
    return { id: target.id, removed: true };
  }
  @Post('spaces/:id/dependants') async createDependant(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException();
    const input = validate(dependantInput, body);
    if (input.dateOfBirth && input.dateOfBirth > toDateOnly(new Date())) throw new BadRequestException('Date of birth cannot be in the future.');
    const dependant = await db.$transaction(async tx => {
      const result = await tx.dependant.create({
        data: {
          spaceId: membership.spaceId,
          name: input.name,
          relationship: input.relationship,
          dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : undefined,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'HOUSEHOLD_DEPENDANT_CREATED' } });
      return result;
    });
    return { id: dependant.id, name: dependant.name, relationship: dependant.relationship, dateOfBirth: dependant.dateOfBirth ? toDateOnly(dependant.dateOfBirth) : null };
  }
  @Post('spaces/:id/dependants/:dependantId/remove') async removeDependant(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('dependantId') dependantId: string,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') throw new ForbiddenException();
    const validDependantId = validate(z.string().uuid(), dependantId);
    const dependant = await db.dependant.findFirst({ where: { id: validDependantId, spaceId: membership.spaceId } });
    if (!dependant) throw new NotFoundException();
    await db.$transaction(async tx => {
      await tx.dependant.delete({ where: { id: dependant.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'HOUSEHOLD_DEPENDANT_REMOVED' } });
    });
    return { id: dependant.id, removed: true };
  }
  @Get('spaces/:id/ownership') async householdOwnership(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    return this.householdOwnershipSummary(membership.spaceId, new Date(`${toDateOnly(new Date())}T00:00:00.000Z`));
  }
  @Post('spaces/:id/ownership') async updateHouseholdOwnership(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    if (membership.role === 'VIEWER') throw new ForbiddenException('View-only household members cannot update ownership.');
    const input = validate(householdOwnershipInput, body);
    await db.$transaction(async tx => {
      let itemExists = false;
      if (input.entityType === 'SAVINGS_ACCOUNT') {
        await tx.$queryRaw`SELECT "id" FROM "SavingsAccount" WHERE "id" = ${input.entityId} AND "spaceId" = ${membership.spaceId} FOR UPDATE`;
        itemExists = Boolean(await tx.savingsAccount.findFirst({ where: { id: input.entityId, spaceId: membership.spaceId }, select: { id: true } }));
      } else if (input.entityType === 'INVESTMENT') {
        await tx.$queryRaw`SELECT i."id" FROM "Investment" i JOIN "InvestmentAccount" a ON a."id" = i."accountId" WHERE i."id" = ${input.entityId} AND a."spaceId" = ${membership.spaceId} FOR UPDATE OF i`;
        itemExists = Boolean(await tx.investment.findFirst({ where: { id: input.entityId, account: { spaceId: membership.spaceId } }, select: { id: true } }));
      } else {
        await tx.$queryRaw`SELECT "id" FROM "Liability" WHERE "id" = ${input.entityId} AND "spaceId" = ${membership.spaceId} FOR UPDATE`;
        itemExists = Boolean(await tx.liability.findFirst({ where: { id: input.entityId, spaceId: membership.spaceId }, select: { id: true } }));
      }
      if (!itemExists) throw new NotFoundException('The selected asset or liability is not in this Household Space.');

      const [activeMemberships, existing] = await Promise.all([
        tx.membership.findMany({ where: { spaceId: membership.spaceId }, select: { userId: true } }),
        tx.householdOwnershipAllocation.findMany({
          where: { spaceId: membership.spaceId, entityType: input.entityType, entityId: input.entityId },
        }),
      ]);
      const activeOwnerIds = new Set(activeMemberships.map(item => item.userId));
      const submitted = new Map(input.allocations.map(item => [item.ownerUserId, item.percentage]));
      const existingByUser = new Map(existing.map(item => [item.ownerUserId, item]));
      for (const allocation of input.allocations) {
        if (!activeOwnerIds.has(allocation.ownerUserId) && !existingByUser.has(allocation.ownerUserId)) {
          throw new BadRequestException('New ownership can only be assigned to current household members.');
        }
      }
      for (const allocation of existing) {
        if (!activeOwnerIds.has(allocation.ownerUserId)) {
          const submittedPercentage = submitted.get(allocation.ownerUserId);
          if (!submittedPercentage || !new Prisma.Decimal(submittedPercentage).equals(allocation.percentage)) {
            throw new ConflictException('A departed member’s historical ownership share cannot be changed or removed.');
          }
        }
      }
      const submittedIds = input.allocations.map(item => item.ownerUserId);
      const activeOwnersToRemove = [...activeOwnerIds].filter(ownerId => !submittedIds.includes(ownerId));
      await tx.householdOwnershipAllocation.deleteMany({
        where: {
          spaceId: membership.spaceId,
          entityType: input.entityType,
          entityId: input.entityId,
          ownerUserId: { in: activeOwnersToRemove },
        },
      });
      for (const allocation of input.allocations) {
        await tx.householdOwnershipAllocation.upsert({
          where: {
            spaceId_entityType_entityId_ownerUserId: {
              spaceId: membership.spaceId,
              entityType: input.entityType,
              entityId: input.entityId,
              ownerUserId: allocation.ownerUserId,
            },
          },
          create: {
            spaceId: membership.spaceId,
            entityType: input.entityType,
            entityId: input.entityId,
            ownerUserId: allocation.ownerUserId,
            percentage: allocation.percentage,
          },
          update: { percentage: allocation.percentage },
        });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'HOUSEHOLD_OWNERSHIP_UPDATED' } });
    });
    return this.householdOwnershipSummary(membership.spaceId, new Date(`${toDateOnly(new Date())}T00:00:00.000Z`));
  }
  @Get('spaces/:id/shares') async personalFinancialShares(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'PERSONAL') throw new NotFoundException();
    const shares = await db.sharedFinancialItem.findMany({
      where: { sourceSpaceId: membership.spaceId },
      include: { targetHouseholdSpace: { select: { id: true, name: true } } },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    });
    return shares.map(share => ({
      id: share.id,
      entityType: share.entityType,
      entityId: share.entityId,
      targetHouseholdSpaceId: share.targetHouseholdSpaceId,
      targetHouseholdName: share.targetHouseholdSpace.name,
      permission: share.permission,
      createdAt: share.createdAt.toISOString(),
      revokedAt: share.revokedAt?.toISOString() ?? null,
    }));
  }
  @Post('spaces/:id/shares') async sharePersonalFinancialItem(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const sourceMembership = await this.spaceMembership(user.id, id);
    if (sourceMembership.space.type !== 'PERSONAL') throw new NotFoundException();
    const input = validate(sharedFinancialItemInput, body);
    const targetMembership = await this.spaceMembership(user.id, input.targetHouseholdSpaceId);
    if (targetMembership.space.type !== 'HOUSEHOLD') throw new BadRequestException('Choose a Household Space that you belong to.');
    if (targetMembership.role === 'VIEWER') throw new ForbiddenException('View-only household members cannot share personal records.');
    const entityId = input.entityId;
    let belongsToPersonalSpace = false;
    if (input.entityType === 'SAVINGS_ACCOUNT') {
      belongsToPersonalSpace = Boolean(await db.savingsAccount.findFirst({ where: { id: entityId, spaceId: sourceMembership.spaceId }, select: { id: true } }));
    } else if (input.entityType === 'INVESTMENT') {
      belongsToPersonalSpace = Boolean(await db.investment.findFirst({ where: { id: entityId, account: { spaceId: sourceMembership.spaceId } }, select: { id: true } }));
    } else if (input.entityType === 'LIABILITY') {
      belongsToPersonalSpace = Boolean(await db.liability.findFirst({ where: { id: entityId, spaceId: sourceMembership.spaceId }, select: { id: true } }));
    } else {
      belongsToPersonalSpace = Boolean(await db.financialGoal.findFirst({ where: { id: entityId, spaceId: sourceMembership.spaceId }, select: { id: true } }));
    }
    if (!belongsToPersonalSpace) throw new NotFoundException('The selected record is not in your Personal Space.');
    const sharedItem = await db.$transaction(async tx => {
      const result = await tx.sharedFinancialItem.upsert({
        where: {
          sourceSpaceId_entityType_entityId_targetHouseholdSpaceId: {
            sourceSpaceId: sourceMembership.spaceId,
            entityType: input.entityType,
            entityId,
            targetHouseholdSpaceId: targetMembership.spaceId,
          },
        },
        create: {
          sourceSpaceId: sourceMembership.spaceId,
          entityType: input.entityType,
          entityId,
          targetHouseholdSpaceId: targetMembership.spaceId,
          sharedBy: user.id,
          permission: input.permission,
        },
        update: { sharedBy: user.id, permission: input.permission, revokedAt: null },
      });
      await tx.auditEvent.createMany({
        data: [
          { actorUserId: user.id, spaceId: sourceMembership.spaceId, action: 'PERSONAL_FINANCIAL_ITEM_SHARED' },
          { actorUserId: user.id, spaceId: targetMembership.spaceId, action: 'PERSONAL_FINANCIAL_ITEM_SHARED' },
        ],
      });
      return result;
    });
    return { id: sharedItem.id, entityType: sharedItem.entityType, permission: sharedItem.permission, revokedAt: null };
  }
  @Post('spaces/:id/shares/:shareId/revoke') async revokePersonalFinancialShare(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('shareId') shareId: string,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'PERSONAL') throw new NotFoundException();
    const validShareId = validate(z.string().uuid(), shareId);
    const share = await db.sharedFinancialItem.findFirst({ where: { id: validShareId, sourceSpaceId: membership.spaceId, revokedAt: null } });
    if (!share) throw new NotFoundException();
    await db.$transaction(async tx => {
      await tx.sharedFinancialItem.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
      await tx.auditEvent.createMany({
        data: [
          { actorUserId: user.id, spaceId: membership.spaceId, action: 'PERSONAL_FINANCIAL_SHARE_REVOKED' },
          { actorUserId: user.id, spaceId: share.targetHouseholdSpaceId, action: 'PERSONAL_FINANCIAL_SHARE_REVOKED' },
        ],
      });
    });
    return { id: share.id, revoked: true };
  }
  @Get('spaces/:id/shared-personal-items') async sharedPersonalFinancialItems(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    const shares = await db.sharedFinancialItem.findMany({
      where: { targetHouseholdSpaceId: membership.spaceId, revokedAt: null, sourceSpace: { type: 'PERSONAL' } },
      include: { sharer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(shares.map(async share => ({
      sharedBy: share.sharer.name,
      ...await this.sharedPersonalItemView(share),
    })));
  }
  @Get('spaces/:id/net-worth') async netWorth(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const snapshotDate = new Date(`${toDateOnly(new Date())}T00:00:00.000Z`);
    const [current, snapshots, ownership] = await Promise.all([
      calculateNetWorth(membership.spaceId, snapshotDate, membership.space.baseCurrency),
      db.netWorthSnapshot.findMany({
        where: { spaceId: membership.spaceId },
        include: { currencies: { orderBy: { currencyCode: 'asc' } } },
        orderBy: { snapshotDate: 'desc' },
        take: 24,
      }),
      membership.space.type === 'HOUSEHOLD'
        ? this.householdOwnershipSummary(membership.spaceId, snapshotDate)
        : Promise.resolve(null),
    ]);
    return {
      snapshotDate: toDateOnly(snapshotDate),
      baseCurrency: membership.space.baseCurrency.trim(),
      current,
      ...(ownership ? { ownership } : {}),
      snapshots: snapshots.map(snapshot => ({
        id: snapshot.id,
        snapshotDate: toDateOnly(snapshot.snapshotDate),
        currencies: snapshot.currencies.map(currency => ({
          currencyCode: currency.currencyCode.trim(),
          assets: currency.assets.toString(),
          liabilities: currency.liabilities.toString(),
          netWorth: currency.netWorth.toString(),
        })),
      })),
    };
  }
  @Get('spaces/:id/household/report') async householdReport(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('month') month?: string,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.space.type !== 'HOUSEHOLD') throw new NotFoundException();
    const selectedMonth = validate(monthPeriod.default(currentMonth()), month);
    const snapshotDate = new Date(`${toDateOnly(new Date())}T00:00:00.000Z`);
    const [monthly, currentNetWorth, ownership, goals] = await Promise.all([
      this.dashboard(req, id, selectedMonth),
      calculateNetWorth(membership.spaceId, snapshotDate, membership.space.baseCurrency),
      this.householdOwnershipSummary(membership.spaceId, snapshotDate),
      db.financialGoal.findMany({
        where: { spaceId: membership.spaceId },
        include: {
          dependant: { select: { id: true, name: true, relationship: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
      }),
    ]);
    const contributions = goals.length ? await db.goalContribution.groupBy({
      by: ['goalId', 'type'],
      where: { goalId: { in: goals.map(goal => goal.id) } },
      _sum: { amount: true },
    }) : [];
    const contributionAmounts = new Map(contributions.map(item => [
      `${item.goalId}:${item.type}`,
      item._sum.amount?.toString() ?? '0',
    ]));
    const goalViews = goals.map(goal => {
      const currentAmount = subtractDecimals(
        contributionAmounts.get(`${goal.id}:CONTRIBUTION`) ?? '0',
        contributionAmounts.get(`${goal.id}:WITHDRAWAL`) ?? '0',
      );
      const completed = decimalToUnits(currentAmount) >= decimalToUnits(goal.targetAmount.toString());
      return {
        id: goal.id,
        name: goal.name,
        currencyCode: goal.currencyCode.trim(),
        targetAmount: goal.targetAmount.toString(),
        currentAmount,
        remainingAmount: completed ? '0' : subtractDecimals(goal.targetAmount.toString(), currentAmount),
        progressPercent: Math.min(100, Math.max(0, Number(currentAmount) / Number(goal.targetAmount.toString()) * 100)),
        targetDate: goal.targetDate ? toDateOnly(goal.targetDate) : null,
        dependant: goal.dependant,
      };
    });
    const goalsByDependant = new Map<string, {
      dependant: { id: string; name: string; relationship: string } | null;
      goalCount: number;
      currencies: Map<string, { targetAmount: string; currentAmount: string; remainingAmount: string }>;
    }>();
    for (const goal of goalViews) {
      const dependantKey = goal.dependant?.id ?? 'household';
      let group = goalsByDependant.get(dependantKey);
      if (!group) {
        group = { dependant: goal.dependant, goalCount: 0, currencies: new Map() };
        goalsByDependant.set(dependantKey, group);
      }
      group.goalCount += 1;
      const currency = group.currencies.get(goal.currencyCode) ?? {
        targetAmount: '0',
        currentAmount: '0',
        remainingAmount: '0',
      };
      currency.targetAmount = addDecimals(currency.targetAmount, goal.targetAmount);
      currency.currentAmount = addDecimals(currency.currentAmount, goal.currentAmount);
      currency.remainingAmount = addDecimals(currency.remainingAmount, goal.remainingAmount);
      group.currencies.set(goal.currencyCode, currency);
    }
    return {
      month: selectedMonth,
      baseCurrency: membership.space.baseCurrency.trim(),
      monthly: {
        status: monthly.status,
        income: monthly.income,
        expenses: monthly.expenses,
        netCashFlow: monthly.netCashFlow,
        budget: monthly.budget,
      },
      netWorth: {
        snapshotDate: toDateOnly(snapshotDate),
        current: currentNetWorth,
        ownership,
      },
      goals: goalViews,
      goalsByDependant: [...goalsByDependant.entries()].map(([id, group]) => ({
        id,
        dependant: group.dependant,
        goalCount: group.goalCount,
        currencies: [...group.currencies.entries()].map(([currencyCode, amounts]) => ({
          currencyCode,
          ...amounts,
        })),
      })),
    };
  }
  @Get('spaces/:id/portfolio-analytics') async portfolioAnalytics(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const asOfDate = new Date(`${toDateOnly(new Date())}T00:00:00.000Z`);
    const investments = await db.investment.findMany({
      where: { account: { spaceId: membership.spaceId } },
      include: {
        transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
        valuations: { orderBy: [{ valuationDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });
    return calculatePortfolioAnalytics(investments.map(investment => ({
      id: investment.id,
      name: investment.name,
      type: investment.type,
      currencyCode: investment.currencyCode.trim(),
      costBasis: investment.costBasis.toString(),
      startDate: investment.startDate,
      maturityDate: investment.maturityDate,
      annualInterestRate: investment.annualInterestRate?.toString() ?? null,
      interestMethod: investment.interestMethod,
      compoundingFrequency: investment.compoundingFrequency,
      actualMaturityValue: investment.actualMaturityValue?.toString() ?? null,
      status: investment.status,
      closedAt: investment.closedAt,
      transactions: investment.transactions.map(transaction => ({
        type: transaction.type,
        amount: transaction.amount.toString(),
        quantity: transaction.quantity?.toString() ?? null,
        transactionDate: transaction.transactionDate,
      })),
      valuations: investment.valuations.map(valuation => ({
        valuationDate: valuation.valuationDate,
        createdAt: valuation.createdAt,
        marketValue: valuation.marketValue.toString(),
        unitPrice: valuation.unitPrice?.toString() ?? null,
        method: valuation.method,
      })),
    })), asOfDate);
  }
  private async buildFinancialProfile(membership: { spaceId: string; space: { baseCurrency: string } }) {
    const now = new Date();
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
    const today = new Date(`${toDateOnly(now)}T00:00:00.000Z`);
    const currencyCode = membership.space.baseCurrency.trim();
    const [incomeRecords, expenseRecords, savingsAccounts, netWorth] = await Promise.all([
      db.incomeRecord.findMany({
        where: { source: { spaceId: membership.spaceId }, receivedDate: { gte: periodStart, lt: periodEnd } },
        include: { source: { select: { currencyCode: true } } },
        orderBy: { receivedDate: 'desc' },
      }),
      db.expenseRecord.findMany({
        where: { spaceId: membership.spaceId, spentAt: { gte: periodStart, lt: periodEnd } },
        orderBy: { spentAt: 'desc' },
      }),
      db.savingsAccount.findMany({
        where: { spaceId: membership.spaceId, currencyCode },
        include: { transactions: { where: { transactionDate: { lte: today } } } },
      }),
      calculateNetWorth(membership.spaceId, today, currencyCode),
    ]);
    const baseCurrencyIncome = incomeRecords.filter(record => record.source.currencyCode.trim() === currencyCode);
    const baseCurrencyExpenses = expenseRecords.filter(record => record.currencyCode.trim() === currencyCode);
    const incomeTotal = baseCurrencyIncome.length ? addDecimals(...baseCurrencyIncome.map(record => record.amount.toString())) : null;
    const expenseTotal = baseCurrencyExpenses.length ? addDecimals(...baseCurrencyExpenses.map(record => record.amount.toString())) : null;
    const monthlyIncome = incomeTotal === null ? null : Number((Number(incomeTotal) / 3).toFixed(4));
    const monthlyExpenses = expenseTotal === null ? null : Number((Number(expenseTotal) / 3).toFixed(4));
    const monthlyCashFlow = monthlyIncome === null || monthlyExpenses === null
      ? null
      : Number(subtractDecimals(monthlyIncome.toFixed(4), monthlyExpenses.toFixed(4)));
    const savingsRatePercent = monthlyIncome === null || monthlyExpenses === null || monthlyIncome <= 0
      ? null
      : Number((((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100).toFixed(4));
    const savingsBalance = savingsAccounts.length
      ? Number(addDecimals(...savingsAccounts.map(account => subtractDecimals(
        addDecimals(account.openingBalance.toString(), ...account.transactions.filter(item => item.type === 'DEPOSIT').map(item => item.amount.toString())),
        addDecimals(...account.transactions.filter(item => item.type === 'WITHDRAWAL').map(item => item.amount.toString())),
      ))))
      : null;
    const emergencyFundMonths = savingsBalance === null || monthlyExpenses === null || monthlyExpenses <= 0
      ? null
      : Number((savingsBalance / monthlyExpenses).toFixed(4));
    const latestRecord = [...baseCurrencyIncome.map(record => record.receivedDate), ...baseCurrencyExpenses.map(record => record.spentAt)]
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const staleDays = latestRecord ? (today.getTime() - latestRecord.getTime()) / 86400000 : Number.POSITIVE_INFINITY;
    const limitations = [
      'Income and expenses use the previous three complete calendar months and only the financial space base currency.',
      'Tracked savings may be earmarked for other goals and are not necessarily an available emergency reserve.',
      'Net worth excludes untracked assets and liabilities; no currency conversion is performed.',
      'No risk profile, personal circumstances, or investment recommendation is inferred.',
    ];
    if (baseCurrencyIncome.length !== incomeRecords.length || baseCurrencyExpenses.length !== expenseRecords.length) {
      limitations.push('Records in other currencies were excluded rather than converted.');
    }
    const profile: FinancialProfile = {
      currencyCode,
      periodStart: toDateOnly(periodStart),
      periodEnd: toDateOnly(periodEnd),
      monthlyIncome,
      monthlyExpenses,
      savingsRatePercent,
      monthlyCashFlow,
      savingsBalance,
      emergencyFundMonths,
      netWorthByCurrency: netWorth.map(item => ({ currencyCode: item.currencyCode, netWorth: Number(item.netWorth) })),
      dataFreshness: staleDays > 60 ? 'UPDATE_RECOMMENDED' : 'UP_TO_DATE',
      limitations,
    };
    const rules = await db.financialRule.findMany({
      where: { enabled: true, market: { in: ['*', currencyCode] } },
    });
    const strategies = evaluateFinancialRules(profile, rules.flatMap(rule => isFinancialRuleMetric(rule.metric)
      ? [{
        code: rule.code,
        metric: rule.metric,
        operator: rule.operator,
        threshold: Number(rule.threshold),
        severity: rule.severity,
        enabled: rule.enabled,
      }]
      : []));
    return { profile, strategies, periodStart, periodEnd };
  }
  @Get('spaces/:id/financial-reviews') async financialReviews(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const reviews = await db.financialProfileSnapshot.findMany({
      where: { spaceId: membership.spaceId },
      include: financialReviewInclude,
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    return reviews.map(financialReviewResponse);
  }
  @Post('spaces/:id/financial-reviews') async createFinancialReview(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to generate financial reviews in this space.');
    const { trigger } = validate(financialReviewInput, body);
    const monthlyPeriod = trigger === 'MONTHLY'
      ? `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`
      : null;
    if (monthlyPeriod) {
      const existing = await db.financialProfileSnapshot.findUnique({
        where: { spaceId_monthlyPeriod: { spaceId: membership.spaceId, monthlyPeriod } },
        include: financialReviewInclude,
      });
      if (existing) return financialReviewResponse(existing);
    }
    const { profile, strategies, periodStart, periodEnd } = await this.buildFinancialProfile(membership);
    try {
      const review = await db.$transaction(async tx => {
        const snapshot = await tx.financialProfileSnapshot.create({
          data: {
            spaceId: membership.spaceId,
            createdBy: user.id,
            trigger,
            monthlyPeriod,
            currencyCode: profile.currencyCode,
            periodStart,
            periodEnd,
            profile,
          },
        });
        if (strategies.length) {
          await tx.recommendationStrategy.createMany({
            data: strategies.map(strategy => ({
              snapshotId: snapshot.id,
              ruleCode: strategy.code,
              severity: strategy.severity,
              title: strategy.title,
              explanation: strategy.explanation,
              observedValue: strategy.observedValue,
              threshold: strategy.threshold,
            })),
          });
        }
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: trigger === 'MONTHLY' ? 'MONTHLY_FINANCIAL_REVIEW_CREATED' : 'FINANCIAL_REVIEW_CREATED' } });
        return tx.financialProfileSnapshot.findUniqueOrThrow({
          where: { id: snapshot.id },
          include: financialReviewInclude,
        });
      });
      return financialReviewResponse(review);
    } catch (error) {
      if (monthlyPeriod && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await db.financialProfileSnapshot.findUniqueOrThrow({
          where: { spaceId_monthlyPeriod: { spaceId: membership.spaceId, monthlyPeriod } },
          include: financialReviewInclude,
        });
        return financialReviewResponse(existing);
      }
      throw error;
    }
  }
  @Post('spaces/:id/financial-reviews/:reviewId/strategies/:strategyId/response') async respondToStrategy(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Param('strategyId') strategyId: string,
    @Body() body: unknown,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to respond to financial strategies in this space.');
    const input = validate(strategyResponseInput, body);
    const validReviewId = validate(z.string().uuid(), reviewId);
    const validStrategyId = validate(z.string().uuid(), strategyId);
    const strategy = await db.recommendationStrategy.findFirst({
      where: { id: validStrategyId, snapshotId: validReviewId, snapshot: { spaceId: membership.spaceId } },
      include: { financialPlan: true },
    });
    if (!strategy) throw new NotFoundException();
    if (strategy.financialPlan && input.decision) {
      throw new ConflictException('The decision cannot be changed after this strategy has been converted to a plan.');
    }
    const updated = await db.$transaction(async tx => {
      const result = await tx.recommendationStrategy.update({
        where: { id: strategy.id },
        data: {
          decision: input.decision,
          feedback: input.feedback,
          userNote: input.userNote,
          respondedBy: user.id,
          respondedAt: new Date(),
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'FINANCIAL_STRATEGY_RESPONSE_RECORDED' } });
      return result;
    });
    return {
      id: updated.id,
      decision: updated.decision,
      feedback: updated.feedback,
      userNote: updated.userNote,
      respondedAt: updated.respondedAt?.toISOString() ?? null,
    };
  }
  @Post('spaces/:id/financial-reviews/:reviewId/strategies/:strategyId/convert') async convertStrategyToPlan(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Param('strategyId') strategyId: string,
    @Body() body: unknown,
  ) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to create a plan in this space.');
    const input = validate(strategyPlanInput, body);
    const validReviewId = validate(z.string().uuid(), reviewId);
    const validStrategyId = validate(z.string().uuid(), strategyId);
    const strategy = await db.recommendationStrategy.findFirst({
      where: { id: validStrategyId, snapshotId: validReviewId, snapshot: { spaceId: membership.spaceId } },
      include: { snapshot: true, financialPlan: true },
    });
    if (!strategy) throw new NotFoundException();
    if (strategy.decision !== 'SELECTED' && strategy.decision !== 'MODIFIED') {
      throw new ConflictException('Select or modify this strategy before converting it to a plan.');
    }
    if (strategy.financialPlan) throw new ConflictException('This strategy has already been converted to a plan.');
    const assumptions = {
      startingCapital: Number(input.startingCapital),
      recurringContribution: Number(input.recurringContribution),
      contributionFrequency: input.contributionFrequency,
      expectedAnnualReturn: Number(input.expectedAnnualReturn),
      durationYears: input.durationYears,
      inflationRate: Number(input.inflationRate),
      annualContributionGrowth: Number(input.annualContributionGrowth),
    };
    try { calculateScenarioProjection(assumptions); }
    catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }
    try {
      await db.$transaction(async tx => {
        const current = await tx.recommendationStrategy.findUnique({ where: { id: strategy.id } });
        const existingPlan = await tx.financialPlan.findUnique({ where: { recommendationStrategyId: strategy.id } });
        if (!current || (current.decision !== 'SELECTED' && current.decision !== 'MODIFIED')) {
          throw new ConflictException('Select or modify this strategy before converting it to a plan.');
        }
        if (existingPlan) throw new ConflictException('This strategy has already been converted to a plan.');
        const scenario = await tx.scenario.create({
          data: {
            ...input,
            currencyCode: strategy.snapshot.currencyCode,
            spaceId: membership.spaceId,
            createdBy: user.id,
          },
        });
        const strategyContext = strategy.userNote
          ? ` User modification: ${strategy.userNote}`
          : '';
        await createPlanFromScenario(
          tx,
          scenario,
          user.id,
          strategy.id,
          `Created from financial review strategy "${strategy.title}".${strategyContext} Actual results may differ; investment returns are not guaranteed.`,
        );
        await tx.auditEvent.create({
          data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'FINANCIAL_STRATEGY_CONVERTED_TO_PLAN' },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This strategy has already been converted to a plan.');
      }
      throw error;
    }
    const updatedReview = await db.financialProfileSnapshot.findUniqueOrThrow({
      where: { id: strategy.snapshotId },
      include: financialReviewInclude,
    });
    return financialReviewResponse(updatedReview);
  }
  @Get('spaces/:id/scenarios') async scenarios(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const scenarios = await db.scenario.findMany({
      where: { spaceId: membership.spaceId },
      include: { financialPlan: { include: { goal: { include: { contributions: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
    return scenarios.map(scenarioResponse);
  }
  @Post('spaces/:id/scenarios') async createScenario(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to create scenarios in this space.');
    const input = validate(scenarioInput, body);
    const assumptions = {
      startingCapital: Number(input.startingCapital),
      recurringContribution: Number(input.recurringContribution),
      contributionFrequency: input.contributionFrequency,
      expectedAnnualReturn: Number(input.expectedAnnualReturn),
      durationYears: input.durationYears,
      inflationRate: Number(input.inflationRate),
      annualContributionGrowth: Number(input.annualContributionGrowth),
    };
    try { calculateScenarioProjection(assumptions); }
    catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }
    const scenario = await db.$transaction(async tx => {
      const created = await tx.scenario.create({
        data: {
          ...input,
          currencyCode: input.currencyCode ?? membership.space.baseCurrency.trim(),
          spaceId: membership.spaceId,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'SCENARIO_CREATED' } });
      return tx.scenario.findUniqueOrThrow({
        where: { id: created.id },
        include: { financialPlan: { include: { goal: { include: { contributions: true } } } } },
      });
    });
    return scenarioResponse(scenario);
  }
  @Post('spaces/:id/scenarios/:scenarioId/convert') async convertScenarioToPlan(@Req() req: Request, @Param('id') id: string, @Param('scenarioId') scenarioId: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to create a plan in this space.');
    const validScenarioId = validate(z.string().uuid(), scenarioId);
    const scenario = await db.scenario.findFirst({
      where: { id: validScenarioId, spaceId: membership.spaceId },
      include: { financialPlan: { include: { goal: { include: { contributions: true } } } } },
    });
    if (!scenario) throw new NotFoundException();
    if (scenario.financialPlan) throw new ConflictException('This scenario has already been converted to a plan.');
    try {
      await db.$transaction(async tx => {
        await createPlanFromScenario(tx, scenario, user.id);
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'SCENARIO_CONVERTED_TO_PLAN' } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This scenario has already been converted to a plan.');
      }
      throw error;
    }
    const converted = await db.scenario.findUniqueOrThrow({
      where: { id: scenario.id },
      include: { financialPlan: { include: { goal: { include: { contributions: true } } } } },
    });
    return scenarioResponse(converted);
  }
  @Post('spaces/:id/net-worth/snapshots') async createNetWorthSnapshot(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to create net-worth snapshots in this space.');
    const input = validate(snapshotInput, body);
    const snapshotDate = input.snapshotDate ?? toDateOnly(new Date());
    if (snapshotDate > toDateOnly(new Date())) throw new BadRequestException('Snapshot date cannot be in the future.');
    const date = new Date(`${snapshotDate}T00:00:00.000Z`);
    const currencies = await calculateNetWorth(membership.spaceId, date, membership.space.baseCurrency);
    try {
      return await db.$transaction(async tx => {
        const snapshot = await tx.netWorthSnapshot.create({
          data: {
            spaceId: membership.spaceId,
            snapshotDate: date,
            createdBy: user.id,
            currencies: { create: currencies },
          },
          include: { currencies: { orderBy: { currencyCode: 'asc' } } },
        });
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'NET_WORTH_SNAPSHOT_CREATED' } });
        return {
          id: snapshot.id,
          snapshotDate: toDateOnly(snapshot.snapshotDate),
          currencies: snapshot.currencies.map(currency => ({
            currencyCode: currency.currencyCode.trim(),
            assets: currency.assets.toString(),
            liabilities: currency.liabilities.toString(),
            netWorth: currency.netWorth.toString(),
          })),
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A net-worth snapshot already exists for this date.');
      }
      throw error;
    }
  }
  @Get('spaces/:id/dashboard') async dashboard(@Req() req: Request, @Param('id') id: string, @Query('month') month?: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const selectedMonth = validate(monthPeriod.default(currentMonth()), month);
    const { from, until } = monthBounds(selectedMonth);
    const range = { gte: from, lt: until };
    const spaceCurrency = membership.space.baseCurrency.trim();
    const incomeFilter = { source: { spaceId: membership.spaceId, currencyCode: spaceCurrency }, receivedDate: range };
    const excludedIncomeFilter = { source: { spaceId: membership.spaceId, currencyCode: { not: spaceCurrency } }, receivedDate: range };
    const [income, incomeCount, expenses, expenseCount, expenseGroups, budget] = await Promise.all([
      db.incomeRecord.aggregate({ where: incomeFilter, _sum: { amount: true } }),
      db.incomeRecord.count({ where: incomeFilter }),
      db.expenseRecord.aggregate({ where: { spaceId: membership.spaceId, spentAt: range }, _sum: { amount: true } }),
      db.expenseRecord.count({ where: { spaceId: membership.spaceId, spentAt: range } }),
      db.expenseRecord.groupBy({ by: ['categoryId'], where: { spaceId: membership.spaceId, spentAt: range }, _sum: { amount: true } }),
      db.budget.findUnique({
        where: { spaceId_year_month: { spaceId: membership.spaceId, ...monthParts(selectedMonth) } },
        include: { allocations: { include: { category: { select: { id: true, name: true } } } } },
      }),
    ]);
    const excludedIncomeCount = await db.incomeRecord.count({ where: excludedIncomeFilter });
    const categoryIds = [...new Set([...expenseGroups.map(group => group.categoryId), ...(budget?.allocations.map(allocation => allocation.categoryId) ?? [])])];
    const categories = categoryIds.length ? await db.category.findMany({ where: { id: { in: categoryIds }, spaceId: membership.spaceId }, select: { id: true, name: true } }) : [];
    const categoryNames = new Map(categories.map(category => [category.id, category.name]));
    const spendingByCategory = new Map(expenseGroups.map(group => [group.categoryId, group._sum.amount?.toString() ?? '0']));
    const incomeTotal = income._sum.amount?.toString() ?? '0';
    const expenseTotal = expenses._sum.amount?.toString() ?? '0';
    const allocations = budget?.allocations.map(allocation => {
      const spent = spendingByCategory.get(allocation.categoryId) ?? '0';
      const limit = allocation.limitAmount.toString();
      return { categoryId: allocation.categoryId, category: allocation.category.name, limit, spent, remaining: subtractDecimals(limit, spent) };
    }) ?? [];
    const budgetLimit = addDecimals(...allocations.map(allocation => allocation.limit));
    const budgetSpent = addDecimals(...allocations.map(allocation => allocation.spent));
    return {
      space: membership.space,
      month: selectedMonth,
      status: incomeCount || excludedIncomeCount || expenseCount ? 'READY' : 'NOT_ENOUGH_DATA',
      income: { total: incomeTotal, count: incomeCount, excludedCurrencyCount: excludedIncomeCount },
      expenses: {
        total: expenseTotal,
        count: expenseCount,
        byCategory: expenseGroups.map(group => ({ categoryId: group.categoryId, category: categoryNames.get(group.categoryId) ?? 'Expense', total: group._sum.amount?.toString() ?? '0' })),
      },
      netCashFlow: subtractDecimals(incomeTotal, expenseTotal),
      budget: { limit: budgetLimit, spent: budgetSpent, remaining: subtractDecimals(budgetLimit, budgetSpent), allocations },
    };
  }
  private async sharedPersonalItemView(share: Prisma.SharedFinancialItemGetPayload<{}>) {
    const shared = {
      id: share.id,
      entityType: share.entityType,
      permission: share.permission,
    };
    if (share.entityType === 'SAVINGS_ACCOUNT') {
      const account = await db.savingsAccount.findFirst({
        where: { id: share.entityId, spaceId: share.sourceSpaceId },
        include: { transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }] } },
      });
      if (!account) return { ...shared, unavailable: true };
      const balance = subtractDecimals(
        addDecimals(account.openingBalance.toString(), ...account.transactions.filter(item => item.type === 'DEPOSIT').map(item => item.amount.toString())),
        addDecimals(...account.transactions.filter(item => item.type === 'WITHDRAWAL').map(item => item.amount.toString())),
      );
      return {
        ...shared,
        currencyCode: account.currencyCode.trim(),
        balance,
        ...(share.permission === 'BALANCE_ONLY' ? {} : { name: account.name }),
        ...(share.permission === 'FULL_READ' ? {
          openingBalance: account.openingBalance.toString(),
          openedAt: toDateOnly(account.openedAt),
          transactions: account.transactions.map(item => ({
            type: item.type,
            amount: item.amount.toString(),
            transactionDate: toDateOnly(item.transactionDate),
            description: item.description,
          })),
        } : {}),
      };
    }
    if (share.entityType === 'INVESTMENT') {
      const investment = await db.investment.findFirst({
        where: { id: share.entityId, account: { spaceId: share.sourceSpaceId } },
        include: {
          transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }] },
          valuations: { orderBy: [{ valuationDate: 'desc' }, { createdAt: 'desc' }] },
        },
      });
      if (!investment) return { ...shared, unavailable: true };
      const value = investmentValueAt(investment, new Date(`${toDateOnly(new Date())}T00:00:00.000Z`));
      return {
        ...shared,
        currencyCode: investment.currencyCode.trim(),
        balance: value,
        ...(share.permission === 'BALANCE_ONLY' ? {} : {
          name: investment.name,
          type: investment.type,
          maturityDate: investment.maturityDate ? toDateOnly(investment.maturityDate) : null,
        }),
        ...(share.permission === 'FULL_READ' ? {
          transactions: investment.transactions.map(item => ({
            type: item.type,
            amount: item.amount.toString(),
            transactionDate: toDateOnly(item.transactionDate),
            description: item.description,
          })),
          valuations: investment.valuations.map(item => ({
            valuationDate: toDateOnly(item.valuationDate),
            marketValue: item.marketValue.toString(),
            method: item.method,
          })),
        } : {}),
      };
    }
    if (share.entityType === 'LIABILITY') {
      const liability = await db.liability.findFirst({
        where: { id: share.entityId, spaceId: share.sourceSpaceId },
        include: { payments: { orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] } },
      });
      if (!liability) return { ...shared, unavailable: true };
      const principalPaid = addDecimals(...liability.payments.map(item => item.principalAmount.toString()));
      const balance = subtractDecimals(liability.openingBalance.toString(), principalPaid);
      return {
        ...shared,
        currencyCode: liability.currencyCode.trim(),
        balance,
        ...(share.permission === 'BALANCE_ONLY' ? {} : { name: liability.name, type: liability.type }),
        ...(share.permission === 'FULL_READ' ? {
          originalAmount: liability.originalAmount.toString(),
          openingBalance: liability.openingBalance.toString(),
          annualInterestRate: liability.annualInterestRate.toString(),
          monthlyPayment: liability.monthlyPayment?.toString() ?? null,
          payments: liability.payments.map(item => ({
            amount: item.amount.toString(),
            principalAmount: item.principalAmount.toString(),
            paidAt: toDateOnly(item.paidAt),
            description: item.description,
          })),
        } : {}),
      };
    }
    const goal = await db.financialGoal.findFirst({
      where: { id: share.entityId, spaceId: share.sourceSpaceId },
      include: { contributions: { orderBy: [{ contributionDate: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!goal) return { ...shared, unavailable: true };
    const contributions = addDecimals(...goal.contributions.filter(item => item.type === 'CONTRIBUTION').map(item => item.amount.toString()));
    const withdrawals = addDecimals(...goal.contributions.filter(item => item.type === 'WITHDRAWAL').map(item => item.amount.toString()));
    const balance = subtractDecimals(contributions, withdrawals);
    return {
      ...shared,
      currencyCode: goal.currencyCode.trim(),
      balance,
      ...(share.permission === 'BALANCE_ONLY' ? {} : {
        name: goal.name,
        targetAmount: goal.targetAmount.toString(),
        targetDate: goal.targetDate ? toDateOnly(goal.targetDate) : null,
      }),
      ...(share.permission === 'FULL_READ' ? {
        description: goal.description,
        contributions: goal.contributions.map(item => ({
          type: item.type,
          amount: item.amount.toString(),
          contributionDate: toDateOnly(item.contributionDate),
          description: item.description,
        })),
      } : {}),
    };
  }
  private async householdOwnershipSummary(spaceId: string, asOfDate: Date) {
    const [allocations, memberships, accounts, liabilities, investments] = await Promise.all([
      db.householdOwnershipAllocation.findMany({
        where: { spaceId },
        include: { owner: { select: { id: true, name: true, email: true } } },
        orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }, { ownerUserId: 'asc' }],
      }),
      db.membership.findMany({ where: { spaceId }, select: { userId: true } }),
      db.savingsAccount.findMany({
        where: { spaceId, openedAt: { lte: asOfDate } },
        include: { transactions: { where: { transactionDate: { lte: asOfDate } } } },
      }),
      db.liability.findMany({
        where: { spaceId, startDate: { lte: asOfDate } },
        include: { payments: { where: { paidAt: { lte: asOfDate } } } },
      }),
      db.investment.findMany({
        where: { account: { spaceId }, startDate: { lte: asOfDate } },
        include: {
          transactions: { where: { transactionDate: { lte: asOfDate } } },
          valuations: { where: { valuationDate: { lte: asOfDate } } },
        },
      }),
    ]);
    const activeOwnerIds = new Set(memberships.map(item => item.userId));
    const values = new Map<string, { entityType: 'SAVINGS_ACCOUNT' | 'INVESTMENT' | 'LIABILITY'; entityId: string; name: string; currencyCode: string; value: string | null }>();
    for (const account of accounts) {
      const balance = subtractDecimals(
        addDecimals(account.openingBalance.toString(), ...account.transactions.filter(item => item.type === 'DEPOSIT').map(item => item.amount.toString())),
        addDecimals(...account.transactions.filter(item => item.type === 'WITHDRAWAL').map(item => item.amount.toString())),
      );
      values.set(`SAVINGS_ACCOUNT:${account.id}`, {
        entityType: 'SAVINGS_ACCOUNT', entityId: account.id, name: account.name, currencyCode: account.currencyCode.trim(), value: balance,
      });
    }
    for (const liability of liabilities) {
      const outstanding = subtractDecimals(
        liability.openingBalance.toString(),
        addDecimals(...liability.payments.map(item => item.principalAmount.toString())),
      );
      values.set(`LIABILITY:${liability.id}`, {
        entityType: 'LIABILITY', entityId: liability.id, name: liability.name, currencyCode: liability.currencyCode.trim(), value: outstanding,
      });
    }
    for (const investment of investments) {
      const value = investmentValueAt(investment, asOfDate);
      values.set(`INVESTMENT:${investment.id}`, {
        entityType: 'INVESTMENT', entityId: investment.id, name: investment.name, currencyCode: investment.currencyCode.trim(), value,
      });
    }
    const allocationKeys = new Set(allocations.map(item => `${item.entityType}:${item.entityId}`));
    const memberValues = new Map<string, {
      owner: { id: string; name: string; email: string };
      currencies: Map<string, { assets: string; liabilities: string }>;
    }>();
    const allocationViews = allocations.map(allocation => {
      const key = `${allocation.entityType}:${allocation.entityId}`;
      const asset = values.get(key);
      const percentage = allocation.percentage.toString();
      const ownedAmount = asset?.value === null || !asset
        ? null
        : new Prisma.Decimal(asset.value).mul(allocation.percentage).dividedBy(100)
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
      if (asset && ownedAmount !== null) {
        let member = memberValues.get(allocation.ownerUserId);
        if (!member) {
          member = { owner: allocation.owner, currencies: new Map() };
          memberValues.set(allocation.ownerUserId, member);
        }
        const currencyTotals = member.currencies.get(asset.currencyCode) ?? { assets: '0', liabilities: '0' };
        if (allocation.entityType === 'LIABILITY') {
          currencyTotals.liabilities = addDecimals(currencyTotals.liabilities, ownedAmount);
        } else {
          currencyTotals.assets = addDecimals(currencyTotals.assets, ownedAmount);
        }
        member.currencies.set(asset.currencyCode, currencyTotals);
      }
      return {
        id: allocation.id,
        entityType: allocation.entityType,
        entityId: allocation.entityId,
        name: asset?.name ?? null,
        currencyCode: asset?.currencyCode ?? null,
        value: asset?.value ?? null,
        percentage,
        ownedAmount,
        owner: {
          id: allocation.owner.id,
          name: allocation.owner.name,
          email: allocation.owner.email,
          isCurrentMember: activeOwnerIds.has(allocation.owner.id),
        },
      };
    });
    const unallocated = [...values.values()]
      .filter(asset => !allocationKeys.has(`${asset.entityType}:${asset.entityId}`))
      .map(asset => ({ ...asset, reason: asset.value === null ? 'NOT_VALUED' : 'NO_OWNERSHIP_ALLOCATION' }));
    return {
      asOfDate: toDateOnly(asOfDate),
      allocations: allocationViews,
      unallocated,
      memberShares: [...memberValues.values()].map(member => ({
        owner: { ...member.owner, isCurrentMember: activeOwnerIds.has(member.owner.id) },
        currencies: [...member.currencies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, totals]) => ({
          currencyCode,
          assets: totals.assets,
          liabilities: totals.liabilities,
          netWorth: subtractDecimals(totals.assets, totals.liabilities),
        })),
      })).sort((left, right) => left.owner.name.localeCompare(right.owner.name)),
    };
  }
  private async spaceMembership(userId: string, id: string) {
    validate(z.string().uuid(), id);
    const membership = await db.membership.findUnique({ where: { userId_spaceId: { userId, spaceId: id } }, include: { space: true } });
    if (!membership || (membership.space.type === 'PERSONAL' && !mayAccessPersonalSpace(userId, membership.space.personalOwnerId))) throw new NotFoundException();
    return membership;
  }
  @Get('spaces/:id/categories') async categories(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    return db.category.findMany({
      where: { spaceId: membership.spaceId, isArchived: false },
      orderBy: [{ type: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, type: true, isSystem: true, isArchived: true, createdAt: true },
    });
  }
  @Post('spaces/:id/categories') async createCategory(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage categories in this space.');
    const input = validate(z.object({ name: z.string().trim().min(1).max(60), type: z.enum(['INCOME', 'EXPENSE']) }).strict(), body);
    try {
      return await db.$transaction(async tx => {
        const category = await tx.category.create({ data: { ...input, normalizedName: normalizeCategoryName(input.name), spaceId: membership.spaceId } });
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'CATEGORY_CREATED' } });
        return { id: category.id, name: category.name, type: category.type, isSystem: category.isSystem, isArchived: category.isArchived, createdAt: category.createdAt };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A category with this name and type already exists.');
      throw error;
    }
  }
  @Get('spaces/:id/income-sources') async incomeSources(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const sources = await db.incomeSource.findMany({
      where: { spaceId: membership.spaceId, isActive: true },
      include: { expectedPaydays: { orderBy: { sequence: 'asc' } }, records: { orderBy: { receivedDate: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const today = toDateOnly(now);
    const currentSalaryRecords = sources.length ? await db.incomeRecord.findMany({
      where: { sourceId: { in: sources.map(source => source.id) }, periodYear: year, periodMonth: month },
    }) : [];
    const currentRecordBySource = new Map(currentSalaryRecords.map(record => [record.sourceId, record]));
    return sources.map(source => {
      const record = currentRecordBySource.get(source.id);
      const possibleDates = source.type === 'SALARY'
        ? expectedPaydayDates(year, month, source.expectedPaydays)
        : [];
      return {
        id: source.id,
        name: source.name,
        type: source.type,
        expectedAmount: source.expectedAmount?.toString() ?? null,
        currencyCode: source.currencyCode.trim(),
        createdAt: source.createdAt,
        possiblePaydays: source.expectedPaydays.map(item => ({ dayOfMonth: item.dayOfMonth, adjustmentRule: item.adjustmentRule })),
        currentPeriod: source.type === 'SALARY' ? {
          year,
          month,
          possibleDates,
          status: salaryPeriodStatus(today, possibleDates, Boolean(record)),
          record: record ? { id: record.id, amount: record.amount.toString(), receivedDate: toDateOnly(record.receivedDate) } : null,
        } : null,
        recentRecords: source.records.map(item => ({
          id: item.id,
          amount: item.amount.toString(),
          receivedDate: toDateOnly(item.receivedDate),
          periodYear: item.periodYear,
          periodMonth: item.periodMonth,
        })),
      };
    });
  }
  @Post('spaces/:id/income-sources') async createIncomeSource(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage income in this space.');
    const input = validate(incomeSourceInput, body);
    const sortedPaydayDays = [...input.paydayDays].sort((a, b) => a - b);
    const source = await db.$transaction(async tx => {
      const created = await tx.incomeSource.create({
        data: {
          spaceId: membership.spaceId,
          name: input.name,
          type: input.type,
          expectedAmount: input.expectedAmount,
          currencyCode: input.currencyCode,
          expectedPaydays: { create: sortedPaydayDays.map((dayOfMonth, index) => ({ sequence: index + 1, dayOfMonth, adjustmentRule: input.adjustmentRule })) },
        },
        include: { expectedPaydays: { orderBy: { sequence: 'asc' } } },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'INCOME_SOURCE_CREATED' } });
      return created;
    });
    return {
      id: source.id,
      name: source.name,
      type: source.type,
      expectedAmount: source.expectedAmount?.toString() ?? null,
      currencyCode: source.currencyCode.trim(),
      possiblePaydays: source.expectedPaydays.map(item => ({ dayOfMonth: item.dayOfMonth, adjustmentRule: item.adjustmentRule })),
    };
  }
  @Post('spaces/:id/income-sources/:sourceId/records') async recordIncome(@Req() req: Request, @Param('id') id: string, @Param('sourceId') sourceId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record income in this space.');
    const input = validate(incomeRecordInput, body);
    const validSourceId = validate(z.string().uuid(), sourceId);
    const source = await db.incomeSource.findFirst({ where: { id: validSourceId, spaceId: membership.spaceId, isActive: true } });
    if (!source) throw new NotFoundException();
    if (source.type === 'SALARY' && input.periodYear === undefined) {
      throw new BadRequestException('Confirm salary for a specific month and year.');
    }
    if (source.type !== 'SALARY' && input.periodYear !== undefined) {
      throw new BadRequestException('Only salary records have a salary period.');
    }
    if (input.receivedDate > toDateOnly(new Date())) throw new BadRequestException('Received date cannot be in the future.');
    try {
      const record = await db.$transaction(async tx => {
        const created = await tx.incomeRecord.create({
          data: {
            sourceId: source.id,
            amount: input.amount,
            receivedDate: new Date(`${input.receivedDate}T00:00:00.000Z`),
            periodYear: input.periodYear,
            periodMonth: input.periodMonth,
          },
        });
        if (source.type === 'SALARY') {
          const actions = await tx.paydayRoutineAction.findMany({ where: { sourceId: source.id, isActive: true } });
          if (actions.length) {
            await tx.paydayRoutineEntry.createMany({
              data: actions.map(action => ({ incomeRecordId: created.id, actionId: action.id, plannedAmount: action.plannedAmount })),
            });
            const preferences = await tx.notificationPreference.findUnique({
              where: { userId: user.id },
              select: { paydayInApp: true },
            });
            if (preferences?.paydayInApp) {
              await tx.inAppNotification.create({
                data: {
                  userId: user.id,
                  spaceId: membership.spaceId,
                  type: 'PAYDAY_ROUTINE_READY',
                  title: 'Payday routine ready',
                  message: `${actions.length} planned ${actions.length === 1 ? 'action is' : 'actions are'} ready for you to review. No money has been moved.`,
                  dedupeKey: `payday-routine:${created.id}`,
                },
              });
            }
          }
        }
        await tx.auditEvent.create({
          data: { actorUserId: user.id, spaceId: membership.spaceId, action: source.type === 'SALARY' ? 'SALARY_CONFIRMED' : 'INCOME_RECORDED' },
        });
        return created;
      });
      return { id: record.id, amount: record.amount.toString(), receivedDate: toDateOnly(record.receivedDate), periodYear: record.periodYear, periodMonth: record.periodMonth };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Salary has already been confirmed for this month.');
      }
      throw error;
    }
  }
  @Get('spaces/:id/payday-routines') async paydayRoutines(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const [actions, entries] = await Promise.all([
      db.paydayRoutineAction.findMany({
        where: { spaceId: membership.spaceId },
        include: {
          source: { select: { id: true, name: true, currencyCode: true } },
          savingsAccount: { select: { id: true, name: true, currencyCode: true } },
          goal: { select: { id: true, name: true, currencyCode: true } },
          liability: { select: { id: true, name: true, currencyCode: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
      }),
      db.paydayRoutineEntry.findMany({
        where: { action: { spaceId: membership.spaceId } },
        include: {
          action: {
            include: {
              source: { select: { id: true, name: true, currencyCode: true } },
              savingsAccount: { select: { id: true, name: true, currencyCode: true } },
              goal: { select: { id: true, name: true, currencyCode: true } },
              liability: { select: { id: true, name: true, currencyCode: true } },
            },
          },
          incomeRecord: { select: { amount: true, receivedDate: true, periodYear: true, periodMonth: true } },
        },
        orderBy: [{ incomeRecord: { receivedDate: 'desc' } }, { createdAt: 'desc' }],
        take: 50,
      }),
    ]);
    const serializeAction = (action: typeof actions[number]) => ({
      id: action.id,
      source: action.source,
      type: action.type,
      name: action.name,
      plannedAmount: action.plannedAmount.toString(),
      isActive: action.isActive,
      target: action.savingsAccount ?? action.goal ?? action.liability,
    });
    return {
      actions: actions.map(serializeAction),
      entries: entries.map(entry => ({
        id: entry.id,
        type: entry.action.type,
        name: entry.action.name,
        source: entry.action.source,
        target: entry.action.savingsAccount ?? entry.action.goal ?? entry.action.liability,
        plannedAmount: entry.plannedAmount.toString(),
        completedAmount: entry.completedAmount.toString(),
        remainingAmount: subtractDecimals(entry.plannedAmount.toString(), entry.completedAmount.toString()),
        status: entry.status,
        salary: {
          amount: entry.incomeRecord.amount.toString(),
          receivedDate: toDateOnly(entry.incomeRecord.receivedDate),
          periodYear: entry.incomeRecord.periodYear,
          periodMonth: entry.incomeRecord.periodMonth,
        },
      })),
    };
  }
  @Post('spaces/:id/payday-routines') async createPaydayRoutineAction(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage payday routines in this space.');
    const input = validate(paydayRoutineActionInput, body);
    const source = await db.incomeSource.findFirst({ where: { id: input.sourceId, spaceId: membership.spaceId, isActive: true } });
    if (!source || source.type !== 'SALARY') throw new BadRequestException('Choose an active salary source for a payday routine.');
    const targetId = validate(z.string().uuid(), input.targetId);
    let targetCurrency: string;
    let target: { id: string; name: string };
    if (input.type === 'SAVINGS_DEPOSIT') {
      const account = await db.savingsAccount.findFirst({ where: { id: targetId, spaceId: membership.spaceId }, select: { id: true, name: true, currencyCode: true } });
      if (!account) throw new BadRequestException('Choose a savings account in this financial space.');
      targetCurrency = account.currencyCode.trim();
      target = { id: account.id, name: account.name };
    } else if (input.type === 'GOAL_CONTRIBUTION') {
      const goal = await db.financialGoal.findFirst({ where: { id: targetId, spaceId: membership.spaceId }, select: { id: true, name: true, currencyCode: true } });
      if (!goal) throw new BadRequestException('Choose a financial goal in this financial space.');
      targetCurrency = goal.currencyCode.trim();
      target = { id: goal.id, name: goal.name };
    } else {
      const liability = await db.liability.findFirst({ where: { id: targetId, spaceId: membership.spaceId, status: 'ACTIVE' }, select: { id: true, name: true, currencyCode: true } });
      if (!liability) throw new BadRequestException('Choose an active liability in this financial space.');
      targetCurrency = liability.currencyCode.trim();
      target = { id: liability.id, name: liability.name };
    }
    if (targetCurrency !== source.currencyCode.trim()) throw new BadRequestException('Routine and salary source currencies must match.');
    const action = await db.$transaction(async tx => {
      const created = await tx.paydayRoutineAction.create({
        data: {
          spaceId: membership.spaceId,
          sourceId: source.id,
          type: input.type,
          name: input.name,
          plannedAmount: input.plannedAmount,
          savingsAccountId: input.type === 'SAVINGS_DEPOSIT' ? targetId : undefined,
          goalId: input.type === 'GOAL_CONTRIBUTION' ? targetId : undefined,
          liabilityId: input.type === 'LIABILITY_PAYMENT' ? targetId : undefined,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'PAYDAY_ROUTINE_ACTION_CREATED' } });
      return created;
    });
    return { id: action.id, source: { id: source.id, name: source.name, currencyCode: source.currencyCode.trim() }, type: action.type, name: action.name, plannedAmount: action.plannedAmount.toString(), isActive: action.isActive, target };
  }
  @Post('spaces/:id/payday-routines/:actionId/status') async setPaydayRoutineActionStatus(@Req() req: Request, @Param('id') id: string, @Param('actionId') actionId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage payday routines in this space.');
    const validActionId = validate(z.string().uuid(), actionId);
    const { isActive } = validate(z.object({ isActive: z.boolean() }).strict(), body);
    return db.$transaction(async tx => {
      const updated = await tx.paydayRoutineAction.updateMany({
        where: { id: validActionId, spaceId: membership.spaceId },
        data: { isActive },
      });
      if (!updated.count) throw new NotFoundException();
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: isActive ? 'PAYDAY_ROUTINE_ACTION_ACTIVATED' : 'PAYDAY_ROUTINE_ACTION_DEACTIVATED' } });
      return { id: validActionId, isActive };
    });
  }
  @Post('spaces/:id/payday-routines/:entryId/complete') async completePaydayRoutineEntry(@Req() req: Request, @Param('id') id: string, @Param('entryId') entryId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to update payday routines in this space.');
    const validEntryId = validate(z.string().uuid(), entryId);
    const input = validate(paydayRoutineCompletionInput, body);
    if (input.completedDate > toDateOnly(new Date())) throw new BadRequestException('Routine completion date cannot be in the future.');
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT entry."id" FROM "PaydayRoutineEntry" entry INNER JOIN "PaydayRoutineAction" action ON action."id" = entry."actionId" WHERE entry."id" = ${validEntryId} AND action."spaceId" = ${membership.spaceId} FOR UPDATE OF entry`;
      const entry = await tx.paydayRoutineEntry.findFirst({
        where: { id: validEntryId, action: { spaceId: membership.spaceId } },
        include: {
          action: { include: { savingsAccount: true, goal: true, liability: true } },
          incomeRecord: { select: { receivedDate: true } },
        },
      });
      if (!entry) throw new NotFoundException();
      if (entry.status === 'COMPLETED' || entry.status === 'SKIPPED') throw new BadRequestException('This payday routine item is already closed.');
      if (input.completedDate < toDateOnly(entry.incomeRecord.receivedDate)) throw new BadRequestException('Completion date cannot be before salary was received.');
      const remaining = subtractDecimals(entry.plannedAmount.toString(), entry.completedAmount.toString());
      if (decimalToUnits(input.amount) > decimalToUnits(remaining)) throw new BadRequestException('The recorded amount cannot exceed the remaining planned amount.');
      if (entry.action.type === 'SAVINGS_DEPOSIT' && entry.action.savingsAccount) {
        const account = entry.action.savingsAccount;
        await tx.$queryRaw`SELECT "id" FROM "SavingsAccount" WHERE "id" = ${account.id} AND "spaceId" = ${membership.spaceId} FOR UPDATE`;
        const openedAt = toDateOnly(account.openedAt);
        if (input.completedDate < openedAt) throw new BadRequestException('Completion date cannot be before the savings account was opened.');
        await tx.savingsTransaction.create({
          data: { accountId: account.id, type: 'DEPOSIT', amount: input.amount, transactionDate: new Date(`${input.completedDate}T00:00:00.000Z`), description: input.description ?? entry.action.name, createdBy: user.id },
        });
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'SAVINGS_DEPOSIT_RECORDED' } });
      } else if (entry.action.type === 'GOAL_CONTRIBUTION' && entry.action.goal) {
        await tx.goalContribution.create({
          data: { goalId: entry.action.goal.id, type: 'CONTRIBUTION', amount: input.amount, contributionDate: new Date(`${input.completedDate}T00:00:00.000Z`), description: input.description ?? entry.action.name, createdBy: user.id },
        });
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'GOAL_CONTRIBUTION_RECORDED' } });
      } else if (entry.action.type === 'LIABILITY_PAYMENT' && entry.action.liability) {
        const liabilityId = entry.action.liability.id;
        await tx.$queryRaw`SELECT "id" FROM "Liability" WHERE "id" = ${liabilityId} AND "spaceId" = ${membership.spaceId} FOR UPDATE`;
        const liability = await tx.liability.findFirst({ where: { id: liabilityId, spaceId: membership.spaceId } });
        if (!liability || liability.status === 'PAID_OFF') throw new BadRequestException('This liability is no longer active.');
        if (input.completedDate < toDateOnly(liability.startDate)) throw new BadRequestException('Completion date cannot be before the debt started.');
        const principalAmount = input.principalAmount ?? input.amount;
        if (decimalToUnits(principalAmount) > decimalToUnits(input.amount)) throw new BadRequestException('Principal paid cannot exceed the total payment.');
        const principalAggregate = await tx.liabilityPayment.aggregate({ where: { liabilityId }, _sum: { principalAmount: true } });
        const principalPaid = principalAggregate._sum.principalAmount?.toString() ?? '0';
        const outstanding = subtractDecimals(liability.openingBalance.toString(), principalPaid);
        if (decimalToUnits(principalAmount) > decimalToUnits(outstanding)) throw new BadRequestException('Principal paid cannot exceed the outstanding balance.');
        const newBalance = subtractDecimals(outstanding, principalAmount);
        await tx.liabilityPayment.create({
          data: { liabilityId, amount: input.amount, principalAmount, paidAt: new Date(`${input.completedDate}T00:00:00.000Z`), description: input.description ?? entry.action.name, createdBy: user.id },
        });
        if (newBalance === '0') await tx.liability.update({ where: { id: liabilityId }, data: { status: 'PAID_OFF' } });
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: newBalance === '0' ? 'LIABILITY_PAID_OFF' : 'LIABILITY_PAYMENT_RECORDED' } });
      } else {
        throw new BadRequestException('This payday routine target is no longer available.');
      }
      const completedAmount = addDecimals(entry.completedAmount.toString(), input.amount);
      const status = decimalToUnits(completedAmount) === decimalToUnits(entry.plannedAmount.toString()) ? 'COMPLETED' : 'PARTIALLY_COMPLETED';
      const updated = await tx.paydayRoutineEntry.update({ where: { id: entry.id }, data: { completedAmount, status } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: status === 'COMPLETED' ? 'PAYDAY_ROUTINE_ACTION_COMPLETED' : 'PAYDAY_ROUTINE_ACTION_PARTIALLY_COMPLETED' } });
      return { id: updated.id, plannedAmount: updated.plannedAmount.toString(), completedAmount: updated.completedAmount.toString(), remainingAmount: subtractDecimals(updated.plannedAmount.toString(), updated.completedAmount.toString()), status: updated.status };
    });
  }
  @Post('spaces/:id/payday-routines/:entryId/skip') async skipPaydayRoutineEntry(@Req() req: Request, @Param('id') id: string, @Param('entryId') entryId: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to update payday routines in this space.');
    const validEntryId = validate(z.string().uuid(), entryId);
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT entry."id" FROM "PaydayRoutineEntry" entry INNER JOIN "PaydayRoutineAction" action ON action."id" = entry."actionId" WHERE entry."id" = ${validEntryId} AND action."spaceId" = ${membership.spaceId} FOR UPDATE OF entry`;
      const entry = await tx.paydayRoutineEntry.findFirst({ where: { id: validEntryId, action: { spaceId: membership.spaceId } } });
      if (!entry) throw new NotFoundException();
      if (entry.status === 'COMPLETED' || entry.status === 'SKIPPED') throw new BadRequestException('This payday routine item is already closed.');
      const updated = await tx.paydayRoutineEntry.update({ where: { id: entry.id }, data: { status: 'SKIPPED' } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'PAYDAY_ROUTINE_ACTION_SKIPPED' } });
      return { id: updated.id, status: updated.status, completedAmount: updated.completedAmount.toString(), plannedAmount: updated.plannedAmount.toString() };
    });
  }
  @Get('spaces/:id/recurring-records') async recurringRecords(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const today = toDateOnly(new Date());
    const records = await db.recurringRecord.findMany({
      where: { spaceId: membership.spaceId },
      include: { category: { select: { id: true, name: true } }, source: { select: { id: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }, { name: 'asc' }],
    });
    return records.map(record => ({
      id: record.id,
      name: record.name,
      flow: record.flow,
      amount: record.amount.toString(),
      currencyCode: record.currencyCode.trim(),
      frequency: record.frequency,
      startDate: toDateOnly(record.startDate),
      nextDueDate: toDateOnly(record.nextDueDate),
      endDate: record.endDate ? toDateOnly(record.endDate) : null,
      isActive: record.isActive,
      isDue: record.isActive && toDateOnly(record.nextDueDate) <= today,
      category: record.category,
      source: record.source,
    }));
  }
  @Post('spaces/:id/recurring-records') async createRecurringRecord(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage recurring records in this space.');
    const input = validate(recurringInput, body);
    let categoryId: string | undefined;
    let sourceId: string | undefined;
    if (input.flow === 'EXPENSE') {
      const category = await db.category.findFirst({ where: { id: input.categoryId, spaceId: membership.spaceId, type: 'EXPENSE', isArchived: false }, select: { id: true } });
      if (!category) throw new BadRequestException('Choose an active expense category in this space.');
      categoryId = category.id;
    } else {
      const source = await db.incomeSource.findFirst({ where: { id: input.sourceId, spaceId: membership.spaceId, isActive: true, type: { not: 'SALARY' } }, select: { id: true, currencyCode: true } });
      if (!source) throw new BadRequestException('Choose an active non-salary income source in this space. Salary is confirmed from the income screen.');
      if (source.currencyCode.trim() !== membership.space.baseCurrency.trim()) throw new BadRequestException('Recurring income must use the financial space base currency.');
      sourceId = source.id;
    }
    const record = await db.$transaction(async tx => {
      const created = await tx.recurringRecord.create({
        data: {
          spaceId: membership.spaceId,
          name: input.name,
          flow: input.flow,
          amount: input.amount,
          currencyCode: membership.space.baseCurrency,
          frequency: input.frequency,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          nextDueDate: new Date(`${input.startDate}T00:00:00.000Z`),
          endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : undefined,
          dayOfMonth: Number(input.startDate.slice(8, 10)),
          monthOfYear: Number(input.startDate.slice(5, 7)),
          categoryId,
          sourceId,
          createdBy: user.id,
        },
        include: { category: { select: { id: true, name: true } }, source: { select: { id: true, name: true } } },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'RECURRING_RECORD_CREATED' } });
      return created;
    });
    return { id: record.id, name: record.name, flow: record.flow, amount: record.amount.toString(), currencyCode: record.currencyCode.trim(), frequency: record.frequency, startDate: toDateOnly(record.startDate), nextDueDate: toDateOnly(record.nextDueDate), endDate: record.endDate ? toDateOnly(record.endDate) : null, isActive: record.isActive, category: record.category, source: record.source };
  }
  @Post('spaces/:id/recurring-records/:recordId/status') async setRecurringStatus(@Req() req: Request, @Param('id') id: string, @Param('recordId') recordId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage recurring records in this space.');
    const { isActive } = validate(z.object({ isActive: z.boolean() }).strict(), body);
    const validId = validate(z.string().uuid(), recordId);
    const existing = await db.recurringRecord.findFirst({ where: { id: validId, spaceId: membership.spaceId } });
    if (!existing) throw new NotFoundException();
    if (isActive && existing.endDate && toDateOnly(existing.endDate) < toDateOnly(new Date())) throw new BadRequestException('This recurring record has passed its end date.');
    const updated = await db.$transaction(async tx => {
      const result = await tx.recurringRecord.update({ where: { id: existing.id }, data: { isActive } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: isActive ? 'RECURRING_RECORD_RESUMED' : 'RECURRING_RECORD_PAUSED' } });
      return result;
    });
    return { id: updated.id, isActive: updated.isActive };
  }
  @Post('spaces/:id/recurring-records/:recordId/record') async recordRecurringOccurrence(@Req() req: Request, @Param('id') id: string, @Param('recordId') recordId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record transactions in this space.');
    const input = validate(z.object({ actualDate: dateOnly.optional() }).strict(), body);
    const validId = validate(z.string().uuid(), recordId);
    const rule = await db.recurringRecord.findFirst({ where: { id: validId, spaceId: membership.spaceId, isActive: true } });
    if (!rule) throw new NotFoundException();
    const dueDate = toDateOnly(rule.nextDueDate);
    const today = toDateOnly(new Date());
    const actualDate = input.actualDate ?? today;
    if (dueDate > today) throw new BadRequestException('This recurring record is not due yet.');
    if (actualDate < toDateOnly(rule.startDate) || actualDate > today) throw new BadRequestException('Enter an actual date between the start date and today.');
    const nextDueDate = nextRecurringDate(dueDate, rule.frequency, rule.dayOfMonth, rule.monthOfYear);
    const isActive = !rule.endDate || nextDueDate <= toDateOnly(rule.endDate);
    try {
      const result = await db.$transaction(async tx => {
        const occurrenceData = { recurringRecordId: rule.id, dueDate: new Date(`${dueDate}T00:00:00.000Z`), actualDate: new Date(`${actualDate}T00:00:00.000Z`) };
        const transaction = rule.flow === 'EXPENSE'
          ? await tx.expenseRecord.create({
            data: { space: { connect: { id: membership.spaceId } }, category: { connect: { id: rule.categoryId! } }, creator: { connect: { id: user.id } }, amount: rule.amount, currencyCode: rule.currencyCode, spentAt: new Date(`${actualDate}T00:00:00.000Z`), description: rule.name, recurringOccurrence: { create: occurrenceData } },
          })
          : await tx.incomeRecord.create({
            data: { source: { connect: { id: rule.sourceId! } }, amount: rule.amount, receivedDate: new Date(`${actualDate}T00:00:00.000Z`), recurringOccurrence: { create: occurrenceData } },
          });
        const advanced = await tx.recurringRecord.updateMany({
          where: { id: rule.id, spaceId: membership.spaceId, isActive: true, nextDueDate: new Date(`${dueDate}T00:00:00.000Z`) },
          data: { nextDueDate: new Date(`${nextDueDate}T00:00:00.000Z`), isActive },
        });
        if (advanced.count !== 1) throw new ConflictException('This recurring date has already been recorded.');
        await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: rule.flow === 'EXPENSE' ? 'RECURRING_EXPENSE_RECORDED' : 'RECURRING_INCOME_RECORDED' } });
        return transaction;
      });
      return { id: result.id, amount: result.amount.toString(), actualDate, dueDate, flow: rule.flow };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This recurring date has already been recorded.');
      throw error;
    }
  }
  @Get('spaces/:id/budgets') async budgets(@Req() req: Request, @Param('id') id: string, @Query('month') month?: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const selectedMonth = validate(monthPeriod.default(currentMonth()), month);
    const { from, until } = monthBounds(selectedMonth);
    const { year, month: monthNumber } = monthParts(selectedMonth);
    const [budget, groups] = await Promise.all([
      db.budget.findUnique({ where: { spaceId_year_month: { spaceId: membership.spaceId, year, month: monthNumber } }, include: { allocations: { include: { category: { select: { id: true, name: true } } } } } }),
      db.expenseRecord.groupBy({ by: ['categoryId'], where: { spaceId: membership.spaceId, spentAt: { gte: from, lt: until } }, _sum: { amount: true } }),
    ]);
    const spentByCategory = new Map(groups.map(group => [group.categoryId, group._sum.amount?.toString() ?? '0']));
    const allocations = budget?.allocations.map(allocation => {
      const limit = allocation.limitAmount.toString();
      const spent = spentByCategory.get(allocation.categoryId) ?? '0';
      return { id: allocation.id, categoryId: allocation.categoryId, category: allocation.category, limit, spent, remaining: subtractDecimals(limit, spent) };
    }) ?? [];
    return { month: selectedMonth, currencyCode: membership.space.baseCurrency.trim(), totalLimit: addDecimals(...allocations.map(allocation => allocation.limit)), totalSpent: addDecimals(...allocations.map(allocation => allocation.spent)), allocations };
  }
  @Post('spaces/:id/budgets/allocations') async setBudgetAllocation(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage budgets in this space.');
    const input = validate(z.object({ month: monthPeriod, categoryId: z.string().uuid(), limitAmount: amount }).strict(), body);
    const category = await db.category.findFirst({ where: { id: input.categoryId, spaceId: membership.spaceId, type: 'EXPENSE', isArchived: false }, select: { id: true } });
    if (!category) throw new BadRequestException('Choose an active expense category in this space.');
    const { year, month } = monthParts(input.month);
    const allocation = await db.$transaction(async tx => {
      const budget = await tx.budget.upsert({
        where: { spaceId_year_month: { spaceId: membership.spaceId, year, month } },
        create: { spaceId: membership.spaceId, year, month, createdBy: user.id },
        update: {},
      });
      const saved = await tx.budgetAllocation.upsert({
        where: { budgetId_categoryId: { budgetId: budget.id, categoryId: category.id } },
        create: { budgetId: budget.id, categoryId: category.id, limitAmount: input.limitAmount },
        update: { limitAmount: input.limitAmount },
        include: { category: { select: { id: true, name: true } } },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'BUDGET_ALLOCATION_SET' } });
      return saved;
    });
    return { id: allocation.id, category: allocation.category, limit: allocation.limitAmount.toString() };
  }
  @Get('spaces/:id/expenses') async expenses(@Req() req: Request, @Param('id') id: string, @Query('month') month?: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const selectedMonth = validate(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default(toDateOnly(new Date()).slice(0, 7)), month);
    const { from, until } = monthBounds(selectedMonth);
    const [records, total] = await Promise.all([
      db.expenseRecord.findMany({
        where: { spaceId: membership.spaceId, spentAt: { gte: from, lt: until } },
        include: { category: { select: { id: true, name: true } } },
        orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
      }),
      db.expenseRecord.aggregate({ where: { spaceId: membership.spaceId, spentAt: { gte: from, lt: until } }, _sum: { amount: true } }),
    ]);
    return {
      month: selectedMonth,
      currencyCode: membership.space.baseCurrency.trim(),
      total: total._sum.amount?.toString() ?? '0',
      records: records.map(record => ({
        id: record.id,
        category: record.category,
        amount: record.amount.toString(),
        currencyCode: record.currencyCode.trim(),
        spentAt: toDateOnly(record.spentAt),
        description: record.description,
      })),
    };
  }
  @Post('spaces/:id/expenses') async recordExpense(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record expenses in this space.');
    const input = validate(expenseInput, body);
    if (input.spentAt > toDateOnly(new Date())) throw new BadRequestException('Expense date cannot be in the future.');
    const category = await db.category.findFirst({ where: { id: input.categoryId, spaceId: membership.spaceId, type: 'EXPENSE', isArchived: false }, select: { id: true } });
    if (!category) throw new BadRequestException('Choose an active expense category in this space.');
    const record = await db.$transaction(async tx => {
      const created = await tx.expenseRecord.create({
        data: {
          spaceId: membership.spaceId,
          categoryId: category.id,
          amount: input.amount,
          currencyCode: membership.space.baseCurrency,
          spentAt: new Date(`${input.spentAt}T00:00:00.000Z`),
          description: input.description,
          createdBy: user.id,
        },
        include: { category: { select: { id: true, name: true } } },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'EXPENSE_RECORDED' } });
      return created;
    });
    return { id: record.id, category: record.category, amount: record.amount.toString(), currencyCode: record.currencyCode.trim(), spentAt: toDateOnly(record.spentAt), description: record.description };
  }
  @Get('spaces/:id/savings-accounts') async savingsAccounts(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const accounts = await db.savingsAccount.findMany({
      where: { spaceId: membership.spaceId },
      include: { transactions: { orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }], take: 10 } },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
    const aggregates = accounts.length ? await db.savingsTransaction.groupBy({
      by: ['accountId', 'type'],
      where: { accountId: { in: accounts.map(account => account.id) } },
      _sum: { amount: true },
    }) : [];
    const aggregateAmounts = new Map(aggregates.map(item => [`${item.accountId}:${item.type}`, item._sum.amount?.toString() ?? '0']));
    const totalsByCurrency = new Map<string, string>();
    const result = accounts.map(account => {
      const currencyCode = account.currencyCode.trim();
      let balance = account.openingBalance.toString();
      balance = addDecimals(balance, aggregateAmounts.get(`${account.id}:DEPOSIT`) ?? '0');
      balance = subtractDecimals(balance, aggregateAmounts.get(`${account.id}:WITHDRAWAL`) ?? '0');
      totalsByCurrency.set(currencyCode, addDecimals(totalsByCurrency.get(currencyCode) ?? '0', balance));
      return {
        id: account.id,
        name: account.name,
        provider: account.provider,
        currencyCode,
        openingBalance: account.openingBalance.toString(),
        openedAt: toDateOnly(account.openedAt),
        balance,
        createdAt: account.createdAt,
        transactions: account.transactions.map(transaction => ({
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount.toString(),
          transactionDate: toDateOnly(transaction.transactionDate),
          description: transaction.description,
          createdAt: transaction.createdAt,
        })),
      };
    });
    return { baseCurrency: membership.space.baseCurrency.trim(), totalsByCurrency: Object.fromEntries(totalsByCurrency), accounts: result };
  }
  @Post('spaces/:id/savings-accounts') async createSavingsAccount(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage savings in this space.');
    const input = validate(savingsAccountInput, body);
    const openedAt = input.openedAt ?? toDateOnly(new Date());
    if (openedAt > toDateOnly(new Date())) throw new BadRequestException('Account opening date cannot be in the future.');
    const account = await db.$transaction(async tx => {
      const created = await tx.savingsAccount.create({
        data: {
          spaceId: membership.spaceId,
          name: input.name,
          provider: input.provider,
          currencyCode: input.currencyCode ?? membership.space.baseCurrency,
          openingBalance: input.openingBalance,
          openedAt: new Date(`${openedAt}T00:00:00.000Z`),
          createdBy: user.id,
        },
      });
      if (membership.space.type === 'HOUSEHOLD') {
        await tx.householdOwnershipAllocation.create({
          data: {
            spaceId: membership.spaceId,
            entityType: 'SAVINGS_ACCOUNT',
            entityId: created.id,
            ownerUserId: user.id,
            percentage: '100',
          },
        });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'SAVINGS_ACCOUNT_CREATED' } });
      return created;
    });
    return {
      id: account.id,
      name: account.name,
      provider: account.provider,
      currencyCode: account.currencyCode.trim(),
      openingBalance: account.openingBalance.toString(),
      openedAt: toDateOnly(account.openedAt),
      balance: account.openingBalance.toString(),
      transactions: [],
    };
  }
  @Post('spaces/:id/savings-accounts/:accountId/transactions') async recordSavingsTransaction(@Req() req: Request, @Param('id') id: string, @Param('accountId') accountId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record savings in this space.');
    const validAccountId = validate(z.string().uuid(), accountId);
    const input = validate(savingsTransactionInput, body);
    if (input.transactionDate > toDateOnly(new Date())) throw new BadRequestException('Savings transaction date cannot be in the future.');
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "SavingsAccount" WHERE "id" = ${validAccountId} AND "spaceId" = ${membership.spaceId} FOR UPDATE`;
      const account = await tx.savingsAccount.findFirst({
        where: { id: validAccountId, spaceId: membership.spaceId },
        include: { transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (!account) throw new NotFoundException();
      if (input.transactionDate < toDateOnly(account.openedAt)) throw new BadRequestException('Transaction date cannot be before this account was opened.');
      let balance = decimalToUnits(account.openingBalance.toString());
      let inserted = false;
      const apply = (type: 'DEPOSIT' | 'WITHDRAWAL', value: string) => {
        const units = decimalToUnits(value);
        balance += type === 'DEPOSIT' ? units : -units;
        if (balance < 0n) throw new BadRequestException('This withdrawal would make the savings balance negative based on the dated account history.');
      };
      for (const transaction of account.transactions) {
        if (!inserted && toDateOnly(transaction.transactionDate) > input.transactionDate) {
          apply(input.type, input.amount);
          inserted = true;
        }
        apply(transaction.type, transaction.amount.toString());
      }
      if (!inserted) apply(input.type, input.amount);
      const transaction = await tx.savingsTransaction.create({
        data: {
          accountId: account.id,
          type: input.type,
          amount: input.amount,
          transactionDate: new Date(`${input.transactionDate}T00:00:00.000Z`),
          description: input.description,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({
        data: { actorUserId: user.id, spaceId: membership.spaceId, action: input.type === 'DEPOSIT' ? 'SAVINGS_DEPOSIT_RECORDED' : 'SAVINGS_WITHDRAWAL_RECORDED' },
      });
      return {
        id: transaction.id,
        accountId: transaction.accountId,
        type: transaction.type,
        amount: transaction.amount.toString(),
        currencyCode: account.currencyCode.trim(),
        transactionDate: toDateOnly(transaction.transactionDate),
        description: transaction.description,
      };
    });
  }
  @Get('spaces/:id/investments') async investments(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const today = new Date(`${toDateOnly(new Date())}T00:00:00.000Z`);
    const accounts = await db.investmentAccount.findMany({
      where: { spaceId: membership.spaceId },
      include: {
        investments: {
          include: {
            transactions: { orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }] },
            valuations: { orderBy: [{ valuationDate: 'desc' }, { createdAt: 'desc' }] },
          },
          orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
    const totalsByCurrency = new Map<string, string>();
    for (const account of accounts) {
      for (const investment of account.investments) {
        const value = investmentValueAt(investment, today);
        if (value !== null) totalsByCurrency.set(investment.currencyCode.trim(), addDecimals(totalsByCurrency.get(investment.currencyCode.trim()) ?? '0', value));
      }
    }
    return {
      baseCurrency: membership.space.baseCurrency.trim(),
      totalsByCurrency: Object.fromEntries(totalsByCurrency),
      accounts: accounts.map(account => ({
        id: account.id,
        name: account.name,
        provider: account.provider,
        currencyCode: account.currencyCode.trim(),
        investments: account.investments.map(investment => {
          const currentValue = investmentValueAt(investment, today);
          const latestValuation = investment.valuations.find(item => item.valuationDate <= today);
          return {
            id: investment.id,
            type: investment.type,
            name: investment.name,
            currencyCode: investment.currencyCode.trim(),
            costBasis: investment.costBasis.toString(),
            startDate: toDateOnly(investment.startDate),
            maturityDate: investment.maturityDate ? toDateOnly(investment.maturityDate) : null,
            annualInterestRate: investment.annualInterestRate?.toString() ?? null,
            interestMethod: investment.interestMethod,
            compoundingFrequency: investment.compoundingFrequency,
            expectedMaturityValue: investment.expectedMaturityValue?.toString() ?? null,
            actualMaturityValue: investment.actualMaturityValue?.toString() ?? null,
            status: investment.status,
            maturityStatus: investment.status === 'CLOSED' ? 'CLOSED' : investment.type === 'FIXED_DEPOSIT' && investment.maturityDate && investment.maturityDate <= today ? 'MATURED' : 'ACTIVE',
            quantity: calculateInvestmentQuantity(investment.transactions, today).toString(),
            currentValue,
            valuationMethod: investment.type === 'FIXED_DEPOSIT' ? 'CONTRACTUAL' : latestValuation?.method ?? null,
            valuationDate: investment.type === 'FIXED_DEPOSIT' ? toDateOnly(today) : latestValuation ? toDateOnly(latestValuation.valuationDate) : null,
            transactions: investment.transactions.slice(0, 20).map(transaction => ({
              id: transaction.id,
              type: transaction.type,
              amount: transaction.amount.toString(),
              quantity: transaction.quantity?.toString() ?? null,
              transactionDate: toDateOnly(transaction.transactionDate),
              description: transaction.description,
            })),
            valuations: investment.valuations.slice(0, 20).map(valuation => ({
              id: valuation.id,
              valuationDate: toDateOnly(valuation.valuationDate),
              marketValue: valuation.marketValue.toString(),
              unitPrice: valuation.unitPrice?.toString() ?? null,
              currencyCode: valuation.currencyCode.trim(),
              method: valuation.method,
            })),
          };
        }),
      })),
    };
  }
  @Post('spaces/:id/investment-accounts') async createInvestmentAccount(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage investments in this space.');
    const input = validate(investmentAccountInput, body);
    const account = await db.$transaction(async tx => {
      const created = await tx.investmentAccount.create({
        data: {
          spaceId: membership.spaceId,
          name: input.name,
          provider: input.provider,
          currencyCode: input.currencyCode ?? membership.space.baseCurrency,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'INVESTMENT_ACCOUNT_CREATED' } });
      return created;
    });
    return { id: account.id, name: account.name, provider: account.provider, currencyCode: account.currencyCode.trim(), investments: [] };
  }
  @Post('spaces/:id/investment-accounts/:accountId/investments') async createInvestment(@Req() req: Request, @Param('id') id: string, @Param('accountId') accountId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage investments in this space.');
    const validAccountId = validate(z.string().uuid(), accountId);
    const input = validate(investmentInput, body);
    const today = toDateOnly(new Date());
    if (input.startDate > today) throw new BadRequestException('Investment start date cannot be in the future.');
    const created = await db.$transaction(async tx => {
      const account = await tx.investmentAccount.findFirst({ where: { id: validAccountId, spaceId: membership.spaceId } });
      if (!account) throw new NotFoundException();
      if (input.quantity && decimalToUnits(input.costBasis) <= 0n) throw new BadRequestException('Enter a positive cost basis when adding opening units.');
      const currencyCode = input.currencyCode ?? account.currencyCode;
      const maturityDate = input.maturityDate ? new Date(`${input.maturityDate}T00:00:00.000Z`) : null;
      const expectedMaturityValue = input.type === 'FIXED_DEPOSIT' && maturityDate
        ? calculateFixedDepositValue({
          principal: input.costBasis,
          annualInterestRate: input.annualInterestRate!,
          interestMethod: input.interestMethod!,
          compoundingFrequency: input.compoundingFrequency!,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          maturityDate,
          valuationDate: maturityDate,
        })
        : null;
      const investment = await tx.investment.create({
        data: {
          accountId: account.id,
          type: input.type,
          name: input.name,
          currencyCode,
          costBasis: input.costBasis,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          maturityDate,
          annualInterestRate: input.type === 'FIXED_DEPOSIT' ? input.annualInterestRate : null,
          interestMethod: input.type === 'FIXED_DEPOSIT' ? input.interestMethod : null,
          compoundingFrequency: input.type === 'FIXED_DEPOSIT' ? input.compoundingFrequency : null,
          expectedMaturityValue,
          createdBy: user.id,
        },
      });
      if (membership.space.type === 'HOUSEHOLD') {
        await tx.householdOwnershipAllocation.create({
          data: {
            spaceId: membership.spaceId,
            entityType: 'INVESTMENT',
            entityId: investment.id,
            ownerUserId: user.id,
            percentage: '100',
          },
        });
      }
      if (decimalToUnits(input.costBasis) > 0n) {
        await tx.investmentTransaction.create({
          data: {
            investmentId: investment.id,
            type: input.type === 'FIXED_DEPOSIT' ? 'CONTRIBUTION' : input.quantity ? 'BUY' : 'CONTRIBUTION',
            amount: input.costBasis,
            quantity: input.quantity,
            transactionDate: investment.startDate,
            description: 'Opening investment',
            createdBy: user.id,
          },
        });
      }
      if (input.type === 'FIXED_DEPOSIT') {
        await tx.investmentValuation.create({
          data: {
            investmentId: investment.id,
            valuationDate: investment.startDate,
            marketValue: input.costBasis,
            currencyCode,
            method: 'CONTRACTUAL',
            createdBy: user.id,
          },
        });
        await tx.investmentValuation.create({
          data: {
            investmentId: investment.id,
            valuationDate: maturityDate!,
            marketValue: expectedMaturityValue!,
            currencyCode,
            method: 'CONTRACTUAL',
            createdBy: user.id,
          },
        });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'INVESTMENT_CREATED' } });
      return investment;
    });
    return { id: created.id, type: created.type, name: created.name, currencyCode: created.currencyCode.trim(), costBasis: created.costBasis.toString(), startDate: toDateOnly(created.startDate), maturityDate: created.maturityDate ? toDateOnly(created.maturityDate) : null, expectedMaturityValue: created.expectedMaturityValue?.toString() ?? null };
  }
  @Post('spaces/:id/investments/:investmentId/transactions') async recordInvestmentTransaction(@Req() req: Request, @Param('id') id: string, @Param('investmentId') investmentId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record investment transactions in this space.');
    const validInvestmentId = validate(z.string().uuid(), investmentId);
    const input = validate(investmentTransactionInput, body);
    if (input.transactionDate > toDateOnly(new Date())) throw new BadRequestException('Investment transaction date cannot be in the future.');
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT i."id" FROM "Investment" i JOIN "InvestmentAccount" a ON a."id" = i."accountId" WHERE i."id" = ${validInvestmentId} AND a."spaceId" = ${membership.spaceId} FOR UPDATE OF i`;
      const investment = await tx.investment.findFirst({
        where: { id: validInvestmentId, account: { spaceId: membership.spaceId } },
        include: { transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (!investment) throw new NotFoundException();
      if (investment.status === 'CLOSED') throw new BadRequestException('Closed investments cannot receive new transactions.');
      if (investment.type === 'FIXED_DEPOSIT' && input.quantity) throw new BadRequestException('Fixed deposits do not have tradable units.');
      if (input.transactionDate < toDateOnly(investment.startDate)) throw new BadRequestException('Transaction date cannot be before the investment start date.');
      if (investment.type === 'FIXED_DEPOSIT' && investment.maturityDate && input.transactionDate > toDateOnly(investment.maturityDate)) {
        throw new BadRequestException('Fixed-deposit transactions cannot be dated after maturity.');
      }
      if (input.quantity && !validateInvestmentQuantityHistory(investment.transactions.map(transaction => ({
        id: transaction.id,
        type: transaction.type,
        quantity: transaction.quantity?.toString() ?? null,
        transactionDate: transaction.transactionDate,
        createdAt: transaction.createdAt,
      })), {
        type: input.type,
        quantity: input.quantity,
        transactionDate: new Date(`${input.transactionDate}T00:00:00.000Z`),
      })) {
        throw new BadRequestException('This transaction would make the dated investment units negative.');
      }
      const transaction = await tx.investmentTransaction.create({
        data: {
          investmentId: investment.id,
          type: input.type,
          amount: input.amount,
          quantity: input.quantity,
          transactionDate: new Date(`${input.transactionDate}T00:00:00.000Z`),
          description: input.description,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: `INVESTMENT_${input.type}_RECORDED` } });
      return { id: transaction.id, type: transaction.type, amount: transaction.amount.toString(), quantity: transaction.quantity?.toString() ?? null, currencyCode: investment.currencyCode.trim(), transactionDate: toDateOnly(transaction.transactionDate), description: transaction.description };
    });
  }
  @Post('spaces/:id/investments/:investmentId/valuations') async recordInvestmentValuation(@Req() req: Request, @Param('id') id: string, @Param('investmentId') investmentId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record investment valuations in this space.');
    const validInvestmentId = validate(z.string().uuid(), investmentId);
    const input = validate(investmentValuationInput, body);
    const today = toDateOnly(new Date());
    if (input.valuationDate > today) throw new BadRequestException('Valuation date cannot be in the future.');
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT i."id" FROM "Investment" i JOIN "InvestmentAccount" a ON a."id" = i."accountId" WHERE i."id" = ${validInvestmentId} AND a."spaceId" = ${membership.spaceId} FOR UPDATE OF i`;
      const investment = await tx.investment.findFirst({
        where: { id: validInvestmentId, account: { spaceId: membership.spaceId } },
        include: { transactions: { orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (!investment) throw new NotFoundException();
      if (investment.status === 'CLOSED') throw new BadRequestException('Closed investments cannot be revalued.');
      if (investment.type === 'FIXED_DEPOSIT') throw new BadRequestException('Fixed deposits use calculated contractual valuations.');
      if (input.valuationDate < toDateOnly(investment.startDate)) throw new BadRequestException('Valuation date cannot be before the investment start date.');
      if (input.method === 'QUANTITY_X_PRICE' && calculateInvestmentQuantity(investment.transactions.map(transaction => ({
        type: transaction.type,
        quantity: transaction.quantity?.toString() ?? null,
        transactionDate: transaction.transactionDate,
      })), new Date(`${input.valuationDate}T00:00:00.000Z`)).lessThanOrEqualTo(0)) {
        throw new BadRequestException('Quantity × price valuation requires positive units held on that date.');
      }
      const marketValue = input.method === 'MANUAL'
        ? input.marketValue!
        : calculateInvestmentQuantity(investment.transactions.map(transaction => ({
          type: transaction.type,
          quantity: transaction.quantity?.toString() ?? null,
          transactionDate: transaction.transactionDate,
        })), new Date(`${input.valuationDate}T00:00:00.000Z`)).mul(input.unitPrice!).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
      const valuation = await tx.investmentValuation.create({
        data: {
          investmentId: investment.id,
          valuationDate: new Date(`${input.valuationDate}T00:00:00.000Z`),
          marketValue,
          unitPrice: input.method === 'QUANTITY_X_PRICE' ? input.unitPrice : null,
          currencyCode: investment.currencyCode,
          method: input.method,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: `INVESTMENT_VALUATION_${input.method}_RECORDED` } });
      return { id: valuation.id, valuationDate: toDateOnly(valuation.valuationDate), marketValue: valuation.marketValue.toString(), unitPrice: valuation.unitPrice?.toString() ?? null, currencyCode: valuation.currencyCode.trim(), method: valuation.method };
    });
  }
  @Post('spaces/:id/investments/:investmentId/maturity') async recordInvestmentMaturity(@Req() req: Request, @Param('id') id: string, @Param('investmentId') investmentId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record fixed-deposit maturity in this space.');
    const validInvestmentId = validate(z.string().uuid(), investmentId);
    const input = validate(investmentMaturityInput, body);
    const today = toDateOnly(new Date());
    if (input.maturityDate > today) throw new BadRequestException('Maturity payout date cannot be in the future.');
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT i."id" FROM "Investment" i JOIN "InvestmentAccount" a ON a."id" = i."accountId" WHERE i."id" = ${validInvestmentId} AND a."spaceId" = ${membership.spaceId} FOR UPDATE OF i`;
      const investment = await tx.investment.findFirst({ where: { id: validInvestmentId, account: { spaceId: membership.spaceId } } });
      if (!investment) throw new NotFoundException();
      if (investment.type !== 'FIXED_DEPOSIT' || !investment.maturityDate) throw new BadRequestException('Only fixed deposits have a maturity payout.');
      if (investment.status === 'CLOSED') throw new BadRequestException('This fixed deposit already has a recorded maturity payout.');
      if (input.maturityDate < toDateOnly(investment.maturityDate)) throw new BadRequestException('Payout date cannot be before the contracted maturity date.');
      const date = new Date(`${input.maturityDate}T00:00:00.000Z`);
      const valuation = await tx.investmentValuation.create({
        data: {
          investmentId: investment.id,
          valuationDate: date,
          marketValue: input.actualMaturityValue,
          currencyCode: investment.currencyCode,
          method: 'MANUAL',
          createdBy: user.id,
        },
      });
      await tx.investmentTransaction.create({
        data: {
          investmentId: investment.id,
          type: 'WITHDRAWAL',
          amount: input.actualMaturityValue,
          transactionDate: date,
          description: 'Fixed-deposit maturity payout',
          createdBy: user.id,
        },
      });
      await tx.investment.update({
        where: { id: investment.id },
        data: { status: 'CLOSED', closedAt: date, actualMaturityValue: input.actualMaturityValue },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'FIXED_DEPOSIT_MATURITY_RECORDED' } });
      return { id: valuation.id, maturityDate: input.maturityDate, actualMaturityValue: input.actualMaturityValue, currencyCode: investment.currencyCode.trim(), status: 'CLOSED' };
    });
  }
  @Get('spaces/:id/goals') async goals(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const goals = await db.financialGoal.findMany({
      where: { spaceId: membership.spaceId },
      include: {
        contributions: { orderBy: [{ contributionDate: 'desc' }, { createdAt: 'desc' }], take: 10 },
        dependant: { select: { id: true, name: true, relationship: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
    const aggregates = goals.length ? await db.goalContribution.groupBy({
      by: ['goalId', 'type'],
      where: { goalId: { in: goals.map(goal => goal.id) } },
      _sum: { amount: true },
    }) : [];
    const aggregateAmounts = new Map(aggregates.map(item => [`${item.goalId}:${item.type}`, item._sum.amount?.toString() ?? '0']));
    return {
      goals: goals.map(goal => {
        const currencyCode = goal.currencyCode.trim();
        const currentAmount = subtractDecimals(
          aggregateAmounts.get(`${goal.id}:CONTRIBUTION`) ?? '0',
          aggregateAmounts.get(`${goal.id}:WITHDRAWAL`) ?? '0',
        );
        const completed = decimalToUnits(currentAmount) >= decimalToUnits(goal.targetAmount.toString());
        const ratio = Number(currentAmount) / Number(goal.targetAmount.toString());
        return {
          id: goal.id,
          name: goal.name,
          description: goal.description,
          currencyCode,
          targetAmount: goal.targetAmount.toString(),
          currentAmount,
          remainingAmount: completed ? '0' : subtractDecimals(goal.targetAmount.toString(), currentAmount),
          progressPercent: Math.min(100, Math.max(0, ratio * 100)),
          targetDate: goal.targetDate ? toDateOnly(goal.targetDate) : null,
          isCompleted: completed,
          dependant: goal.dependant,
          contributions: goal.contributions.map(contribution => ({
            id: contribution.id,
            type: contribution.type,
            amount: contribution.amount.toString(),
            contributionDate: toDateOnly(contribution.contributionDate),
            description: contribution.description,
          })),
        };
      }),
    };
  }
  @Post('spaces/:id/goals') async createGoal(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage goals in this space.');
    const input = validate(financialGoalInput, body);
    if (input.dependantId) {
      if (membership.space.type !== 'HOUSEHOLD') {
        throw new BadRequestException('Only Household goals can be linked to a dependant.');
      }
      const dependant = await db.dependant.findFirst({
        where: { id: input.dependantId, spaceId: membership.spaceId },
        select: { id: true },
      });
      if (!dependant) throw new BadRequestException('Choose a dependant in this Household Space.');
    }
    const goal = await db.$transaction(async tx => {
      const created = await tx.financialGoal.create({
        data: {
          spaceId: membership.spaceId,
          dependantId: input.dependantId,
          name: input.name,
          description: input.description,
          currencyCode: input.currencyCode ?? membership.space.baseCurrency,
          targetAmount: input.targetAmount,
          targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : undefined,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'FINANCIAL_GOAL_CREATED' } });
      return created;
    });
    return {
      id: goal.id,
      name: goal.name,
      description: goal.description,
      currencyCode: goal.currencyCode.trim(),
      targetAmount: goal.targetAmount.toString(),
      currentAmount: '0',
      remainingAmount: goal.targetAmount.toString(),
      progressPercent: 0,
      targetDate: goal.targetDate ? toDateOnly(goal.targetDate) : null,
      isCompleted: false,
      dependant: input.dependantId ? await db.dependant.findUnique({
        where: { id: input.dependantId },
        select: { id: true, name: true, relationship: true },
      }) : null,
      contributions: [],
    };
  }
  @Post('spaces/:id/goals/:goalId/contributions') async recordGoalContribution(@Req() req: Request, @Param('id') id: string, @Param('goalId') goalId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to update goals in this space.');
    const validGoalId = validate(z.string().uuid(), goalId);
    const input = validate(goalContributionInput, body);
    if (input.contributionDate > toDateOnly(new Date())) throw new BadRequestException('Contribution date cannot be in the future.');
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "FinancialGoal" WHERE "id" = ${validGoalId} AND "spaceId" = ${membership.spaceId} FOR UPDATE`;
      const goal = await tx.financialGoal.findFirst({
        where: { id: validGoalId, spaceId: membership.spaceId },
        include: { contributions: { orderBy: [{ contributionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
      });
      if (!goal) throw new NotFoundException();
      let balance = 0n;
      let inserted = false;
      const apply = (type: 'CONTRIBUTION' | 'WITHDRAWAL', value: string) => {
        const units = decimalToUnits(value);
        balance += type === 'CONTRIBUTION' ? units : -units;
        if (balance < 0n) throw new BadRequestException('This withdrawal would make the goal balance negative based on its dated history.');
      };
      for (const contribution of goal.contributions) {
        if (!inserted && toDateOnly(contribution.contributionDate) > input.contributionDate) {
          apply(input.type, input.amount);
          inserted = true;
        }
        apply(contribution.type, contribution.amount.toString());
      }
      if (!inserted) apply(input.type, input.amount);
      const contribution = await tx.goalContribution.create({
        data: {
          goalId: goal.id,
          type: input.type,
          amount: input.amount,
          contributionDate: new Date(`${input.contributionDate}T00:00:00.000Z`),
          description: input.description,
          createdBy: user.id,
        },
      });
      await tx.auditEvent.create({
        data: { actorUserId: user.id, spaceId: membership.spaceId, action: input.type === 'CONTRIBUTION' ? 'GOAL_CONTRIBUTION_RECORDED' : 'GOAL_WITHDRAWAL_RECORDED' },
      });
      const currentAmount = unitsToDecimal(balance);
      const isCompleted = decimalToUnits(currentAmount) >= decimalToUnits(goal.targetAmount.toString());
      return {
        id: contribution.id,
        goalId: contribution.goalId,
        type: contribution.type,
        amount: contribution.amount.toString(),
        contributionDate: toDateOnly(contribution.contributionDate),
        description: contribution.description,
        currentAmount,
        remainingAmount: isCompleted ? '0' : subtractDecimals(goal.targetAmount.toString(), currentAmount),
        isCompleted,
      };
    });
  }
  @Get('spaces/:id/liabilities') async liabilities(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    const liabilities = await db.liability.findMany({
      where: { spaceId: membership.spaceId },
      include: { payments: { orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }], take: 10 } },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
    const aggregates = liabilities.length ? await db.liabilityPayment.groupBy({
      by: ['liabilityId'],
      where: { liabilityId: { in: liabilities.map(liability => liability.id) } },
      _sum: { principalAmount: true },
    }) : [];
    const principalPaidByLiability = new Map(aggregates.map(item => [item.liabilityId, item._sum.principalAmount?.toString() ?? '0']));
    const totalsByCurrency = new Map<string, string>();
    const result = liabilities.map(liability => {
      const currencyCode = liability.currencyCode.trim();
      const principalPaid = principalPaidByLiability.get(liability.id) ?? '0';
      const outstandingBalance = subtractDecimals(liability.openingBalance.toString(), principalPaid);
      totalsByCurrency.set(currencyCode, addDecimals(totalsByCurrency.get(currencyCode) ?? '0', outstandingBalance));
      return {
        id: liability.id,
        type: liability.type,
        name: liability.name,
        provider: liability.provider,
        currencyCode,
        originalAmount: liability.originalAmount.toString(),
        openingBalance: liability.openingBalance.toString(),
        principalPaid,
        outstandingBalance,
        annualInterestRate: liability.annualInterestRate.toString(),
        monthlyPayment: liability.monthlyPayment?.toString() ?? null,
        startDate: toDateOnly(liability.startDate),
        expectedPayoffDate: liability.expectedPayoffDate ? toDateOnly(liability.expectedPayoffDate) : null,
        status: outstandingBalance === '0' ? 'PAID_OFF' : liability.status,
        payments: liability.payments.map(payment => ({
          id: payment.id,
          amount: payment.amount.toString(),
          principalAmount: payment.principalAmount.toString(),
          interestAndFeesAmount: subtractDecimals(payment.amount.toString(), payment.principalAmount.toString()),
          paidAt: toDateOnly(payment.paidAt),
          description: payment.description,
        })),
      };
    });
    return { baseCurrency: membership.space.baseCurrency.trim(), totalsByCurrency: Object.fromEntries(totalsByCurrency), liabilities: result };
  }
  @Post('spaces/:id/liabilities') async createLiability(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to manage liabilities in this space.');
    const input = validate(liabilityInput, body);
    if (input.startDate > toDateOnly(new Date())) throw new BadRequestException('Debt start date cannot be in the future.');
    const liability = await db.$transaction(async tx => {
      const created = await tx.liability.create({
        data: {
          spaceId: membership.spaceId,
          type: input.type,
          name: input.name,
          provider: input.provider,
          currencyCode: input.currencyCode ?? membership.space.baseCurrency,
          originalAmount: input.originalAmount,
          openingBalance: input.openingBalance,
          annualInterestRate: input.annualInterestRate,
          monthlyPayment: input.monthlyPayment,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          expectedPayoffDate: input.expectedPayoffDate ? new Date(`${input.expectedPayoffDate}T00:00:00.000Z`) : undefined,
          status: decimalToUnits(input.openingBalance) === 0n ? 'PAID_OFF' : 'ACTIVE',
          createdBy: user.id,
        },
      });
      if (membership.space.type === 'HOUSEHOLD') {
        await tx.householdOwnershipAllocation.create({
          data: {
            spaceId: membership.spaceId,
            entityType: 'LIABILITY',
            entityId: created.id,
            ownerUserId: user.id,
            percentage: '100',
          },
        });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, spaceId: membership.spaceId, action: 'LIABILITY_CREATED' } });
      return created;
    });
    return {
      id: liability.id,
      type: liability.type,
      name: liability.name,
      provider: liability.provider,
      currencyCode: liability.currencyCode.trim(),
      originalAmount: liability.originalAmount.toString(),
      openingBalance: liability.openingBalance.toString(),
      outstandingBalance: liability.openingBalance.toString(),
      annualInterestRate: liability.annualInterestRate.toString(),
      monthlyPayment: liability.monthlyPayment?.toString() ?? null,
      startDate: toDateOnly(liability.startDate),
      expectedPayoffDate: liability.expectedPayoffDate ? toDateOnly(liability.expectedPayoffDate) : null,
      status: liability.status,
      payments: [],
    };
  }
  @Post('spaces/:id/liabilities/:liabilityId/payments') async recordLiabilityPayment(@Req() req: Request, @Param('id') id: string, @Param('liabilityId') liabilityId: string, @Body() body: unknown) {
    const user = await this.identity.user(req);
    const membership = await this.spaceMembership(user.id, id);
    if (membership.role === 'VIEWER') throw new ForbiddenException('You do not have permission to record liability payments in this space.');
    const validLiabilityId = validate(z.string().uuid(), liabilityId);
    const input = validate(liabilityPaymentInput, body);
    if (input.paidAt > toDateOnly(new Date())) throw new BadRequestException('Payment date cannot be in the future.');
    const principalAmount = input.principalAmount ?? input.amount;
    if (decimalToUnits(principalAmount) > decimalToUnits(input.amount)) throw new BadRequestException('Principal paid cannot exceed the total payment.');
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Liability" WHERE "id" = ${validLiabilityId} AND "spaceId" = ${membership.spaceId} FOR UPDATE`;
      const liability = await tx.liability.findFirst({ where: { id: validLiabilityId, spaceId: membership.spaceId } });
      if (!liability) throw new NotFoundException();
      if (input.paidAt < toDateOnly(liability.startDate)) throw new BadRequestException('Payment date cannot be before this debt started.');
      if (liability.status === 'PAID_OFF') throw new BadRequestException('This liability is already paid off.');
      const principalAggregate = await tx.liabilityPayment.aggregate({ where: { liabilityId: liability.id }, _sum: { principalAmount: true } });
      const totalPrincipalPaid = principalAggregate._sum.principalAmount?.toString() ?? '0';
      const outstandingBalance = subtractDecimals(liability.openingBalance.toString(), totalPrincipalPaid);
      if (decimalToUnits(principalAmount) > decimalToUnits(outstandingBalance)) {
        throw new BadRequestException('Principal paid cannot exceed the outstanding balance.');
      }
      const newBalance = subtractDecimals(outstandingBalance, principalAmount);
      const payment = await tx.liabilityPayment.create({
        data: {
          liabilityId: liability.id,
          amount: input.amount,
          principalAmount,
          paidAt: new Date(`${input.paidAt}T00:00:00.000Z`),
          description: input.description,
          createdBy: user.id,
        },
      });
      if (newBalance === '0') {
        await tx.liability.update({ where: { id: liability.id }, data: { status: 'PAID_OFF' } });
      }
      await tx.auditEvent.create({
        data: { actorUserId: user.id, spaceId: membership.spaceId, action: newBalance === '0' ? 'LIABILITY_PAID_OFF' : 'LIABILITY_PAYMENT_RECORDED' },
      });
      return {
        id: payment.id,
        liabilityId: payment.liabilityId,
        amount: payment.amount.toString(),
        principalAmount: payment.principalAmount.toString(),
        interestAndFeesAmount: subtractDecimals(payment.amount.toString(), payment.principalAmount.toString()),
        paidAt: toDateOnly(payment.paidAt),
        description: payment.description,
        outstandingBalance: newBalance,
        status: newBalance === '0' ? 'PAID_OFF' : 'ACTIVE',
      };
    });
  }
}
const dummyHash = hashPassword(newToken());
@Module({ controllers: [Api], providers: [Identity] })
class AppModule {}
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const message = exception instanceof HttpException ? exception.message : 'Service unavailable. Please try again.';
    if (status >= 500) process.stderr.write(JSON.stringify({ event: 'request_failed', status, correlationId: response.getHeader('X-Request-Id') }) + '\n');
    response.status(status).json({ message });
  }
}
async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new SafeErrors());
  app.use((req: Request, res: Response, next: () => void) => {
    const requestId = randomUUID();
    const started = Date.now();
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => process.stdout.write(JSON.stringify({ event: 'http_request', correlationId: requestId, method: req.method, status: res.statusCode, durationMs: Date.now() - started }) + '\n'));
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) return res.status(403).json({ message: 'Request origin is not permitted.' });
    next();
  });
  app.use('/auth', rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? process.env.API_PORT ?? 4000), '0.0.0.0');
}
main().catch(() => { process.stderr.write('API startup failed. Check configuration and service availability.\n'); process.exitCode = 1; });
