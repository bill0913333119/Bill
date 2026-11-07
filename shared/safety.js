// 工人進場報到＋全員吹哨＋整改閉環：前後端共用的規則（純函式，不依賴任何套件）。
// 工地時間一律以台灣時間（UTC+8，無日光節約）計算；伺服器跑在 UTC 也不會跨日算錯。

export const SITE_TZ = 'Asia/Taipei'
const SITE_OFFSET = '+08:00'
const HOUR = 3600_000
const DAY = 24 * HOUR

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const WORK_END = '17:00' // 收工時間：B 級缺失限當日此時前完成

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TZ })

/** 工地當地日期 YYYY-MM-DD。 */
export const siteDate = (d = new Date()) => dateFmt.format(new Date(d))

const timeFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: SITE_TZ,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 工地當地時間「11/7 09:05」，用於期限顯示與 LINE 訊息。 */
export function siteTime(d) {
  const p = Object.fromEntries(timeFmt.formatToParts(new Date(d)).map((x) => [x.type, x.value]))
  return `${Number(p.month)}/${Number(p.day)} ${p.hour}:${p.minute}`
}

/** 工地日期加減天數（YYYY-MM-DD → YYYY-MM-DD）。 */
export function addSiteDays(date, days) {
  return siteDate(new Date(new Date(`${date}T12:00:00${SITE_OFFSET}`).getTime() + days * DAY))
}

/** 某工地日期的收工時刻。 */
export const endOfWorkday = (date) => new Date(`${date}T${WORK_END}:00${SITE_OFFSET}`)

// ---------- 選單資料 ----------

/** 工安隨手拍分類：tradeId 決定通知單上的工種；preferTrade 用來在在場工班中推薦責任工班。 */
export const SAFETY_CATEGORIES = [
  { id: 'fall', label: '防墜／高處作業', icon: '🪜', tradeId: 'safety' },
  { id: 'falling', label: '墜落物／吊掛', icon: '🏗️', tradeId: 'safety' },
  { id: 'opening', label: '開口防護', icon: '🕳️', tradeId: 'safety' },
  { id: 'electric', label: '臨時用電', icon: '⚡', tradeId: 'mep', preferTrade: 'mep' },
  { id: 'machine', label: '機具設備', icon: '🚜', tradeId: 'safety' },
  { id: 'fire', label: '消防／動火', icon: '🔥', tradeId: 'safety' },
  { id: 'ppe', label: '未配戴防護具', icon: '🦺', tradeId: 'safety' },
  { id: 'housekeeping', label: '材料堆置／環境', icon: '📦', tradeId: 'safety' },
  { id: 'signage', label: '警示標示缺損', icon: '⚠️', tradeId: 'safety' },
  { id: 'other', label: '其他危險', icon: '❓', tradeId: 'safety' },
]
export const categoryById = (id) => SAFETY_CATEGORIES.find((c) => c.id === id) ?? null

/** 個人防護具自檢：required 一律必備；requiredFor: 'height' 表示當日有高處作業時必備。 */
export const PPE_ITEMS = [
  { id: 'helmet', label: '安全帽（扣緊頤帶）', icon: '⛑️', required: true },
  { id: 'shoes', label: '安全鞋', icon: '🥾', required: true },
  { id: 'vest', label: '反光背心', icon: '🦺', required: true },
  { id: 'harness', label: '全身式安全帶', icon: '🪢', requiredFor: 'height' },
  { id: 'gloves', label: '工作手套', icon: '🧤' },
  { id: 'eyes', label: '護目鏡／面罩', icon: '🥽' },
  { id: 'mask', label: '口罩／呼吸防護具', icon: '😷' },
  { id: 'ears', label: '耳塞／耳罩', icon: '🎧' },
]

/** 回傳尚未勾選的必備防護具名稱。 */
export function missingPpe(ppe = {}, { height = false } = {}) {
  return PPE_ITEMS.filter((p) => (p.required || (height && p.requiredFor === 'height')) && !ppe[p.id]).map((p) => p.label)
}

export const LICENSE_TYPES = [
  '高空工作車操作人員',
  '施工架組配作業主管',
  '模板支撐作業主管',
  '鋼構組配作業主管',
  '露天開挖作業主管',
  '屋頂作業主管',
  '移動式起重機操作人員',
  '起重機具吊掛作業人員',
  '堆高機操作人員',
  '缺氧作業主管',
  '有機溶劑作業主管',
  '其他',
]

export const WORKER_ROLES = [
  { id: 'worker', label: '作業人員' },
  { id: 'leader', label: '工班長' },
  { id: 'manager', label: '分包商負責人' },
]
export const roleLabel = (id) => WORKER_ROLES.find((r) => r.id === id)?.label ?? id

