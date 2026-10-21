import { reactive, watch } from 'vue'
import { CONTRACTORS, TRADES } from './data/presets.js'
import * as api from './lib/api.js'
import { createDraft, findTrade, nextReportNo } from './lib/defect.js'
import { initLiff } from './lib/liff.js'
import * as db from './lib/storage.js'

// 全域狀態：設定、目前草稿、已建立紀錄。草稿任何變動 300ms 內自動寫入 IndexedDB。
export const store = reactive({
  ready: false,
  settings: { projectName: '', inspector: '', apiToken: '' },
  presets: { trades: TRADES, contractors: CONTRACTORS },
  server: { available: false, authRequired: false, liffId: '', error: '' },
  draft: createDraft(),
  step: 1,
  records: [],
  savedAt: null,
  syncing: false,
})

let timer
function scheduleSave() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    await db.saveDraft({ ...store.draft, _step: store.step })
    store.savedAt = new Date()
  }, 300)
}

export async function initStore() {
  const [settings, draft, records, presets] = await Promise.all([
    db.loadSettings(),
    db.loadDraft(),
    db.loadRecords(),
    db.loadPresets(),
  ])
  store.settings = { ...store.settings, ...settings }
  store.records = records
  if (presets) store.presets = presets
  if (draft) {
    const { _step, ...rest } = draft
    store.draft = { ...createDraft(store.settings.projectName), ...rest }
    store.step = _step ?? 1
  } else {
    store.draft = createDraft(store.settings.projectName)
  }
  api.setToken(store.settings.apiToken)
  store.ready = true
  watch(() => [store.draft, store.step], scheduleSave, { deep: true })
  watch(
    () => store.settings,
    (s) => {
      api.setToken(s.apiToken)
      db.saveSettings(s)
    },
    { deep: true },
  )
  window.addEventListener('online', () => connect())
  connect()
}

/** 連線後端：載入設定與工種／廠商清單，補送離線期間的紀錄，並更新回報狀態。 */
export async function connect() {
  try {
    const cfg = await api.getConfig()
    store.server = { available: true, authRequired: cfg.authRequired, liffId: cfg.liffId, error: '' }
    if (cfg.liffId) initLiff(cfg.liffId)
    store.presets = await api.getPresets()
    db.savePresets(store.presets)
    await syncPending()
    await refreshRecords()
  } catch (e) {
    store.server.available = store.server.available && e instanceof api.ApiError
    store.server.error = e.status === 401 ? '連線金鑰錯誤，請至設定輸入' : ''
  }
}

export function resetDraft() {
  store.draft = createDraft(store.settings.projectName)
  store.step = 1
}

async function saveLocal(record) {
  store.records = await db.upsertRecord(record)
  return store.records.find((r) => r.id === record.id)
}

const isDataUrl = (u) => u.startsWith('data:')

/** 上傳照片並送出缺失；成功時以伺服器回傳的單號、回報連結更新本機紀錄。 */
export async function syncRecord(record) {
  const remotePhotos = []
  for (const p of record.photos) {
    remotePhotos.push(isDataUrl(p) ? await api.uploadBlob(await api.dataUrlToBlob(p)) : p)
  }
  const saved = await api.putDefect(record.id, { ...record, photos: remotePhotos })
  return saveLocal({ ...record, ...pickServerFields(saved), remotePhotos, synced: true })
}

const SERVER_FIELDS = ['reportNo', 'status', 'replyUrl', 'replyNote', 'repliedAt', 'reviewNote', 'afterPhotos', 'closedAt', 'pdfUrl']
const pickServerFields = (d) => Object.fromEntries(SERVER_FIELDS.map((k) => [k, d[k]]))

export async function syncPending() {
  if (store.syncing) return
  store.syncing = true
  try {
    for (const r of store.records.filter((r) => !r.synced)) await syncRecord(r)
  } finally {
    store.syncing = false
  }
}

/** 取回伺服器上本專案紀錄：更新狀態、加入其他工程師建立的缺失。 */
export async function refreshRecords() {
  const project = store.settings.projectName
  if (!store.server.available || !project) return
  const remote = await api.listDefects(project)
  for (const d of remote) {
    const local = store.records.find((r) => r.id === d.id)
    if (!local) await saveLocal({ ...d, remotePhotos: d.photos, synced: true })
    else if (SERVER_FIELDS.some((k) => JSON.stringify(local[k]) !== JSON.stringify(d[k]))) {
      await saveLocal({ ...local, ...pickServerFields(d) })
    }
  }
}

/** 正式建檔：配發單號、記住案名、寫入紀錄並清除草稿；有網路時立即同步取得正式單號。 */
export async function commitDraft() {
  const d = { ...store.draft, synced: false }
  if (!d.reportNo) d.reportNo = nextReportNo(store.records.map((r) => r.reportNo))
  d.inspector = store.settings.inspector
  store.settings.projectName = d.projectName
  let record = await saveLocal(d)
  if (store.server.available) {
    try {
      record = await syncRecord(record)
    } catch (e) {
      console.warn('同步失敗，稍後重試', e)
    }
  }
  return record
}

export async function attachPdf(record, blob) {
  if (!store.server.available || !record.synced) return record
  const pdfUrl = await api.uploadBlob(blob)
  const saved = await api.patchDefect(record.id, { pdfUrl })
  return saveLocal({ ...record, ...pickServerFields(saved) })
}

/** 結案／退回／重開。已同步的紀錄需連線才能變更，確保廠商端看到一致狀態。 */
export async function setStatus(record, status, reviewNote = '') {
  if (record.synced) {
    if (!store.server.available) throw new Error('需連線才能變更狀態')
    const saved = await api.patchDefect(record.id, { status, reviewNote })
    return saveLocal({ ...record, ...pickServerFields(saved) })
  }
  return saveLocal({ ...record, status, reviewNote, closedAt: status === 'closed' ? new Date().toISOString() : null })
}

export const contractorOf = (id) => store.presets.contractors.find((c) => c.id === id) ?? null
export const tradeLabelOf = (id) => {
  const t = findTrade(id, store.presets.trades)
  return t ? `${t.icon} ${t.label}` : ''
}
