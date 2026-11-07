// 工人端 API。工地 QR 金鑰與工人登入憑證，和工程師端的連線金鑰完全分開。
// 匿名吹哨相關呼叫一律不帶任何憑證。
import { ApiError } from '../lib/api.js'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const TIMEOUT_MS = 20_000

let workerToken = ''
export const setWorkerToken = (t) => (workerToken = t || '')

async function call(method, path, body, { auth = false, raw = false } = {}) {
  const headers = {}
  if (auth && workerToken) headers.Authorization = `Bearer ${workerToken}`
  if (body !== undefined) headers['Content-Type'] = raw ? body.type : 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.headers.get('content-type')?.includes('application/json')) throw new Error(`伺服器沒有回應（HTTP ${res.status}）`)
  const data = await res.json()
  if (!res.ok) throw Object.assign(new ApiError(res.status, data.error ?? `HTTP ${res.status}`), { data })
  return data
}

const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString()

/** 以工地 QR 金鑰存取（不帶工人身分）。 */
export const site = {
  info: (key) => call('GET', `/api/site/${key}`),
  register: (key, body) => call('POST', `/api/site/${key}/workers`, body),
  crews: (key, loc) => call('GET', `/api/site/${key}/crews?${q(loc)}`),
  upload: async (key, blob) => (await call('POST', `/api/site/${key}/uploads`, blob, { raw: true })).url,
  whistle: (key, body) => call('POST', `/api/site/${key}/whistle`, body),
  receipt: (key, receipt) => call('GET', `/api/site/${key}/whistle/${encodeURIComponent(receipt)}`),
}

/** 以工人登入憑證存取。 */
export const worker = {
  me: () => call('GET', '/api/worker/me', undefined, { auth: true }),
  update: (body) => call('PUT', '/api/worker/me', body, { auth: true }),
  context: (zone) => call('GET', `/api/worker/checkin-context?${q({ building: zone.building, floors: zone.floors.join(',') })}`, undefined, { auth: true }),
  checkin: (body) => call('POST', '/api/worker/checkins', body, { auth: true }),
  upload: async (blob) => (await call('POST', '/api/worker/uploads', blob, { auth: true, raw: true })).url,
  report: (body) => call('POST', '/api/worker/reports', body, { auth: true }),
  reports: () => call('GET', '/api/worker/reports', undefined, { auth: true }),
  points: () => call('GET', '/api/worker/points', undefined, { auth: true }),
  tasks: () => call('GET', '/api/worker/tasks', undefined, { auth: true }),
}
