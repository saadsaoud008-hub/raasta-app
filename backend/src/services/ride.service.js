import { transaction } from '../db/transaction.js';
import { DriverModel } from '../models/driver.model.js';
import { ApiError } from '../shared/api-error.js';
import { assertTransition, estimate } from './ride-rules.js';
import { RideModel } from '../models/ride.model.js';
import { RiderModel } from '../models/rider.model.js';
import { notifyRide } from '../events/ride-events.js';
export class RideService {
  db;
  driverCache;
  pendingDrivers;
  broker;
  updates;
  constructor(db, driverCache, broker, updates) {
    this.db = db;
    this.driverCache = driverCache;
    this.broker = broker;
    this.updates = updates;
  }
  async get(id, repository = new RideModel(this.db)) {
    const ride = await repository.details(id);
    if (!ride) throw new ApiError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
    return ride;
  }
  async drivers() {
    const cached = await this.driverCache?.get();
    if (cached) return cached;
    // Concurrent misses on this API instance share one database read.
    if (!this.pendingDrivers) {
      this.pendingDrivers = (async () => {
        const drivers = await new DriverModel(this.db).list();
        await this.driverCache?.set(drivers);
        return drivers;
      })().finally(() => { this.pendingDrivers = undefined; });
    }
    return this.pendingDrivers;
  }
  async create(input, id) {
    const result = await transaction(this.db, async (client) => {
      const rides = new RideModel(client);
      // The rider lock serializes simultaneous creates and retries for one rider.
      if (!(await rides.lockRider(input.riderId)))
        throw new ApiError(404, 'RIDER_NOT_FOUND', 'Rider not found.');
      const existing = await rides.findExisting(id);
      if (existing) {
        if (existing.rider_id !== input.riderId || existing.pickup !== input.pickup ||
          existing.destination !== input.destination || existing.category !== input.category)
          throw new ApiError(
            409,
            'RIDE_ID_CONFLICT',
            'This ride ID is already used with different details.',
          );
        return { ride: await this.get(existing.id, rides), replayed: true };
      }
      if (await rides.hasActiveRide(input.riderId))
        throw new ApiError(
          409,
          'ACTIVE_RIDE_EXISTS',
          'Finish or cancel your current ride before booking another.',
        );
      const inserted = await rides.insert({
        ...input,
        ...estimate(input.category),
        id,
      });
      if (!inserted)
        throw new ApiError(409, 'RIDE_ID_CONFLICT', 'This ride ID is already in use.');
      const ride = await this.get(id, rides);
      return { ride, replayed: false };
    });
    await this.publishUpdate(result.ride);
    await notifyRide(this.broker, result.ride, console, () => new RiderModel(this.db).email(result.ride.rider_id));
    return result;
  }
  async transition(id, next, driverId) {
    const result = await transaction(this.db, async (client) => {
      const rides = new RideModel(client),
        drivers = new DriverModel(client);
      const ride = await rides.lock(id);
      if (!ride) throw new ApiError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
      if (ride.status === next) {
        if (next === 'ACCEPTED' && ride.driver_id !== driverId)
          throw new ApiError(
            409,
            'RIDE_ALREADY_ASSIGNED',
            'Another driver already accepted this ride.',
          );
        return this.get(id, rides);
      }
      assertTransition(ride.status, next);
      if (next === 'ACCEPTED') {
        if (!driverId)
          throw new ApiError(400, 'DRIVER_REQUIRED', 'A driver is required.');
        const driver = await drivers.lock(driverId);
        if (!driver)
          throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found.');
        if (!driver.available || driver.category !== ride.category)
          throw new ApiError(
            409,
            'DRIVER_UNAVAILABLE',
            'Driver is unavailable or does not match the ride category.',
          );
        await drivers.setAvailability(driverId, false);
        await rides.assign(id, driverId);
      } else {
        if (ride.driver_id) await drivers.setAvailability(ride.driver_id, true);
        await rides.setStatus(id, next);
      }
      const updated = await this.get(id, rides);
      return updated;
    });
    // Invalidate only after COMMIT; Redis never participates in assignment locks.
    await this.driverCache?.invalidate();
    await this.publishUpdate(result);
    await notifyRide(this.broker, result, console, () => new RiderModel(this.db).email(result.rider_id));
    return result;
  }
  async publishUpdate(ride) {
    try { await this.updates?.publish(ride); } catch {
      console.warn('Live update failed; the saved ride remains available through the API.');
    }
  }
}
