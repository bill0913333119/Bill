// 工人手機上的資料：登入憑證、工地資訊快取、離線待送通報、匿名回執。
import { del, get, set } from 'idb-keyval'

const plain = (v) => JSON.parse(JSON.stringify(v))

export const loadAuth = (siteKey) => get(`worker:${siteKey}`)
export const saveAuth = (siteKey, auth) => set(`worker:${siteKey}`, plain(auth))
export const clearAuth = (siteKey) => del(`worker:${siteKey}`)

export const loadSiteInfo = (siteKey) => get(`siteinfo:${siteKey}`)
export const saveSiteInfo = (siteKey, info) => set(`siteinfo:${siteKey}`, plain(info))

/** 地下室沒訊號時先存手機，連網後自動送出。 */
export async function loadOutbox(siteKey) {
  return (await get(`outbox:${siteKey}`)) ?? []
}
export async function saveOutbox(siteKey, list) {
  await set(`outbox:${siteKey}`, plain(list))
}

/** 匿名吹哨回執：只存在這支手機，可隨時清除。 */
export async function loadReceipts(siteKey) {
  return (await get(`receipts:${siteKey}`)) ?? []
}
export async function addReceipt(siteKey, r) {
  const list = await loadReceipts(siteKey)
  list.unshift(plain(r))
  await set(`receipts:${siteKey}`, list.slice(0, 30))
}
export const clearReceipts = (siteKey) => del(`receipts:${siteKey}`)
