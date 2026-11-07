import { createHash, randomBytes } from 'node:crypto'

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => !String(body?.[f] ?? '').trim())
  if (missing.length) throw new HttpError(400, `缺少欄位：${missing.join(', ')}`)
}

export function urlList(v, storage, max) {
  if (!Array.isArray(v) || v.length > max || !v.every((u) => typeof u === 'string' && storage.owns(u))) {
    throw new HttpError(400, `照片需為本系統上傳之網址，最多 ${max} 張`)
  }
  return v
}

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')
export const newToken = (bytes = 24) => randomBytes(bytes).toString('base64url')

/**
 * 簡易記憶體限流（每個來源 IP）：防止報到 QR 外流後被大量灌單。
 * 只存在記憶體、不寫入資料庫，也不與吹哨內容關聯。
 */
export function rateLimit({ windowMs, max, message = '操作太頻繁，請稍後再試' }) {
  const hits = new Map()
  return (req, _res, next) => {
    const now = Date.now()
    const recent = (hits.get(req.ip) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) throw new HttpError(429, message)
    recent.push(now)
    if (hits.size > 10_000) hits.clear()
    hits.set(req.ip, recent)
    next()
  }
}
