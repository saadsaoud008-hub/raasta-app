// A transaction client must be supplied for every write or locked read.
export class RideModel {
  db;
  constructor(db) {
    this.db = db;
  }
  async details(id) {
    const result = await this.db.query(
      `SELECT r.id,r.rider_id,r.pickup,r.destination,r.category,r.status,
      r.driver_id,r.fare_paisa,r.eta_minutes,r.created_at,r.updated_at,
      d.name AS driver_name,d.vehicle,d.plate FROM rides r
      LEFT JOIN drivers d ON d.id=r.driver_id WHERE r.id=$1`,
      [id],
    );
    return result.rows[0];
  }
  async lock(id) {
    return (
      await this.db.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [id])
    ).rows[0];
  }
  async lockRider(id) {
    return Boolean(
      (
        await this.db.query('SELECT id FROM riders WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rowCount,
    );
  }
  async findExisting(id) {
    return (
      await this.db.query(
        'SELECT id,rider_id,pickup,destination,category FROM rides WHERE id=$1',
        [id],
      )
    ).rows[0];
  }
  async hasActiveRide(riderId) {
    return Boolean(
      (
        await this.db.query(
          "SELECT 1 FROM rides WHERE rider_id=$1 AND status IN ('REQUESTED','ACCEPTED')",
          [riderId],
        )
      ).rowCount,
    );
  }
  async insert(ride) {
    const result = await this.db.query(
      'INSERT INTO rides(id,rider_id,pickup,destination,category,fare_paisa,eta_minutes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id',
      [
        ride.id,
        ride.riderId,
        ride.pickup,
        ride.destination,
        ride.category,
        ride.farePaisa,
        ride.etaMinutes,
      ],
    );
    return result.rowCount > 0;
  }
  async assign(id, driverId) {
    await this.db.query(
      "UPDATE rides SET driver_id=$2,status='ACCEPTED',updated_at=now() WHERE id=$1",
      [id, driverId],
    );
  }
  async setStatus(id, status) {
    await this.db.query(
      'UPDATE rides SET status=$2,updated_at=now() WHERE id=$1',
      [id, status],
    );
  }
}
