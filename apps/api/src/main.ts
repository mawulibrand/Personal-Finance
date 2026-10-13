import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Controller, Module, Get, Post, Body, Req, Res, Param, Injectable, Inject, UnauthorizedException, BadRequestException, NotFoundException, ServiceUnavailableException, Catch, HttpException } from '@nestjs/common';
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createDatabase, Prisma } from '@pf/database';
import { hashPassword, verifyPassword, newToken, hashToken, mayAccessPersonalSpace } from './security.js';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const origin = required('WEB_ORIGIN');
const production = process.env.NODE_ENV === 'production';
if (production && !origin.startsWith('https://')) throw new Error('Production WEB_ORIGIN requires HTTPS');
const db = createDatabase(required('DATABASE_URL'));
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(12).max(128);
function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Please check the supplied fields. Passwords require 12–128 characters.');
  return result.data;
}
const safeUser = (u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email });
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
  @Get('spaces/:id/dashboard') async dashboard(@Req() req: Request, @Param('id') id: string) {
    const user = await this.identity.user(req);
    validate(z.string().uuid(), id);
    const membership = await db.membership.findUnique({ where: { userId_spaceId: { userId: user.id, spaceId: id } }, include: { space: true } });
    if (!membership) throw new NotFoundException();
    if (membership.space.type === 'PERSONAL' && !mayAccessPersonalSpace(user.id, membership.space.personalOwnerId)) throw new NotFoundException();
    return { space: membership.space, status: 'NOT_ENOUGH_DATA', message: 'Your space is ready. Income, expenses and budgets arrive in Phase 2.' };
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
  await app.listen(Number(process.env.API_PORT ?? 4000), '0.0.0.0');
}
main().catch(() => { process.stderr.write('API startup failed. Check configuration and service availability.\n'); process.exitCode = 1; });
