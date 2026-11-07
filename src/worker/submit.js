import { ApiError, dataUrlToBlob } from '../lib/api.js'
import { site, worker } from './api.js'
import { addReceipt, loadOutbox, saveOutbox } from './local.js'

/**
 * 上傳照片並送出通報。
 * 匿名吹哨（whistle）一律走工地 QR 通道，不帶工人憑證；伺服器不會知道是誰送的。
 * @param {'named'|'whistle'} kind
 */
export async function sendReport(siteKey, kind, payload) {
  const photos = []
  for (const p of payload.photos) {
    const blob = await dataUrlToBlob(p)
    photos.push(kind === 'whistle' ? await site.upload(siteKey, blob) : await worker.upload(blob))
  }
  const body = { ...payload, photos }
  if (kind !== 'whistle') return worker.report(body)
  const r = await site.whistle(siteKey, body)
  await addReceipt(siteKey, { receipt: r.receipt, reportNo: r.reportNo, createdAt: new Date().toISOString() })
  return r
}

/** 沒有網路：先存在手機，連網後自動送出。 */
export async function queueReport(siteKey, kind, payload) {
  const list = await loadOutbox(siteKey)
  list.push({ id: crypto.randomUUID(), kind, payload, createdAt: new Date().toISOString() })
  await saveOutbox(siteKey, list)
}

/** 判斷是否該留在待送清單重試：沒網路、伺服器忙、登入失效、尚未報到（報到後即可送出）。 */
const retryable = (e) => !(e instanceof ApiError) || e.status >= 500 || [401, 403, 429].includes(e.status)

let flushing = false

/** @returns {Promise<{ sent: number, failed: string[], left: number }>} */
export async function flushOutbox(siteKey) {
  if (flushing) return { sent: 0, failed: [], left: (await loadOutbox(siteKey)).length }
  flushing = true
  try {
    const done = new Set()
    const failed = []
    let sent = 0
    for (const item of await loadOutbox(siteKey)) {
      try {
        await sendReport(siteKey, item.kind, item.payload)
        sent++
        done.add(item.id)
      } catch (e) {
        if (retryable(e)) continue
        failed.push(e.message)
        done.add(item.id)
      }
    }
    // 重新讀取再寫回：送出期間新存的通報不會被覆蓋
    const left = (await loadOutbox(siteKey)).filter((i) => !done.has(i.id))
    await saveOutbox(siteKey, left)
    return { sent, failed, left: left.length }
  } finally {
    flushing = false
  }
}
