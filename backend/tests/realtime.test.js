import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { attachRideSockets } from '../src/realtime/ride-sockets.js';
import { createRideUpdates, connectRideUpdates } from '../src/realtime/ride-updates.js';
import { RideService } from '../src/services/ride.service.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const initial = { id, rider_id: '11111111-1111-4111-8111-111111111111', status: 'REQUESTED', updated_at: '2026-11-01T00:00:00Z' };
const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function setup(loadRide = async () => initial, appFactory) {
  const updates = createRideUpdates();
  const server = createServer(appFactory ? appFactory(updates) : (_req, res) => { res.writeHead(404).end(); });
  const live = attachRideSockets(server, { updates, loadRide, allowedOrigins: ['http://127.0.0.1:5173'] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    live.close(); updates.close();
    await new Promise(resolve => server.close(resolve));
  });
  const connect = (rideId = id, origin = 'http://127.0.0.1:5173') => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/rides/${rideId}/live`, { origin });
    socket.on('error', () => {});
    return socket;
  };
  return { connect, updates, server };
}

function nextMessage(socket) {
  return new Promise(resolve => socket.once('message', data => resolve(JSON.parse(data.toString()))));
}

it('sends an initial snapshot, pushes changed status, and reloads on reconnect', async () => {
  let ride = initial;
  const { connect, updates } = await setup(async () => ride);
  const client = connect();
  expect((await nextMessage(client)).ride.status).toBe('REQUESTED');
  const next = nextMessage(client);
  ride = { ...initial, status: 'ACCEPTED' };
  await updates.publish(ride);
  expect((await next).ride.status).toBe('ACCEPTED');
  client.close();
  const reconnect = connect();
  expect((await nextMessage(reconnect)).ride.status).toBe('ACCEPTED');
});

it('delivers a committed HTTP cancellation through the same browser WebSocket', async () => {
  let ride = { ...initial, driver_id: null };
  const query = vi.fn(async (sql, params) => {
    if (sql.includes('FOR UPDATE') || sql.includes('LEFT JOIN')) return { rows: [ride] };
    if (sql.startsWith('UPDATE rides SET status')) ride = { ...ride, status: params[1] };
    return { rows: [] };
  });
  const db = { query, connect: async () => ({ query, release() {} }) };
  const { connect, server } = await setup(async () => ride, updates => createApp(db, false, { updates }));
  const client = connect();
  await nextMessage(client);
  const changed = nextMessage(client);
  const response = await request(server).post(`/api/rides/${id}/cancel`).send({});
  expect(response.status).toBe(200);
  expect((await changed).ride.status).toBe('CANCELLED');
  expect(query).toHaveBeenCalledWith('COMMIT');
});

it('only updates browsers watching the changed ride', async () => {
  const load = vi.fn(async rideId => ({ ...initial, id: rideId }));
  const { connect, updates } = await setup(load);
  const a = connect(); const b = connect(otherId);
  await Promise.all([nextMessage(a), nextMessage(b)]);
  const before = load.mock.calls.length;
  const message = nextMessage(a);
  await updates.publish(initial);
  await message;
  expect(load.mock.calls.slice(before)).toEqual([[id]]);
});

it('does not miss a change while the initial database read is running', async () => {
  let finish;
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({ ...initial, status: 'ACCEPTED' });
  const { connect, updates } = await setup(load);
  const client = connect();
  const states = [];
  client.on('message', data => states.push(JSON.parse(data).ride.status));
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  await updates.publish(initial);
  finish(initial);
  await vi.waitFor(() => expect(states).toEqual(['REQUESTED', 'ACCEPTED']));
});

it('rejects browser origins outside the allowlist', async () => {
  const { connect } = await setup();
  const client = connect(id, 'https://unknown.example');
  const status = await new Promise(resolve => client.on('unexpected-response', (_req, res) => {
    res.resume(); client.terminate(); resolve(res.statusCode);
  }));
  expect(status).toBe(403);
});

it('closes unknown rides without exposing database details', async () => {
  const { connect } = await setup(async () => undefined);
  const client = connect();
  const code = await new Promise(resolve => client.on('close', code => resolve(code)));
  expect(code).toBe(1008);
});

it('keeps booking actions on HTTP rather than accepting socket commands', async () => {
  const { connect } = await setup();
  const client = connect();
  await nextMessage(client);
  const closed = new Promise(resolve => client.on('close', code => resolve(code)));
  client.send(JSON.stringify({ action: 'accept' }));
  expect(await closed).toBe(1008);
});

it('keeps local live updates available while Redis publishing is disconnected', async () => {
  const publisher = Object.assign(new EventEmitter(), {
    isReady: false, isOpen: true, connect: vi.fn().mockResolvedValue(), destroy: vi.fn(),
  });
  const subscriber = Object.assign(new EventEmitter(), {
    isOpen: true, connect: vi.fn().mockResolvedValue(), subscribe: vi.fn().mockResolvedValue(), destroy: vi.fn(),
  });
  publisher.duplicate = () => subscriber;
  const updates = connectRideUpdates('redis://test', 'test:rides', console, () => publisher);
  const listener = vi.fn();
  updates.subscribe(id, listener);
  await updates.publish(initial);
  expect(listener).toHaveBeenCalledOnce();
  updates.close();
  expect(subscriber.destroy).toHaveBeenCalled();
});

it('shares ride IDs through Redis, ignores its own echo, and resyncs after subscribing', async () => {
  const publisher = Object.assign(new EventEmitter(), {
    isReady: true, isOpen: true, connect: vi.fn().mockResolvedValue(), destroy: vi.fn(),
    publish: vi.fn().mockResolvedValue(1), withCommandOptions: vi.fn(),
  });
  publisher.withCommandOptions.mockReturnValue(publisher);
  const subscriber = Object.assign(new EventEmitter(), {
    isOpen: true, connect: vi.fn().mockResolvedValue(), subscribe: vi.fn().mockResolvedValue(), destroy: vi.fn(),
  });
  publisher.duplicate = () => subscriber;
  const updates = connectRideUpdates('redis://test', 'test:rides', console, () => publisher);
  const listener = vi.fn(); const resync = vi.fn();
  updates.subscribe(id, listener); updates.onResync(resync);
  subscriber.emit('ready');
  await vi.waitFor(() => expect(resync).toHaveBeenCalledOnce());
  const receive = subscriber.subscribe.mock.calls[0][1];
  await updates.publish(initial);
  receive(publisher.publish.mock.calls[0][1]);
  expect(listener).toHaveBeenCalledOnce();
  receive(JSON.stringify({ rideId: id, source: 'other-api' }));
  expect(listener).toHaveBeenCalledTimes(2);
  receive('{');
  expect(listener).toHaveBeenCalledTimes(2);
  updates.close();
});

it('broadcasts only after commit and does not roll back a ride when broadcasting fails', async () => {
  const query = vi.fn(async sql => {
    if (sql.includes('FOR UPDATE')) return { rows: [initial] };
    if (sql.includes('LEFT JOIN')) return { rows: [{ ...initial, status: 'CANCELLED' }] };
    return { rows: [] };
  });
  const updates = { publish: vi.fn(async () => {
    expect(query).toHaveBeenCalledWith('COMMIT');
    throw new Error('Redis down');
  }) };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const service = new RideService({ connect: async () => ({ query, release() {} }) }, undefined, undefined, updates);
    expect((await service.transition(id, 'CANCELLED')).status).toBe('CANCELLED');
    expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(updates.publish).toHaveBeenCalledOnce();
  } finally { warn.mockRestore(); }
});

it('does not broadcast a ride transaction that failed to commit', async () => {
  const query = vi.fn(async sql => {
    if (sql === 'COMMIT') throw new Error('Commit failed');
    if (sql.includes('FOR UPDATE')) return { rows: [initial] };
    if (sql.includes('LEFT JOIN')) return { rows: [{ ...initial, status: 'CANCELLED' }] };
    return { rows: [] };
  });
  const updates = { publish: vi.fn() };
  const service = new RideService({ connect: async () => ({ query, release() {} }) }, undefined, undefined, updates);
  await expect(service.transition(id, 'CANCELLED')).rejects.toThrow('Commit failed');
  expect(updates.publish).not.toHaveBeenCalled();
});
