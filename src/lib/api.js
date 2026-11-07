// 後端 API 用戶端。伺服器不可用時，前端仍以離線模式運作（資料留在本機，恢復連線後同步）。
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const TIMEOUT_MS = 15_000

let token = ''
export const setToken = (t) => (token = t || '')

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body, { raw = false, contentType } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = contentType ?? 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  // 靜態主機（例如預覽網址）會以首頁 HTML 回應 /api/*：視為沒有後端，維持離線模式
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`後端未回應（HTTP ${res.status}）`)
  }
  const data = await res.json()
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`)
  return data
}

export const getConfig = () => request('GET', '/api/config')
export const getPresets = () => request('GET', '/api/presets')
export const listDefects = (project) => request('GET', `/api/defects?project=${encodeURIComponent(project)}`)
export const putDefect = (id, body) => request('PUT', `/api/defects/${id}`, body)
export const patchDefect = (id, body) => request('PATCH', `/api/defects/${id}`, body)

export async function uploadBlob(blob, path = '/api/uploads') {
  return (await request('POST', path, blob, { raw: true, contentType: blob.type })).url
}

export async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob()
}

// 廠商回報（免登入，以 token 存取）
export const getReply = (t) => request('GET', `/api/reply/${t}`)
export const uploadReplyPhoto = (t, blob) => uploadBlob(blob, `/api/reply/${t}/photos`)
export const submitReply = (t, body) => request('POST', `/api/reply/${t}`, body)

// 每日工作日誌
export const putLog = (id, body) => request('PUT', `/api/logs/${encodeURIComponent(id)}`, body)
export const listLogs = (query) => request('GET', `/api/logs?${new URLSearchParams(query)}`)

// ---------- 工安：報到、吹哨、派工、管制 ----------
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString()

export const getMe = () => request('GET', '/api/me')
export const safetyOverview = (project, date) => request('GET', `/api/safety/overview?${qs({ project, date })}`)
export const crewsAt = (project, building, floor) => request('GET', `/api/safety/crews?${qs({ project, building, floor })}`)
export const saveHazards = (project, items, by) => request('PUT', '/api/safety/hazards', { project, items, by })
export const unlockDefect = (defectId, note, by) => request('POST', '/api/safety/unlocks', { defectId, note, by })
export const dispatchDefect = (id, body) => request('POST', `/api/defects/${id}/dispatch`, body)
export const dismissDefect = (id, body) => request('POST', `/api/defects/${id}/dismiss`, body)
export const notifiedOf = (id) => request('GET', `/api/defects/${id}/notified`)
export const safetyStats = (project, from, to) => request('GET', `/api/safety/stats?${qs({ project, from, to })}`)
export const listWorkers = (project) => request('GET', `/api/workers?${qs({ project })}`)
export const patchWorker = (id, body) => request('PATCH', `/api/workers/${id}`, body)
export const listContractors = () => request('GET', '/api/contractors')
export const addContractor = (body) => request('POST', '/api/contractors', body)
export const patchContractor = (id, body) => request('PATCH', `/api/contractors/${encodeURIComponent(id)}`, body)
export const siteLink = (project) => request('GET', `/api/safety/site?${qs({ project })}`)
export const rotateSiteLink = (project) => request('POST', '/api/safety/site/rotate', { project })
export const getZones = (project) => request('GET', `/api/projects/zones?${qs({ project })}`)
export const putZones = (project, buildings, floors) => request('PUT', '/api/projects/zones', { project, buildings, floors })
