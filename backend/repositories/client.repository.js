class ClientRepository {
  constructor(pool) {
    this.pool = pool;
  }

  query(sql, params = [], client = null) {
    const db = client || this.pool;
    return db.query(sql, params);
  }

  async withTransaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = { ClientRepository };