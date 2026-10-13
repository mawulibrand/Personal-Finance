// Run the dependency-free security tests even before workspace installation.
import { stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'finance-security-'));
try {
  for (const [source, target] of [['security.ts', 'security.mjs'], ['security.test.ts', 'security.test.mjs']]) {
    const contents = await readFile(new URL(`../apps/api/src/${source}`, import.meta.url), 'utf8');
    await writeFile(join(directory, target), stripTypeScriptTypes(contents).replace("'./security.js'", "'./security.mjs'"));
  }
  const result = spawnSync(process.execPath, ['--test', join(directory, 'security.test.mjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
