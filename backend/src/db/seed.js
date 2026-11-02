import { pool } from './pool.js';
import { normalizeEmail } from '../shared/email.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = await pool.connect();
try {
  const email = normalizeEmail(process.env.DEMO_RIDER_EMAIL);
  await client.query('BEGIN');
  await client.query(
    `INSERT INTO riders(id,name,email) VALUES('11111111-1111-4111-8111-111111111111','Demo rider',$1)
     ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email WHERE EXCLUDED.email IS NOT NULL`,
    [email],
  );
  const drivers = [
    [
      '22222222-2222-4222-8222-222222222222',
      'Ali Hassan',
      'ECONOMY',
      'Suzuki Alto - White',
      'LEA-2041',
    ],
    [
      '33333333-3333-4333-8333-333333333333',
      'Usman Ahmed',
      'ECONOMY',
      'Suzuki Cultus - Silver',
      'LEB-3182',
    ],
    [
      '44444444-4444-4444-8444-444444444444',
      'Hamza Malik',
      'COMFORT',
      'Toyota Corolla - Black',
      'LEC-7290',
    ],
  ];
  for (const d of drivers)
    await client.query(
      'INSERT INTO drivers(id,name,category,vehicle,plate) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      d,
    );
  await client.query('COMMIT');
  console.log('Demo rider and drivers ready.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
