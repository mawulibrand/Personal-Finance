import 'reflect-metadata';
import { Module, Injectable } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { createDatabase } from '@pf/database';
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
const db = createDatabase(required('DATABASE_URL'));
const redis = new URL(required('REDIS_URL'));
const connection = { host: redis.hostname, port: Number(redis.port || 6379), username: redis.username || undefined, password: redis.password || undefined, retryStrategy: (attempt: number) => Math.min(1000 * 2 ** Math.min(attempt - 1, 5), 30000), ...(redis.protocol === 'rediss:' ? { tls: {} } : {}) };
const transport = nodemailer.createTransport({ host: required('SMTP_HOST'), port: Number(process.env.SMTP_PORT ?? 1025), secure: process.env.SMTP_PORT === '465', ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: required('SMTP_PASSWORD') } } : {}), ...(process.env.NODE_ENV === 'production' ? { requireTLS: true } : {}) });
const queue = new Queue('email', { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: true, removeOnFail: false } });
const worker = new Worker('email', async job => {
  const email = await db.emailOutbox.findUnique({ where: { id: String(job.data.id) } });
  if (!email || email.sentAt) return;
  // Outbox delivery is at-least-once; a crash after SMTP acceptance may duplicate an email.
  await transport.sendMail({ from: required('SMTP_FROM'), to: email.recipient, subject: email.subject, text: email.body, messageId: `<${email.id}@finance.local>` });
  await db.emailOutbox.update({ where: { id: email.id }, data: { sentAt: new Date(), body: '[delivered]' } });
}, { connection, concurrency: 2, autorun: false });
const lastLogged = new Map<string, number>();
function safeErrorDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown; message?: unknown } : {};
  let message = typeof value.message === 'string' ? value.message : String(error ?? 'Unknown error');
  for (const name of ['DATABASE_URL', 'REDIS_URL', 'SMTP_PASSWORD', 'SMTP_USER']) {
    const secret = process.env[name];
    if (secret) message = message.replaceAll(secret, '[redacted]');
  }
  message = message
    .replace(/\b((?:redis|rediss|postgres(?:ql)?|smtp):\/\/)[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .slice(0, 300);
  return {
    ...(typeof value.name === 'string' ? { errorName: value.name } : {}),
    ...(typeof value.code === 'string' ? { errorCode: value.code } : {}),
    errorMessage: message,
  };
}
function logServiceError(event: string, error?: unknown) {
  const now = Date.now();
  if (now - (lastLogged.get(event) ?? 0) < 30000) return;
  lastLogged.set(event, now);
  process.stderr.write(JSON.stringify({ event, ...(error === undefined ? {} : safeErrorDetails(error)) }) + '\n');
}
worker.on('failed', (job, error) => process.stderr.write(JSON.stringify({ event: 'email_job_failed', jobId: job?.id, ...safeErrorDetails(error) }) + '\n'));
worker.on('error', error => logServiceError('email_worker_error', error));
queue.on('error', error => logServiceError('email_queue_error', error));
let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const pending = await db.emailOutbox.findMany({ where: { sentAt: null }, take: 100, orderBy: { createdAt: 'asc' }, select: { id: true } });
    for (const email of pending) await queue.add('send', { id: email.id }, { jobId: email.id });
  } catch (error) { logServiceError('email_outbox_poll_failed', error); }
  finally { polling = false; }
}
const timer = setInterval(() => { void poll(); }, 5000);
void poll();
async function stop() { clearInterval(timer); await worker.close(); await queue.close(); await db.$disconnect(); }
@Injectable()
class WorkerLifecycle { async onApplicationShutdown() { await stop(); } }
@Module({ providers: [WorkerLifecycle] })
class WorkerModule {}
async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  process.stdout.write('{"event":"worker_waiting_for_redis"}\n');
  await worker.waitUntilReady();
  void worker.run().catch(error => logServiceError('email_worker_run_failed', error));
  process.stdout.write('{"event":"worker_started"}\n');
}
main().catch(error => { logServiceError('worker_startup_failed', error); process.exitCode = 1; });
