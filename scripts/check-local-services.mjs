import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
const require = createRequire(new URL('../packages/database/package.json', import.meta.url));
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
try {
  await client.connect();
  await client.query('SELECT 1');
  console.log('PostgreSQL: connection OK');
} catch (error) {
  console.error(`PostgreSQL: connection failed (${error.code ?? 'unknown'}). Check DATABASE_URL in .env.`);
  process.exitCode = 1;
} finally { await client.end(); }
const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
await new Promise(resolve => {
  const socket = createConnection({ host: redis.hostname, port: Number(redis.port || 6379) });
  socket.setTimeout(3000);
  let finished = false;
  const finish = ok => {
    if (finished) return;
    finished = true;
    console.log(ok ? 'Redis: port reachable' : 'Redis: port unavailable. Start Redis or check REDIS_URL in .env.');
    if (!ok) process.exitCode = 1;
    socket.destroy(); resolve();
  };
  socket.on('connect', () => finish(true));
  socket.on('error', () => finish(false));
  socket.on('timeout', () => finish(false));
});
