import { readFile } from 'node:fs/promises';
import { transaction } from './transaction.js';

// Explicit ordered versions keep upgrades predictable; applied files are immutable.
export const migrations = [
  ['001_release', new URL('./migrations/001_release.sql', import.meta.url)],
];

export async function migrate(db, versions = migrations, history = 'migrations', lock = 481921) {
  // History names are constants supplied by entrypoints, never HTTP input.
  if (!/^[a-z_]+$/.test(history)) throw new Error('Invalid migration history name.');
  await transaction(db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lock]);
    await client.query(`CREATE TABLE IF NOT EXISTS ${history} (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const [name, file] of versions) {
      const applied = await client.query(`SELECT 1 FROM ${history} WHERE name=$1`, [name]);
      if (applied.rowCount) continue;
      await client.query(await readFile(file, 'utf8'));
      await client.query(`INSERT INTO ${history}(name) VALUES($1)`, [name]);
    }
  });
}
