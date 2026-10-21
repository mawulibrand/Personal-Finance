import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Controller, Module, Get, Post, Body, Req, Res, Param, Query, Injectable, Inject, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException, ConflictException, ServiceUnavailableException, Catch, HttpException } from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createDatabase, Prisma } from '@pf/database';
import { hashPassword, verifyPassword, newToken, hashToken, mayAccessPersonalSpace } from './security.js';
import { DEFAULT_CATEGORIES, normalizeCategoryName } from './categories.js';
import { expectedPaydayDates, salaryPeriodStatus } from './income.js';
import { nextRecurringDate } from './recurring.js';
import { addDecimals, decimalToUnits, subtractDecimals } from './money.js';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const origin = required('WEB_ORIGIN');
const production = process.env.NODE_ENV === 'production';
if (production && !origin.startsWith('https://')) throw new Error('Production WEB_ORIGIN requires HTTPS');
const db = createDatabase(required('DATABASE_URL'));
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(12).max(128);
const amount = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/).refine(value => Number(value) > 0, 'Amount must be greater than zero.');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.');
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
const safeUser = (u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email });
const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
function setSession(res: Response, token: string) {
  res.cookie('pf_session', token, { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 86400000 });
}
async function queueEmail(tx: Prisma.TransactionClient, recipient: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', userId: string) {
  const token = newToken();
  await tx.authToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  const path = purpose === 'VERIFY_EMAIL' ? 'verify' : 'reset';
  await tx.emailOutbox.create({ data: { recipient, subject: purpose === 'VERIFY_EMAIL' ? 'Verify your email' : 'Reset your password', body: `Open this link within one hour: ${origin}/${path}#token=${token}` } });
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
  @Get('spaces') async spaces(@Req() req: Request) {
    const user = await this.identity.user(req);
    const memberships = await db.membership.findMany({ where: { userId: user.id }, include: { space: true } });
    return memberships.filter(m => m.space.type !== 'PERSONAL' || mayAccessPersonalSpace(user.id, m.space.personalOwnerId)).map(m => ({ ...m.space, role: m.role }));
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
