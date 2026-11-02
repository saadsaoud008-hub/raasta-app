import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectRideUpdates } from '../../src/realtime/ride-updates.js';

it.skipIf(!process.env.TEST_REDIS_URL)('shares live updates between API instances using real Redis', async () => {
  const channel = `raasta:test:live:${randomUUID()}`;
  const logger = { warn() {} };
  const first = connectRideUpdates(process.env.TEST_REDIS_URL, channel, logger);
  const second = connectRideUpdates(process.env.TEST_REDIS_URL, channel, logger);
  const id = randomUUID();
  const received = vi.fn();
  second.subscribe(id, received);
  try {
    await vi.waitFor(async () => {
      await first.publish({ id });
      expect(received).toHaveBeenCalled();
    }, { timeout: 3000 });
  } finally { first.close(); second.close(); }
});
