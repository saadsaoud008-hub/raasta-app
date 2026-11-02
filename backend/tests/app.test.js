import { it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
const db = { query: vi.fn(), connect: vi.fn() };
const app = createApp(db, false);
it('rejects invalid input before database access', async () => {
  const response = await request(app)
    .put('/api/rides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    .send({ pickup: '', category: 'LUXURY' });
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('VALIDATION_ERROR');
  expect(db.connect).not.toHaveBeenCalled();
});
it('rejects identical pickup and destination', async () => {
  const response = await request(app)
    .put('/api/rides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    .send({
      riderId: '11111111-1111-4111-8111-111111111111',
      pickup: 'Gulberg',
      destination: 'gulberg',
      category: 'ECONOMY',
    });
  expect(response.status).toBe(400);
});
it('handles malformed JSON', async () => {
  const response = await request(app)
    .put('/api/rides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    .set('Content-Type', 'application/json')
    .send('{');
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('INVALID_JSON');
});
it('returns category estimates', async () => {
  const response = await request(app).get('/api/quotes?category=ECONOMY');
  expect(response.status).toBe(200);
  expect(response.body.farePaisa).toBe(48000);
});

it('supports browser preflight for ride creation from a configured origin', async () => {
  const api = createApp(db, false, { corsOrigins: ['https://client.example'] });
  const response = await request(api).options('/api/rides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    .set('Origin', 'https://client.example')
    .set('Access-Control-Request-Method', 'PUT')
    .set('Access-Control-Request-Headers', 'content-type');
  expect(response.status).toBe(204);
  expect(response.headers['access-control-allow-origin']).toBe('https://client.example');
  expect(response.headers['access-control-allow-methods']).toContain('PUT');
});

it('omits CORS access for an unconfigured browser origin', async () => {
  const response = await request(app).get('/api/quotes?category=ECONOMY')
    .set('Origin', 'https://unknown.example');
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
});
