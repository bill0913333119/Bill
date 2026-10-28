import { reactive, watch } from 'vue'
import { BUILDINGS, CONTRACTORS, FLOORS, LEGACY_FLOORS, PROJECTS, TRADES } from './data/presets.js'
import * as api from './lib/api.js'
import { createDraft, findTrade, nextReportNo, recommendContractor, toDateInput } from './lib/defect.js'
import { initLiff } from './lib/liff.js'
import { sortFloors } from './lib/floors.js'
import * as db from './lib/storage.js'
import { appendSentence } from './lib/speech.js'
import { parseSpeech } from './lib/voiceParse.js'
import { createLog, dayDefectStats } from './lib/worklog.js'

// 全域狀態：設定、目前草稿、已建立紀錄。草稿任何變動 300ms 內自動寫入 IndexedDB。
export const store = reactive({
  ready: false,
  settings: {
    projectName: '',
    inspector: '',
    apiToken: '',
    signature: '', // 儲存後的手寫簽名（PNG），自動套用於所有通知單
    buildings: [...BUILDINGS],
    floors: [...FLOORS],
    reminderHour: 17,
  },
  presets: { trades: TRADES, contractors: CONTRACTORS, projects: PROJECTS },
  server: { available: false, authRequired: false, liffId: '', error: '' },
  draft: createDraft(),
  step: 1,
  records: [],
  logs: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
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
  const [settings, draft, records, presets, logs] = await Promise.all([
    db.loadSettings(),
    db.loadDraft(),
    db.loadRecords(),
    db.loadPresets(),
    db.loadLogs(),
  ])
  store.settings = { ...store.settings, ...settings }
  if (JSON.stringify(store.settings.floors) === JSON.stringify(LEGACY_FLOORS)) store.settings.floors = [...FLOORS]
  store.records = records
  store.logs = logs
  if (presets) store.presets = { projects: PROJECTS, ...presets }
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
  window.addEventListener('online', () => {
    store.online = true
    connect()
  })
  window.addEventListener('offline', () => (store.online = false))
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
    for (const l of store.logs.filter((l) => l.submittedAt && !l.synced)) await syncLog(l)
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

export const pendingCount = () =>
  store.records.filter((r) => !r.synced).length + store.logs.filter((l) => l.submittedAt && !l.synced).length

// ---------- 棟別／樓層清單編輯 ----------
export function setBuildings(list) {
  store.settings.buildings = [...new Set(list.map((b) => b.trim()).filter(Boolean))]
}
export function setFloors(list) {
  store.settings.floors = sortFloors(list.map((f) => f.trim()).filter(Boolean))
}

/**
 * 套用口述結果到草稿：棟別、樓層、戶別、工種與缺失項目；其餘文字接在詳細說明後。
 * 回傳摘要字串供畫面顯示。
 */
export function applyVoice(text) {
  const d = store.draft
  const p = parseSpeech(text, {
    buildings: store.settings.buildings,
    floors: store.settings.floors,
    trades: store.presets.trades,
  })
  const parts = []
  if (p.building) {
    d.building = p.building
    if (!store.settings.buildings.includes(p.building)) store.settings.buildings.push(p.building)
    parts.push(p.building)
  }
  if (p.floor) {
    d.floor = p.floor
    if (p.newFloor) setFloors([...store.settings.floors, p.floor])
    parts.push(p.floor)
  }
  if (p.unit) {
    d.unit = p.unit
    parts.push(`${p.unit}戶`)
  }
  if (p.tradeId) {
    d.tradeId = p.tradeId
    d.item = p.item
    d.contractorId = recommendContractor(p.tradeId, store.presets.contractors)?.id ?? d.contractorId
    parts.push(p.item)
  }
  if (p.rest) {
    d.description = appendSentence(d.description, p.rest)
    parts.push('說明')
  }
  return parts.join('、')
}

// ---------- 每日工作日誌 ----------
export const today = () => toDateInput(new Date())

export function currentLog(date = today()) {
  const engineer = store.settings.inspector.trim()
  return store.logs.find((l) => l.date === date && l.engineer === engineer) ?? null
}

/** 取得（或建立草稿）今日日誌，並帶入當日缺失統計。 */
export function ensureTodayLog() {
  const existing = currentLog()
  if (existing) return existing
  const projectName = store.draft.projectName || store.settings.projectName
  const stats = dayDefectStats(store.records, today(), projectName)
  return {
    ...createLog({ projectName, engineer: store.settings.inspector.trim() }),
    defectsOpened: stats.opened,
    defectsClosed: stats.closed,
  }
}

async function persistLog(log) {
  store.logs = await db.upsertLog(log)
  return store.logs.find((l) => l.id === log.id)
}

export async function syncLog(log) {
  const saved = await api.putLog(log.id, log)
  return persistLog({ ...log, ...saved, synced: true })
}

export async function saveLog(log, { submit = false } = {}) {
  const next = { ...log, synced: false }
  const stats = dayDefectStats(store.records, next.date, next.projectName)
  next.defectsOpened = stats.opened
  next.defectsClosed = stats.closed
  if (submit && !next.submittedAt) next.submittedAt = new Date().toISOString()
  let saved = await persistLog(next)
  if (submit && store.server.available) {
    try {
      saved = await syncLog(saved)
    } catch (e) {
      console.warn('日誌同步失敗，稍後重試', e)
    }
  }
  return saved
}

/** 下班簽退：日誌已送出才允許。 */
export async function clockOut(log) {
  if (!log?.submittedAt) throw new Error('請先完成今日工作日誌')
  const saved = await persistLog({ ...log, clockOutAt: new Date().toISOString(), synced: false })
  if (store.server.available) await syncLog(saved).catch((e) => console.warn(e))
  return currentLog(log.date)
}
