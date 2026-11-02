import { it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { RideService } from '../../src/services/ride.service.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input = { riderId: '11111111-1111-4111-8111-111111111111', pickup: 'Gulberg', destination: 'DHA', category: 'ECONOMY' };
const ride = { id, rider_id: input.riderId, pickup: input.pickup, destination: input.destination, category: input.category, status: 'REQUESTED' };
function database({ existing, active = false, collision = false } = {}) {
  const query = vi.fn(async sql => {
    if (sql.startsWith('SELECT id FROM riders')) return { rowCount: 1, rows: [{ id: input.riderId }] };
    if (sql.startsWith('SELECT id,rider_id')) return { rows: existing ? [existing] : [] };
    if (sql.startsWith('SELECT 1 FROM rides')) return { rowCount: active ? 1 : 0 };
    if (sql.startsWith('INSERT INTO rides')) return { rowCount: collision ? 0 : 1 };
    if (sql.includes('LEFT JOIN')) return { rows: [existing || ride] };
    return { rows: [] };
  });
  return { query, connect: async () => ({ query, release() {} }) };
}

it('creates a ride through PUT without a custom retry header', async () => {
  const db = database();
  const response = await request(createApp(db, false)).put(`/api/rides/${id}`).send(input);
  expect(response.status).toBe(201);
  expect(response.body.id).toBe(id);
  expect(response.headers.location).toBe(`/api/rides/${id}`);
  const insert = db.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO rides'));
  expect(insert[1][0]).toBe(id);
  expect(insert[0]).not.toContain('idempotency_key');
});

it.each(['REQUESTED', 'CANCELLED', 'COMPLETED'])('returns an existing %s ride for the same ID and details', async status => {
  const db = database({ existing: { ...ride, status }, active: true });
  const response = await request(createApp(db, false)).put(`/api/rides/${id}`).send(input);
  expect(response.status).toBe(200);
  expect(response.body.status).toBe(status);
  expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO rides'))).toBe(false);
});

it.each([
  { destination: 'Airport' }, { pickup: 'Liberty' }, { category: 'COMFORT' },
  { rider_id: '55555555-5555-4555-8555-555555555555' },
])('rejects changing an existing ride through the creation endpoint', async changed => {
  const db = database({ existing: { ...ride, ...changed } });
  await expect(new RideService(db).create(input, id)).rejects.toMatchObject({ status: 409, code: 'RIDE_ID_CONFLICT' });
  expect(db.query).toHaveBeenCalledWith('ROLLBACK');
});

it('prevents a second active ride with a different ID', async () => {
  await expect(new RideService(database({ active: true })).create(input, id)).rejects.toMatchObject({ code: 'ACTIVE_RIDE_EXISTS' });
});

it('handles a primary-key race between different riders as a conflict', async () => {
  await expect(new RideService(database({ collision: true })).create(input, id)).rejects.toMatchObject({ status: 409, code: 'RIDE_ID_CONFLICT' });
});

it('validates the ride ID before accessing PostgreSQL', async () => {
  const db = database();
  const response = await request(createApp(db, false)).put('/api/rides/invalid').send(input);
  expect(response.status).toBe(400);
  expect(db.query).not.toHaveBeenCalled();
});
