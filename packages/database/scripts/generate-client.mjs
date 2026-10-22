import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const prisma = resolve('node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://finance:finance@localhost:5432/build',
};
const result = spawnSync(prisma, ['generate'], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
