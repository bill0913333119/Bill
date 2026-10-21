import { get, set } from 'idb-keyval'

// IndexedDB 本機儲存：草稿每一動自動暫存，斷網或誤關閉都不會遺失。
const DRAFT_KEY = 'draft'
const RECORDS_KEY = 'records'
const SETTINGS_KEY = 'settings'

const plain = (v) => JSON.parse(JSON.stringify(v))

export const loadDraft = () => get(DRAFT_KEY)
export const saveDraft = (draft) => set(DRAFT_KEY, plain(draft))
export const clearDraft = () => set(DRAFT_KEY, null)

export async function loadRecords() {
  return (await get(RECORDS_KEY)) ?? []
}

export async function upsertRecord(record) {
  const records = await loadRecords()
  const i = records.findIndex((r) => r.id === record.id)
  if (i >= 0) records[i] = plain(record)
  else records.unshift(plain(record))
  await set(RECORDS_KEY, records)
  return records
}

export async function loadSettings() {
  return (await get(SETTINGS_KEY)) ?? { projectName: '', inspector: '' }
}

export const saveSettings = (settings) => set(SETTINGS_KEY, plain(settings))
