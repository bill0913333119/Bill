import { CONTRACTORS, DEFAULT_DUE_DAYS, TRADES } from '../data/presets.js'

const pad = (n) => String(n).padStart(2, '0')

/** 以本地時區輸出 YYYY-MM-DD（避免 toISOString 造成跨日）。 */
export function toDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function defaultDueDate(from = new Date()) {
  return toDateInput(addDays(from, DEFAULT_DUE_DAYS))
}

export function formatDateTime(date) {
  const d = new Date(date)
  return `${toDateInput(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 依工種推薦分包商：回傳第一個同工種廠商，找不到則為 null。 */
export function recommendContractor(tradeId, contractors = CONTRACTORS) {
  return contractors.find((c) => c.tradeId === tradeId) ?? null
}

export function findTrade(tradeId) {
  return TRADES.find((t) => t.id === tradeId) ?? null
}

/**
 * 產生缺失單號：DF-YYYYMMDD-NNN，流水號以當日既有單號最大值 +1。
 */
export function nextReportNo(existingNos, date = new Date()) {
  const prefix = `DF-${toDateInput(date).replaceAll('-', '')}-`
  const max = existingNos
    .filter((no) => no?.startsWith(prefix))
    .map((no) => Number(no.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export function createDraft(projectName = '') {
  return {
    id: crypto.randomUUID(),
    reportNo: '',
    projectName,
    building: '',
    floor: '',
    tradeId: '',
    item: '',
    description: '',
    photos: [],
    contractorId: '',
    dueDate: defaultDueDate(),
    severity: 'normal',
    status: 'open',
    createdAt: new Date().toISOString(),
  }
}

/** 各步驟必填檢查，回傳缺漏欄位提示（空陣列代表通過）。 */
export function validateStep(step, d) {
  const missing = []
  if (step === 1 && d.photos.length === 0) missing.push('至少 1 張缺失照片')
  if (step === 2) {
    if (!d.projectName.trim()) missing.push('工程專案')
    if (!d.floor) missing.push('樓層')
    if (!d.tradeId) missing.push('缺失工種')
    if (!d.item.trim()) missing.push('缺失項目')
  }
  if (step === 3) {
    if (!d.contractorId) missing.push('責任分包商')
    if (!d.dueDate) missing.push('限期改善日')
  }
  return missing
}
