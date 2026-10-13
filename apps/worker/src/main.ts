import 'reflect-metadata';
import { Module, Injectable } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { createDatabase } from '@pf/database';
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
const db = createDatabase(required('DATABASE_URL'));
const redis = new URL(required('REDIS_URL'));
const connection = { host: redis.hostname, port: Number(redis.port || 6379), username: redis.username || undefined, password: redis.password || undefined, ...(redis.protocol === 'rediss:' ? { tls: {} } : {}) };
const transport = nodemailer.createTransport({ host: required('SMTP_HOST'), port: Number(process.env.SMTP_PORT ?? 1025), secure: process.env.SMTP_PORT === '465', ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: required('SMTP_PASSWORD') } } : {}), ...(process.env.NODE_ENV === 'production' ? { requireTLS: true } : {}) });
const queue = new Queue('email', { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: true, removeOnFail: false } });
const worker = new Worker('email', async job => {
  const email = await db.emailOutbox.findUnique({ where: { id: String(job.data.id) } });
  if (!email || email.sentAt) return;
  // Outbox delivery is at-least-once; a crash after SMTP acceptance may duplicate an email.
  await transport.sendMail({ from: required('SMTP_FROM'), to: email.recipient, subject: email.subject, text: email.body, messageId: `<${email.id}@finance.local>` });
  await db.emailOutbox.update({ where: { id: email.id }, data: { sentAt: new Date(), body: '[delivered]' } });
}, { connection, concurrency: 2 });
worker.on('failed', job => process.stderr.write(JSON.stringify({ event: 'email_job_failed', jobId: job?.id }) + '\n'));
worker.on('error', () => process.stderr.write('{"event":"email_worker_error"}\n'));
queue.on('error', () => process.stderr.write('{"event":"email_queue_error"}\n'));
let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const pending = await db.emailOutbox.findMany({ where: { sentAt: null }, take: 100, orderBy: { createdAt: 'asc' }, select: { id: true } });
    for (const email of pending) await queue.add('send', { id: email.id }, { jobId: email.id });
  } catch { process.stderr.write('{"event":"email_outbox_poll_failed"}\n'); }
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
  process.stdout.write('{"event":"worker_started"}\n');
}
main().catch(() => { process.stderr.write('{"event":"worker_startup_failed"}\n'); process.exitCode = 1; });
