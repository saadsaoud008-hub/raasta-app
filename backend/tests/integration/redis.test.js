import { it, expect } from 'vitest';
import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';
import { createDriverCache } from '../../src/cache/driver-cache.js';

it.skipIf(!process.env.TEST_REDIS_URL)('stores, expires, and invalidates the driver list in real Redis', async () => {
  const client = createClient({
    url: process.env.TEST_REDIS_URL,
    socket: { connectTimeout: 1000, reconnectStrategy: false },
  });
  client.on('error', () => {});
  const key = `raasta:test:${randomUUID()}`;
  try {
    await client.connect();
    const cache = createDriverCache(client, key);
    expect(await cache.get()).toBeNull();
    await cache.set([]);
    expect(await cache.get()).toEqual([]);
    expect(await client.ttl(key)).toBeGreaterThan(0);
    expect(await client.ttl(key)).toBeLessThanOrEqual(5);
    await expireTestEntry(client, key);
    expect(await cache.get()).toBeNull();
    await cache.set([]);
    await cache.invalidate();
    expect(await cache.get()).toBeNull();
  } finally {
    if (client.isReady) await client.del(key);
    if (client.isOpen) client.destroy();
  }
});

async function expireTestEntry(client, key) {
  await client.pExpire(key, 1);
  await new Promise(resolve => setTimeout(resolve, 30));
}
