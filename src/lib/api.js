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
  const data = await res.json().catch(() => ({}))
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
