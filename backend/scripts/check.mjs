import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = fileURLToPath(new URL('../src/', import.meta.url));
async function check(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) count += await check(file);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], {
        stdio: 'inherit',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
      count++;
    }
  }
  return count;
}
console.log(
  'JavaScript syntax checks passed for ' +
    ((await check(source)) +
      (await check(fileURLToPath(new URL('../services/', import.meta.url)))) +
      (await check(fileURLToPath(new URL('../tests/', import.meta.url))))) +
    ' backend files.',
);
