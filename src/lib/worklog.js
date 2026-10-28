import { toDateInput } from './defect.js'

export const WEATHERS = [
  { id: 'sunny', icon: '☀️', label: '晴' },
  { id: 'cloudy', icon: '☁️', label: '陰' },
  { id: 'rain', icon: '🌧️', label: '雨' },
  { id: 'storm', icon: '⛈️', label: '大雨' },
]

export const REMINDER_HOUR = 17

/** 每位工程師每天每專案一份日誌；id 固定，離線重送不會重複。 */
export const logId = (date, engineer) => `${date}_${engineer}`

export function createLog({ date = toDateInput(new Date()), projectName = '', engineer = '' } = {}) {
  return {
    id: logId(date, engineer),
    date,
    projectName,
    engineer,
    weather: 'sunny',
    workContent: '',
    manpower: '',
    issues: '',
    tomorrowPlan: '',
    defectsOpened: 0,
    defectsClosed: 0,
    submittedAt: null,
    clockOutAt: null,
    synced: false,
  }
}

export function validateLog(log) {
  const missing = []
  if (!log.engineer.trim()) missing.push('工程師姓名（至「設定」填寫）')
  if (!log.projectName.trim()) missing.push('工程專案')
  if (!log.workContent.trim()) missing.push('今日施工內容')
  if (!log.manpower.trim()) missing.push('出工人數')
  return missing
}

/** 當日缺失統計：以開單日、結案日落在該日為準。 */
export function dayDefectStats(records, date, projectName) {
  const day = (iso) => (iso ? toDateInput(new Date(iso)) : '')
  const mine = records.filter((r) => !projectName || r.projectName === projectName)
  return {
    opened: mine.filter((r) => day(r.createdAt) === date).length,
    closed: mine.filter((r) => day(r.closedAt) === date).length,
  }
}

/** 日誌送出後才可簽退下班。 */
export const canClockOut = (log) => Boolean(log?.submittedAt)

/** 到了提醒時間仍未送出日誌 → 顯示紅色提醒。 */
export function needsReminder(log, now = new Date(), hour = REMINDER_HOUR) {
  return now.getHours() >= hour && !log?.submittedAt
}
