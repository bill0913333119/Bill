import { describe, expect, it } from 'vitest'
import {
  addSiteDays,
  blockingDefects,
  checkQualification,
  contractorScore,
  dueAtFor,
  locationText,
  missingPpe,
  remainingText,
  siteDate,
  siteTime,
  suggestContractor,
  validateWorker,
  zoneMatches,
} from '../shared/safety.js'

// 台灣時間 → Date
const tw = (s) => new Date(`${s}+08:00`)

describe('site date', () => {
  it('uses Taiwan time even when the clock is in UTC', () => {
    // UTC 16:30 = 台灣隔天 00:30
    expect(siteDate(new Date('2026-11-06T16:30:00Z'))).toBe('2026-11-07')
    expect(addSiteDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addSiteDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('formats site time and locations for messages', () => {
    expect(siteTime('2026-11-07T01:05:00Z')).toBe('11/7 09:05')
    expect(siteTime('2026-11-07T16:30:00Z')).toBe('11/8 00:30')
    expect(locationText({ building: 'A棟', floor: '3F', unit: '301' })).toBe('A棟 3F 301戶')
    expect(locationText({ floor: 'B1', unit: '機房' })).toBe('B1 機房')
  })
})

describe('SLA due time', () => {
  it('gives A-level defects 2 hours', () => {
    expect(dueAtFor('major', tw('2026-11-07T09:15:00')).toISOString()).toBe(tw('2026-11-07T11:15:00').toISOString())
  })
  it('gives B-level defects until 17:00 the same day, or the next day after work ends', () => {
    expect(dueAtFor('normal', tw('2026-11-07T09:15:00')).toISOString()).toBe(tw('2026-11-07T17:00:00').toISOString())
    expect(dueAtFor('normal', tw('2026-11-07T17:30:00')).toISOString()).toBe(tw('2026-11-08T17:00:00').toISOString())
  })
  it('formats the remaining time', () => {
    const now = tw('2026-11-07T10:00:00')
    expect(remainingText(tw('2026-11-07T11:20:00'), now)).toEqual({ text: '剩 1 小時 20 分', overdue: false })
    expect(remainingText(tw('2026-11-07T09:25:00'), now)).toEqual({ text: '逾時 35 分', overdue: true })
    expect(remainingText(tw('2026-11-10T10:00:00'), now).text).toBe('剩 3 天')
    expect(remainingText(null, now).text).toBe('')
  })
})

describe('zones', () => {
  const zone = { building: 'A棟', floors: ['3F', '4F'] }
  it('matches building and any of the checked-in floors', () => {
    expect(zoneMatches(zone, { building: 'A棟', floor: '4F' })).toBe(true)
    expect(zoneMatches(zone, { building: 'B棟', floor: '4F' })).toBe(false)
    expect(zoneMatches(zone, { building: 'A棟', floor: '5F' })).toBe(false)
  })
  it('treats an empty building or floor list as the whole site', () => {
    expect(zoneMatches({ floors: [] }, { building: 'C棟', floor: 'B2' })).toBe(true)
    expect(zoneMatches(zone, { building: '', floor: '3F' })).toBe(true)
  })
})

describe('qualification check', () => {
  const day = '2026-11-07'
  const ok = { insuranceOk: true, trainingUntil: '2027-06-30', licenses: [], verifiedAt: '2026-11-01T00:00:00Z' }

  it('allows a fully valid worker', () => {
    const r = checkQualification(ok, day)
    expect(r).toMatchObject({ allowed: true, blocks: [], warnings: [] })
    expect(r.passed).toContain('勞保／職災保險：已投保')
  })
  it('blocks missing insurance and expired or missing safety training', () => {
    expect(checkQualification({ ...ok, insuranceOk: false }, day).blocks).toEqual(['尚未確認勞保（或職災保險）投保'])
    expect(checkQualification({ ...ok, trainingUntil: '2026-11-06' }, day).allowed).toBe(false)
    expect(checkQualification({ ...ok, trainingUntil: '' }, day).blocks).toEqual(['未填寫安衛教育訓練效期'])
    // 當天到期仍有效
    expect(checkQualification({ ...ok, trainingUntil: day }, day).allowed).toBe(true)
  })
  it('warns about expired or expiring licenses and unverified workers without blocking', () => {
    const r = checkQualification(
      {
        ...ok,
        verifiedAt: null,
        licenses: [
          { type: '吊掛作業', until: '2026-10-31' },
          { type: '高空工作車', until: '2026-11-20' },
        ],
      },
      day,
    )
    expect(r.allowed).toBe(true)
    expect(r.warnings).toEqual([
      '吊掛作業 已於 2026-10-31 到期，今日不得從事該項作業',
      '高空工作車 將於 2026-11-20 到期',
      '身分與證照尚未經工務所核驗，請攜帶證件至工務所',
    ])
  })
})

describe('worker profile validation', () => {
  const base = { name: '王大明', phone: '0912-345-678', contractorId: 'c2', role: 'worker', licenses: [] }
  it('accepts a complete profile', () => expect(validateWorker(base)).toEqual([]))
  it('lists every problem', () => {
    expect(validateWorker({ ...base, name: ' ', phone: '123', role: 'boss', licenses: [{ type: '', until: 'x' }] })).toEqual([
      '姓名',
      '手機號碼',
      '身分',
      '證照名稱或效期',
    ])
  })
})

describe('PPE self check', () => {
  it('requires helmet, shoes and vest, plus a harness when working at height', () => {
    expect(missingPpe({ helmet: true, shoes: true, vest: true })).toEqual([])
    expect(missingPpe({ helmet: true })).toEqual(['安全鞋', '反光背心'])
    expect(missingPpe({ helmet: true, shoes: true, vest: true }, { height: true })).toEqual(['全身式安全帶'])
  })
})

describe('next-day zone restriction', () => {
  const zone = { building: 'A棟', floors: ['3F'] }
  const d = (over) => ({
    id: 'x',
    contractorId: 'c2',
    severity: 'major',
    status: 'open',
    createdAt: tw('2026-11-06T10:00:00').toISOString(),
    building: 'A棟',
    floor: '3F',
    unlocked: false,
    ...over,
  })
  const run = (defects, contractorId = 'c2') => blockingDefects({ defects, contractorId, zone, date: '2026-11-07' })

  it('blocks the responsible crew from a zone with yesterday’s unresolved A-level defect', () => {
    expect(run([d()])).toHaveLength(1)
    expect(run([d({ status: 'replied' })])).toHaveLength(1)
  })
  it('does not block other crews, B-level, closed, today’s, other zones or unlocked defects', () => {
    expect(run([d()], 'c3')).toHaveLength(0)
    expect(run([d({ severity: 'normal' })])).toHaveLength(0)
    expect(run([d({ status: 'closed' })])).toHaveLength(0)
    expect(run([d({ createdAt: tw('2026-11-07T07:00:00').toISOString() })])).toHaveLength(0)
    expect(run([d({ floor: '5F' })])).toHaveLength(0)
    expect(run([d({ unlocked: true })])).toHaveLength(0)
    expect(run([d()], '')).toHaveLength(0)
  })
  it('counts a defect created late yesterday in UTC as yesterday in Taiwan', () => {
    // 2026-11-06 23:30 台灣 = 15:30 UTC，仍屬前一日
    expect(run([d({ createdAt: '2026-11-06T15:30:00Z' })])).toHaveLength(1)
    // 2026-11-07 00:30 台灣 = 11-06 16:30 UTC，屬今日 → 不管制
    expect(run([d({ createdAt: '2026-11-06T16:30:00Z' })])).toHaveLength(0)
  })
})

describe('dispatch suggestion', () => {
  const crews = [
    { contractorId: 'c2', tradeId: 'masonry', count: 6 },
    { contractorId: 'c3', tradeId: 'mep', count: 3 },
  ]
  it('prefers the reporter’s choice, then the matching trade, then the only crew present', () => {
    expect(suggestContractor({ categoryId: 'fall', presentCrews: crews, chosenId: 'c5' })).toBe('c5')
    expect(suggestContractor({ categoryId: 'electric', presentCrews: crews })).toBe('c3')
    expect(suggestContractor({ categoryId: 'fall', presentCrews: [crews[0]] })).toBe('c2')
  })
  it('leaves the decision to the site office when unclear', () => {
    expect(suggestContractor({ categoryId: 'fall', presentCrews: crews })).toBeNull()
    expect(suggestContractor({ categoryId: 'electric', presentCrews: [] })).toBeNull()
  })
})

describe('contractor score', () => {
  it('weights check-in compliance, on-time remediation and defect count', () => {
    expect(contractorScore({})).toEqual({ score: 100, checkinRate: 100, onTimeRate: 100, defectScore: 100 })
    expect(contractorScore({ checkins: 18, blocked: 2, major: 1, normal: 3, onTime: 3, judged: 4 })).toEqual({
      score: 81, // 0.4×90 + 0.4×75 + 0.2×75
      checkinRate: 90,
      onTimeRate: 75,
      defectScore: 75,
    })
    expect(contractorScore({ major: 20 }).defectScore).toBe(0)
  })
})
