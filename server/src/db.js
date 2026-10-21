import { readFile } from 'node:fs/promises'
import pg from 'pg'

// date 欄位以字串回傳（YYYY-MM-DD），避免時區位移
pg.types.setTypeParser(1082, (v) => v)

export function createPool(connectionString) {
  return new pg.Pool({ connectionString })
}

export async function migrate(pool) {
  for (const file of ['schema.sql', 'seed.sql']) {
    const sql = await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8')
    await pool.query(sql)
  }
}

export async function tx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}
