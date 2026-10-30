import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
export const ALLOWED_TYPES = Object.keys(EXT)

function objectKey(prefix, contentType) {
  const day = new Date().toISOString().slice(0, 10)
  return `${prefix}/${day}/${randomUUID()}.${EXT[contentType]}`
}

/** 本機磁碟儲存：檔案由 Express 以 /files 提供。適合單機部署與開發。 */
export function localStorage({ dir, publicUrl }) {
  return {
    async put(prefix, buffer, contentType) {
      const key = objectKey(prefix, contentType)
      const file = path.join(dir, key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, buffer)
      return `${publicUrl}/files/${key}`
    },
    owns: (url) => url.startsWith(`${publicUrl}/files/`) && !url.includes('..'),
  }
}

/** S3 相容儲存（AWS S3 / Cloudflare R2）。 */
export async function s3Storage(cfg) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
  return {
    async put(prefix, buffer, contentType) {
      const key = objectKey(prefix, contentType)
      await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: buffer, ContentType: contentType }))
      return `${cfg.publicUrl}/${key}`
    },
    owns: (url) => url.startsWith(`${cfg.publicUrl}/`),
  }
}

/**
 * 資料庫儲存：檔案寫入 stored_files，由 Express 以 /files 提供。
 * 適合沒有持久磁碟的主機（例如 Render 免費方案，重啟後本機檔案會消失）。
 */
export function dbStorage({ pool, publicUrl }) {
  return {
    async put(prefix, buffer, contentType) {
      const key = objectKey(prefix, contentType)
      await pool.query('insert into stored_files (key, content_type, data) values ($1, $2, $3)', [key, contentType, buffer])
      return `${publicUrl}/files/${key}`
    },
    owns: (url) => url.startsWith(`${publicUrl}/files/`) && !url.includes('..'),
    async get(key) {
      const { rows } = await pool.query('select content_type, data from stored_files where key = $1', [key])
      return rows[0] ? { contentType: rows[0].content_type, data: rows[0].data } : null
    },
  }
}