/** 當日危害告知（TBM）預設內容；工務所可每天改寫。 */
export const DEFAULT_HAZARDS = [
  '高度 2 公尺以上作業須使用全身式安全帶並確實鉤掛',
  '開口、樓板邊緣護欄不得任意拆除；拆除須通報並設置警示',
  '吊掛作業下方及迴轉半徑內禁止人員進入',
  '臨時用電須經漏電斷路器，電線不得浸水、破皮或隨地拖拉',
  '動火作業須申請許可、清除可燃物並備妥滅火器',
  '施工架上不得堆放材料，作業前確認護欄與繫牆桿完整',
  '發現危險立即停止作業並通報，可使用匿名吹哨',
]

export const STATUS_LABELS = {
  pending: '待審派工',
  open: '待改善',
  replied: '待複查',
  closed: '已銷案',
  dismissed: '不成立',
}

export const SOURCE_LABELS = {
  engineer: '工程師開單',
  worker: '現場人員通報',
  whistle: '匿名吹哨',
}

// ---------- 限期改善（SLA） ----------

export const SLA = {
  major: { level: 'A', label: 'A級・立即危險', hint: '2 小時內排除', hours: 2 },
  normal: { level: 'B', label: 'B級・一般', hint: '今日收工前完成' },
}

/** 通報點數：通報屬實並完成改善（銷案）後發給具名通報人。 */
export const REPORT_POINTS = { major: 20, normal: 10 }

/**
 * 依等級計算改善期限：A 級為通報後 2 小時；B 級為當日收工（17:00），收工後才通報則延至隔日收工。
 */
export function dueAtFor(severity, reportedAt = new Date()) {
  const t = new Date(reportedAt)
  if (severity === 'major') return new Date(t.getTime() + SLA.major.hours * HOUR)
  const due = endOfWorkday(siteDate(t))
  return t >= due ? new Date(due.getTime() + DAY) : due
}

/** 剩餘時間文字：「剩 1 小時 20 分」「逾時 35 分」「剩 2 天」。 */
export function remainingText(dueAt, now = new Date()) {
  if (!dueAt) return { text: '', overdue: false }
  const diff = new Date(dueAt).getTime() - new Date(now).getTime()
  const overdue = diff < 0
  const mins = Math.floor(Math.abs(diff) / 60_000)
  let span
  if (mins >= 48 * 60) span = `${Math.floor(mins / (24 * 60))} 天`
  else if (mins >= 60) span = `${Math.floor(mins / 60)} 小時${mins % 60 ? ` ${mins % 60} 分` : ''}`
  else span = `${mins} 分`
  return { text: overdue ? `逾時 ${span}` : `剩 ${span}`, overdue }
}

// ---------- 工區 ----------

/**
 * 工區比對：報到工區（棟別＋多個樓層，空白表示不限）是否涵蓋某個位置。
 * @param {{ building?: string, floors?: string[] }} zone
 * @param {{ building?: string, floor?: string }} loc
 */
export function zoneMatches(zone = {}, loc = {}) {
  const floors = zone.floors ?? []
  if (zone.building && loc.building && zone.building !== loc.building) return false
  if (floors.length && loc.floor && !floors.includes(loc.floor)) return false
  return true
}

/** 位置文字：「A棟 3F 301戶」。 */
export function locationText(d = {}) {
  const unit = d.unit ? (/^\d+$/.test(d.unit) ? `${d.unit}戶` : d.unit) : ''
  return [d.building, d.floor, unit].filter(Boolean).join(' ')
}

export const zoneLabel = (zone = {}) =>
  `${zone.building || '全區'} ${zone.floors?.length ? zone.floors.join('、') : '全部樓層'}`

// ---------- 進場資格檢核 ----------

export const normalizePhone = (p) => String(p ?? '').replace(/\D/g, '')

/**
 * 三合一進場校驗中的資格檢核。
 * blocks：不得報到（勞保、安衛教育訓練）；warnings：可報到但須注意（證照過期不得從事該項作業、未經核驗）。
 * @param {{ insuranceOk?: boolean, trainingUntil?: string, licenses?: {type: string, until?: string}[], verifiedAt?: string }} w
 * @param {string} date 工地日期 YYYY-MM-DD
 */
