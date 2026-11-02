export class DriverModel {
  db;
  constructor(db) {
    this.db = db;
  }
  async list() {
    return (
      await this.db.query(
        'SELECT id,name,category,available,vehicle,plate FROM drivers ORDER BY name',
      )
    ).rows;
  }
  async lock(id) {
    return (
      await this.db.query('SELECT * FROM drivers WHERE id=$1 FOR UPDATE', [id])
    ).rows[0];
  }
  async setAvailability(id, available) {
    await this.db.query('UPDATE drivers SET available=$2 WHERE id=$1', [
      id,
      available,
    ]);
  }
}
