import { reactive, watch } from 'vue'
import { CONTRACTORS } from './data/presets.js'
import { createDraft, findTrade, nextReportNo } from './lib/defect.js'
import * as db from './lib/storage.js'

// 全域狀態：設定、目前草稿、已建立紀錄。草稿任何變動 300ms 內自動寫入 IndexedDB。
export const store = reactive({
  ready: false,
  settings: { projectName: '', inspector: '' },
  draft: createDraft(),
  step: 1,
  records: [],
  savedAt: null,
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
  const [settings, draft, records] = await Promise.all([db.loadSettings(), db.loadDraft(), db.loadRecords()])
  store.settings = settings
  store.records = records
  if (draft) {
    const { _step, ...rest } = draft
    store.draft = { ...createDraft(settings.projectName), ...rest }
    store.step = _step ?? 1
  } else {
    store.draft = createDraft(settings.projectName)
  }
  store.ready = true
  watch(() => [store.draft, store.step], scheduleSave, { deep: true })
  watch(() => store.settings, (s) => db.saveSettings(s), { deep: true })
}

export function resetDraft() {
  store.draft = createDraft(store.settings.projectName)
  store.step = 1
}

/** 正式建檔：配發單號、記住案名、寫入紀錄並清除草稿。 */
export async function commitDraft() {
  const d = store.draft
  if (!d.reportNo) d.reportNo = nextReportNo(store.records.map((r) => r.reportNo))
  d.inspector = store.settings.inspector
  store.settings.projectName = d.projectName
  store.records = await db.upsertRecord(d)
  return store.records.find((r) => r.id === d.id)
}

export async function updateRecord(record) {
  store.records = await db.upsertRecord(record)
}

export const contractorOf = (id) => CONTRACTORS.find((c) => c.id === id) ?? null
export const tradeLabelOf = (id) => {
  const t = findTrade(id)
  return t ? `${t.icon} ${t.label}` : ''
}
