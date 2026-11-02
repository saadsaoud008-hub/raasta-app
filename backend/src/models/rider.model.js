export class RiderModel {
  constructor(db) { this.db = db; }
  async email(id) {
    return (await this.db.query('SELECT email FROM riders WHERE id=$1', [id])).rows[0]?.email ?? null;
  }
}
