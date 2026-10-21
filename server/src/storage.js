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
