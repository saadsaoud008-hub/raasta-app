import { expect, it } from 'vitest';
import { readConfig } from '../src/config/env.js';

const database = { DATABASE_URL: 'postgresql://localhost/rides' };
it('allows Redis to be disabled or configured separately', () => {
  expect(readConfig(database).redisUrl).toBeUndefined();
  expect(readConfig({ ...database, REDIS_URL: 'redis://localhost:6379' }).redisUrl).toBe('redis://localhost:6379');
});
it.each(['http://localhost', 'invalid', 'redis://'])('rejects invalid Redis URL %s', (redisUrl) => {
  expect(() => readConfig({ ...database, REDIS_URL: redisUrl })).toThrow('REDIS_URL');
});
it('defaults to no cross-origin browser access', () => {
  expect(readConfig(database).corsOrigins).toEqual([]);
});
it('accepts a comma-separated list of browser origins', () => {
  expect(readConfig({ ...database, CORS_ORIGINS: ' https://web.example, http://localhost:5173 ' }).corsOrigins)
    .toEqual(['https://web.example', 'http://localhost:5173']);
});
it.each(['*', 'null', 'https://web.example/path', 'https://web.example/'])('rejects invalid origin %s', (origin) => {
  expect(() => readConfig({ ...database, CORS_ORIGINS: origin })).toThrow('CORS_ORIGINS');
});
