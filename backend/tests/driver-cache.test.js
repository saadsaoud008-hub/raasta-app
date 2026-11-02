import { expect, it, vi } from 'vitest';
import { createDriverCache, connectDriverCache } from '../src/cache/driver-cache.js';
import { createApp } from '../src/app.js';
import request from 'supertest';

const drivers = [{ id: 'driver', name: 'Ali', category: 'ECONOMY', available: true, vehicle: 'Alto', plate: 'ONE' }];
function redis(value = null) {
  const client = {
    isReady: true,
    get: vi.fn().mockResolvedValue(value),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    withCommandOptions: vi.fn(),
  };
  client.withCommandOptions.mockReturnValue(client);
  return client;
}

it('serves repeated driver requests from Redis without a second database read', async () => {
  const client = redis();
  client.set.mockImplementation(async (_key, value) => { client.get.mockResolvedValue(value); });
  const db = { query: vi.fn().mockResolvedValue({ rows: drivers }) };
  const app = createApp(db, false, { driverCache: createDriverCache(client) });
  expect((await request(app).get('/api/drivers')).body).toEqual(drivers);
  expect((await request(app).get('/api/drivers')).body).toEqual(drivers);
  expect(db.query).toHaveBeenCalledTimes(1);
  expect(client.set).toHaveBeenCalledWith('raasta:drivers:v1', JSON.stringify(drivers), { EX: 5 });
  expect(client.withCommandOptions).toHaveBeenCalledWith({ timeout: 100 });
});

it.each(['disconnected', 'failure', 'malformed', 'wrong shape'])('falls back to PostgreSQL on %s cache', async (mode) => {
  const client = redis(mode === 'malformed' ? '{' : '[{"id":1}]');
  if (mode === 'disconnected') client.isReady = false;
  if (mode === 'failure') {
    client.get.mockRejectedValue(new Error('Redis unavailable'));
    client.set.mockRejectedValue(new Error('Redis unavailable'));
  }
  const db = { query: vi.fn().mockResolvedValue({ rows: drivers }) };
  const response = await request(createApp(db, false, { driverCache: createDriverCache(client) })).get('/api/drivers');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(drivers);
  expect(db.query).toHaveBeenCalledOnce();
});

it('does not cache database errors', async () => {
  const client = redis();
  const db = { query: vi.fn().mockRejectedValueOnce(new Error('DB failed')).mockResolvedValue({ rows: drivers }) };
  const app = createApp(db, false, { driverCache: createDriverCache(client) });
  expect((await request(app).get('/api/drivers')).status).toBe(500);
  expect(client.set).not.toHaveBeenCalled();
  expect((await request(app).get('/api/drivers')).body).toEqual(drivers);
});

it('shares a database read for simultaneous cache misses', async () => {
  const { RideService } = await import('../src/services/ride.service.js');
  let finish;
  const db = { query: vi.fn(() => new Promise(resolve => { finish = resolve; })) };
  const service = new RideService(db, createDriverCache(redis()));
  const first = service.drivers();
  const second = service.drivers();
  await vi.waitFor(() => expect(db.query).toHaveBeenCalledOnce());
  finish({ rows: drivers });
  expect(await first).toEqual(drivers);
  expect(await second).toEqual(drivers);
});

it('invalidates after committing a transition even if Redis deletion fails', async () => {
  const { RideService } = await import('../src/services/ride.service.js');
  const client = redis();
  client.del.mockRejectedValue(new Error('Redis unavailable'));
  const events = [];
  const connection = {
    query: vi.fn(async (sql) => {
      events.push(sql);
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 'ride', status: 'REQUESTED', driver_id: null }] };
      if (sql.includes('LEFT JOIN')) return { rows: [{ id: 'ride', status: 'CANCELLED', updated_at: '2026-11-01T00:00:00Z' }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  client.del.mockImplementation(async () => {
    expect(events).toContain('COMMIT');
    throw new Error('Redis unavailable');
  });
  const service = new RideService({ connect: async () => connection }, createDriverCache(client));
  expect(await service.transition('ride', 'CANCELLED')).toMatchObject({ id: 'ride', status: 'CANCELLED' });
  expect(client.del).toHaveBeenCalledOnce();
});

it('does not invalidate on transaction rollback', async () => {
  const { RideService } = await import('../src/services/ride.service.js');
  const cache = { invalidate: vi.fn() };
  const connection = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
  const service = new RideService({ connect: async () => connection }, cache);
  await expect(service.transition('missing', 'CANCELLED')).rejects.toMatchObject({ code: 'RIDE_NOT_FOUND' });
  expect(connection.query).toHaveBeenCalledWith('ROLLBACK');
  expect(cache.invalidate).not.toHaveBeenCalled();
});

it('requires no connection when Redis is disabled', () => {
  const redis = connectDriverCache(undefined);
  expect(redis.cache).toBeUndefined();
  redis.close();
});
