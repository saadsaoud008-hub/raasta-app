import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { migrate } from '../../src/db/migration-runner.js';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { RideService } from '../../src/services/ride.service.js';
import { createApp } from '../../src/app.js';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL transactions and HTTP lifecycle', () => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url });
  const db = new pg.Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
    max: 10,
  });
  const service = new RideService(db);
  const app = createApp(db, false);
  const rider = '11111111-1111-4111-8111-111111111111',
    other = '55555555-5555-4555-8555-555555555555';
  const driver = '22222222-2222-4222-8222-222222222222',
    second = '33333333-3333-4333-8333-333333333333';
  const input = {
    riderId: rider,
    pickup: 'Gulberg',
    destination: 'DHA',
    category: 'ECONOMY',
  };
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await migrate(db);
  });
  afterAll(async () => {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    await db.query('TRUNCATE rides,drivers,riders CASCADE');
    await db.query('INSERT INTO riders(id,name) VALUES($1,$2),($3,$4)', [
      rider,
      'Rider A',
      other,
      'Rider B',
    ]);
    await db.query(
      "INSERT INTO drivers(id,name,category,vehicle,plate) VALUES($1,'Driver A','ECONOMY','Alto','ONE'),($2,'Driver B','ECONOMY','Alto','TWO')",
      [driver, second],
    );
  });
  it('persists creation and returns one ride for concurrent retries', async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.create(input, key)),
    );
    expect(new Set(results.map((r) => r.ride.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect((await db.query('SELECT * FROM rides')).rowCount).toBe(1);
  });
  it('rejects ride ID reuse with different details', async () => {
    const key = randomUUID();
    await service.create(input, key);
    await expect(
      service.create({ ...input, destination: 'Airport' }, key),
    ).rejects.toMatchObject({ code: 'RIDE_ID_CONFLICT' });
  });
  it('returns an old cancelled ride rather than recreating it on retry', async () => {
    const id = randomUUID();
    await service.create(input, id);
    await service.transition(id, 'CANCELLED');
    const retry = await service.create(input, id);
    expect(retry.replayed).toBe(true);
    expect(retry.ride.status).toBe('CANCELLED');
    expect((await db.query('SELECT * FROM rides')).rowCount).toBe(1);
  });
  it('allows only one rider to create a shared ride ID concurrently', async () => {
    const id = randomUUID();
    const results = await Promise.allSettled([
      service.create(input, id),
      service.create({ ...input, riderId: other }, id),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.code).toBe('RIDE_ID_CONFLICT');
    expect((await db.query('SELECT * FROM rides')).rowCount).toBe(1);
  });
  it('allows only one driver to win concurrent acceptance', async () => {
    const { ride } = await service.create(input, randomUUID());
    const results = await Promise.allSettled([
      service.transition(ride.id, 'ACCEPTED', driver),
      service.transition(ride.id, 'ACCEPTED', second),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await db.query('SELECT * FROM drivers WHERE available=false')).rowCount,
    ).toBe(1);
  });
  it('prevents two rides from sharing one active driver', async () => {
    const a = await service.create(input, randomUUID()),
      b = await service.create({ ...input, riderId: other }, randomUUID());
    const results = await Promise.allSettled([
      service.transition(a.ride.id, 'ACCEPTED', driver),
      service.transition(b.ride.id, 'ACCEPTED', driver),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('rejects wrong category without changing availability', async () => {
    await db.query("UPDATE drivers SET category='COMFORT' WHERE id=$1", [
      driver,
    ]);
    const { ride } = await service.create(input, randomUUID());
    await expect(
      service.transition(ride.id, 'ACCEPTED', driver),
    ).rejects.toMatchObject({ code: 'DRIVER_UNAVAILABLE' });
    expect(
      (await db.query('SELECT available FROM drivers WHERE id=$1', [driver]))
        .rows[0].available,
    ).toBe(true);
  });
  it('releases a driver on cancellation and rejects terminal transitions', async () => {
    const { ride } = await service.create(input, randomUUID());
    await service.transition(ride.id, 'ACCEPTED', driver);
    await service.transition(ride.id, 'CANCELLED');
    expect(
      (await db.query('SELECT available FROM drivers WHERE id=$1', [driver]))
        .rows[0].available,
    ).toBe(true);
    await expect(
      service.transition(ride.id, 'COMPLETED'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
  it('rejects completing an unaccepted ride', async () => {
    const { ride } = await service.create(input, randomUUID());
    await expect(
      service.transition(ride.id, 'COMPLETED'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
  it('supports a complete HTTP booking lifecycle and safe action retries', async () => {
    const created = await request(app)
      .put(`/api/rides/${randomUUID()}`)
      .send(input);
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(
      (
        await request(app)
          .post(`/api/rides/${id}/accept`)
          .send({ driverId: driver })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/rides/${id}/accept`)
          .send({ driverId: driver })
      ).status,
    ).toBe(200);
    const complete = await request(app)
      .post(`/api/rides/${id}/complete`)
      .send({});
    expect(complete.body.status).toBe('COMPLETED');
    expect((await request(app).get(`/api/rides/${id}`)).body.status).toBe(
      'COMPLETED',
    );
    expect(
      (await db.query('SELECT available FROM drivers WHERE id=$1', [driver]))
        .rows[0].available,
    ).toBe(true);
  });
});
