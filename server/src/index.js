import { createApp } from './app.js'
import { config } from './config.js'
import { createPool, migrate } from './db.js'
import { lineClient } from './line.js'
import { dbStorage, localStorage, s3Storage } from './storage.js'

const pool = createPool(config.databaseUrl)
await migrate(pool)

const storage = config.s3
  ? await s3Storage(config.s3)
  : config.storage === 'db'
    ? dbStorage({ pool, publicUrl: config.publicUrl })
    : localStorage({ dir: config.uploadDir, publicUrl: config.publicUrl })
const storageName = config.s3 ? 'S3/R2' : config.storage === 'db' ? '資料庫' : '本機'
const line = lineClient(config.line)

createApp({ pool, storage, line, config }).listen(config.port, () => {
  console.log(`工地缺失 API 已啟動：${config.publicUrl}（儲存：${storageName}，LINE：${line.enabled ? '啟用' : '未設定'}）`)
})