export function checkQualification(w, date, { soonDays = 30 } = {}) {
  const blocks = []
  const warnings = []
  const passed = []
  const soon = addSiteDays(date, soonDays)
  if (!w.insuranceOk) blocks.push('尚未確認勞保（或職災保險）投保')
  else passed.push('勞保／職災保險：已投保')
  if (!w.trainingUntil) blocks.push('未填寫安衛教育訓練效期')
  else if (w.trainingUntil < date) blocks.push(`安衛教育訓練已於 ${w.trainingUntil} 到期，請先回訓`)
  else {
    passed.push(`安衛教育訓練：有效至 ${w.trainingUntil}`)
    if (w.trainingUntil <= soon) warnings.push(`安衛教育訓練將於 ${w.trainingUntil} 到期，請盡快回訓`)
  }
  for (const l of w.licenses ?? []) {
    if (!l.until) warnings.push(`${l.type}：未填效期，請至工務所核對`)
    else if (l.until < date) warnings.push(`${l.type} 已於 ${l.until} 到期，今日不得從事該項作業`)
    else {
      passed.push(`${l.type}：有效至 ${l.until}`)
      if (l.until <= soon) warnings.push(`${l.type} 將於 ${l.until} 到期`)
    }
  }
  if (!w.verifiedAt) warnings.push('身分與證照尚未經工務所核驗，請攜帶證件至工務所')
  return { allowed: blocks.length === 0, blocks, warnings, passed }
}

/** 註冊／修改資料的欄位檢查；回傳錯誤訊息（空陣列代表通過）。 */
export function validateWorker(w) {
  const errors = []
  if (!String(w.name ?? '').trim()) errors.push('姓名')
  const phone = normalizePhone(w.phone)
  if (phone.length < 8 || phone.length > 15) errors.push('手機號碼')
  if (!w.contractorId) errors.push('所屬分包商／工班')
  if (!WORKER_ROLES.some((r) => r.id === w.role)) errors.push('身分')
  if (w.trainingUntil && !DATE_RE.test(w.trainingUntil)) errors.push('安衛教育訓練效期格式')
  const licenses = w.licenses ?? []
  if (!Array.isArray(licenses) || licenses.length > 10) errors.push('證照（最多 10 張）')
  else if (licenses.some((l) => !String(l?.type ?? '').trim() || (l.until && !DATE_RE.test(l.until)))) errors.push('證照名稱或效期')
  return errors
}

// ---------- 隔日工區管制 ----------

/**
 * 隔日報到管制：該工班在此工區有「前一日（含）以前」開立、尚未銷案的 A 級缺失，且今日尚未會同安衛解鎖。
 * @param {{ defects: object[], contractorId: string, zone: object, date: string }} p
 *   defects 需含 contractorId、severity、status、createdAt、building、floor、unlocked
 */
export function blockingDefects({ defects, contractorId, zone, date }) {
  if (!contractorId) return []
  return defects.filter(
    (d) =>
      d.contractorId === contractorId &&
      d.severity === 'major' &&
      (d.status === 'open' || d.status === 'replied') &&
      siteDate(d.createdAt) < date &&
      !d.unlocked &&
      zoneMatches(zone, d),
  )
}

// ---------- 派工 ----------

/**
 * 推薦責任工班：通報人指定 > 分類對應工種且在場 > 該工區只有一個工班在場；無法判定回傳 null（交由工務所派工）。
 * @param {{ categoryId?: string, presentCrews?: {contractorId: string, tradeId?: string, count: number}[], chosenId?: string }} p
 */
export function suggestContractor({ categoryId, presentCrews = [], chosenId }) {
  if (chosenId) return chosenId
  const cat = categoryById(categoryId)
  if (cat?.preferTrade) {
    const match = presentCrews.filter((c) => c.tradeId === cat.preferTrade).sort((a, b) => b.count - a.count)[0]
    if (match) return match.contractorId
  }
  if (presentCrews.length === 1) return presentCrews[0].contractorId
  return null
}

// ---------- 分包商評比 ----------

export const SCORE_FORMULA =
  '綜合分數 = 報到合規率 × 40% ＋ 整改準時率 × 40% ＋ 缺失分 × 20%；缺失分 = 100 − 5 ×（A 級件數 × 2 ＋ B 級件數），最低 0'

/**
 * @param {{ checkins?: number, blocked?: number, major?: number, normal?: number, onTime?: number, judged?: number }} s
 *   checkins 完成報到人次、blocked 被擋人次、major/normal 被通報件數、judged 已到期或已改善件數、onTime 其中準時件數
 */
export function contractorScore({ checkins = 0, blocked = 0, major = 0, normal = 0, onTime = 0, judged = 0 }) {
  const checkinRate = checkins + blocked ? (checkins / (checkins + blocked)) * 100 : 100
  const onTimeRate = judged ? (onTime / judged) * 100 : 100
  const defectScore = Math.max(0, 100 - 5 * (2 * major + normal))
  return {
    score: Math.round(0.4 * checkinRate + 0.4 * onTimeRate + 0.2 * defectScore),
    checkinRate: Math.round(checkinRate),
    onTimeRate: Math.round(onTimeRate),
    defectScore,
  }
}
