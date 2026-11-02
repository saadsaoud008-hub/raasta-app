import { createHash, randomUUID } from 'node:crypto';
import { ApiError, assertTransition, estimate } from './domain.js';
export class RideService {
    db;
    constructor(db) {
        this.db = db;
    }
    async transaction(work) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async get(id, client = this.db) {
        const { rows } = await client.query('SELECT r.*,d.name AS driver_name,d.vehicle,d.plate FROM rides r LEFT JOIN drivers d ON d.id=r.driver_id WHERE r.id=$1', [id]);
        if (!rows[0])
            throw new ApiError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
        return rows[0];
    }
    async drivers() { return (await this.db.query('SELECT id,name,category,available,vehicle,plate FROM drivers ORDER BY name')).rows; }
    async create(input, key) {
        const hash = createHash('sha256').update(JSON.stringify([input.riderId, input.pickup, input.destination, input.category])).digest('hex');
        return this.transaction(async (client) => {
            // Serialize creates for this rider, including simultaneous retries with different keys.
            const rider = await client.query('SELECT id FROM riders WHERE id=$1 FOR UPDATE', [input.riderId]);
            if (!rider.rowCount)
                throw new ApiError(404, 'RIDER_NOT_FOUND', 'Rider not found.');
            const existing = await client.query('SELECT id,request_hash FROM rides WHERE rider_id=$1 AND idempotency_key=$2', [input.riderId, key]);
            if (existing.rows[0]) {
                if (existing.rows[0].request_hash !== hash)
                    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used with different details.');
                return { ride: await this.get(existing.rows[0].id, client), replayed: true };
            }
            const active = await client.query("SELECT 1 FROM rides WHERE rider_id=$1 AND status IN ('REQUESTED','ACCEPTED')", [input.riderId]);
            if (active.rowCount)
                throw new ApiError(409, 'ACTIVE_RIDE_EXISTS', 'Finish or cancel your current ride before booking another.');
            const quote = estimate(input.category);
            const id = randomUUID();
            await client.query('INSERT INTO rides(id,rider_id,pickup,destination,category,fare_paisa,eta_minutes,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, input.riderId, input.pickup, input.destination, input.category, quote.farePaisa, quote.etaMinutes, key, hash]);
            return { ride: await this.get(id, client), replayed: false };
        });
    }
    async transition(id, next, driverId) {
        return this.transaction(async (client) => {
            const locked = await client.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [id]);
            const ride = locked.rows[0];
            if (!ride)
                throw new ApiError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
            if (ride.status === next) {
                if (next === 'ACCEPTED' && ride.driver_id !== driverId)
                    throw new ApiError(409, 'RIDE_ALREADY_ASSIGNED', 'Another driver already accepted this ride.');
                return this.get(id, client);
            }
            assertTransition(ride.status, next);
            if (next === 'ACCEPTED') {
                const driver = await client.query('SELECT * FROM drivers WHERE id=$1 FOR UPDATE', [driverId]);
                if (!driver.rows[0])
                    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found.');
                if (!driver.rows[0].available || driver.rows[0].category !== ride.category)
                    throw new ApiError(409, 'DRIVER_UNAVAILABLE', 'Driver is unavailable or does not match the ride category.');
                await client.query('UPDATE drivers SET available=false WHERE id=$1', [driverId]);
                await client.query("UPDATE rides SET driver_id=$2,status='ACCEPTED',updated_at=now() WHERE id=$1", [id, driverId]);
            }
            else {
                if (ride.driver_id)
                    await client.query('UPDATE drivers SET available=true WHERE id=$1', [ride.driver_id]);
                await client.query('UPDATE rides SET status=$2,updated_at=now() WHERE id=$1', [id, next]);
            }
            return this.get(id, client);
        });
    }
}
