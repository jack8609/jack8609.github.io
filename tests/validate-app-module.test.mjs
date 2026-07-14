import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'violation-helper-'));
const modulePath = join(fixtureDirectory, 'module.js');
const testPath = join(fixtureDirectory, 'module.test.mjs');
const validationScript = resolve('tools/validate-app-module.ps1');

try {
  await writeFile(modulePath, "export const message = '已複製到剪貼簿';\n", 'utf8');
  await writeFile(testPath, "console.log('fixture test passed');\n", 'utf8');

  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', validationScript,
    '-ModulePath', modulePath, '-TestPath', testPath
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /fixture test passed/);
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log('validate-app-module encoding contract passed');