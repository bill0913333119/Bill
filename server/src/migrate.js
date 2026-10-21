import { config } from './config.js'
import { createPool, migrate } from './db.js'

const pool = createPool(config.databaseUrl)
await migrate(pool)
await pool.end()
console.log('資料庫結構已更新')
