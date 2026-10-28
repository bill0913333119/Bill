import { describe, expect, it } from 'vitest'
import { FLOORS, TRADES } from '../src/data/presets.js'
import { addUnique, expandFloorInput, sortFloors } from '../src/lib/floors.js'
import { cnToNumber, parseSpeech } from '../src/lib/voiceParse.js'
import { canClockOut, createLog, dayDefectStats, needsReminder, validateLog } from '../src/lib/worklog.js'

const ctx = { buildings: ['A棟', 'B棟', '公設'], floors: ['B1', '1F', '2F', '3F', 'RF'], trades: TRADES }

describe('cnToNumber', () => {
  it('handles arabic, positional and digit-by-digit chinese numerals', () => {
    expect(cnToNumber('12')).toBe(12)
    expect(cnToNumber('十二')).toBe(12)
    expect(cnToNumber('二十三')).toBe(23)
    expect(cnToNumber('十')).toBe(10)
    expect(cnToNumber('一百零一')).toBe(101)
    expect(cnToNumber('三零一')).toBe(301)
    expect(cnToNumber('兩')).toBe(2)
  })
})

describe('parseSpeech', () => {
  it('extracts building, floor, unit and item in one sentence', () => {
    const r = parseSpeech('A棟3樓301室牆面蜂窩', ctx)
    expect(r).toMatchObject({ building: 'A棟', floor: '3F', unit: '301', tradeId: 'masonry', item: '牆面蜂窩' })
    expect(r.rest).toBe('')
  })
  it('understands chinese numerals and spaces', () => {
    const r = parseSpeech('B棟 十二樓 三零一號 管線未封', ctx)
    expect(r).toMatchObject({ building: 'B棟', floor: '12F', unit: '301', tradeId: 'mep', item: '管線未封' })
  })
  it('maps basement and roof', () => {
    expect(parseSpeech('地下一樓 鋼筋外露', ctx)).toMatchObject({ floor: 'B1', tradeId: 'rebar' })
    expect(parseSpeech('屋頂 滲漏水', ctx)).toMatchObject({ floor: 'RF', item: '滲漏水' })
    expect(parseSpeech('屋突層', ctx).floor).toBe('屋突')
  })
  it('keeps unknown building letters and flags new floors', () => {
    expect(parseSpeech('C棟五樓', ctx)).toMatchObject({ building: 'C棟', floor: '5F', newFloor: true })
  })
  it('leaves unmatched speech in rest for the description', () => {
    expect(parseSpeech('2樓 牆角有裂縫約三公分', ctx)).toMatchObject({ floor: '2F', rest: '牆角有裂縫約三公分' })
  })
  it('does not treat a unit number as a floor', () => {
    const r = parseSpeech('301室', ctx)
    expect(r.unit).toBe('301')
    expect(r.floor).toBeUndefined()
  })
})

describe('floors', () => {
  it('expands ranges', () => {
    expect(expandFloorInput('1F~3F')).toEqual(['1F', '2F', '3F'])
    expect(expandFloorInput('B3-B1')).toEqual(['B3', 'B2', 'B1'])
    expect(expandFloorInput('5~3')).toEqual(['3F', '4F', '5F'])
    expect(expandFloorInput('夾層')).toEqual(['夾層'])
    expect(expandFloorInput('  ')).toEqual([])
  })
  it('sorts basement, above-ground, then others and de-duplicates', () => {
    expect(sortFloors(['RF', '2F', 'B1', '10F', 'B3', '2F'])).toEqual(['B3', 'B1', '2F', '10F', 'RF'])
    expect(addUnique(['1F'], ['1F', '2F', ''])).toEqual(['1F', '2F'])
  })
})

describe('worklog', () => {
  const day = '2026-10-28'
  it('requires content and head count before submit', () => {
    const log = createLog({ date: day, projectName: 'A案', engineer: '王大明' })
    expect(validateLog(log)).toEqual(['今日施工內容', '出工人數'])
    expect(validateLog({ ...log, workContent: '3F 泥作', manpower: '12' })).toEqual([])
    expect(log.id).toBe('2026-10-28_王大明')
  })
  it('allows clock-out only after the log is submitted', () => {
    const log = createLog({ date: day, engineer: 'x' })
    expect(canClockOut(log)).toBe(false)
    expect(canClockOut({ ...log, submittedAt: '2026-10-28T09:00:00Z' })).toBe(true)
  })
  it('reminds from 17:00 until submitted', () => {
    const log = createLog({ date: day, engineer: 'x' })
    expect(needsReminder(log, new Date(2026, 9, 28, 16, 59))).toBe(false)
    expect(needsReminder(log, new Date(2026, 9, 28, 17, 0))).toBe(true)
    expect(needsReminder({ ...log, submittedAt: 'x' }, new Date(2026, 9, 28, 18, 0))).toBe(false)
  })
  it('counts defects opened and closed on the day', () => {
    const at = (h) => new Date(2026, 9, 28, h).toISOString()
    const records = [
      { projectName: 'A', createdAt: at(9), closedAt: null },
      { projectName: 'A', createdAt: at(10), closedAt: at(15) },
      { projectName: 'B', createdAt: at(10), closedAt: null },
      { projectName: 'A', createdAt: new Date(2026, 9, 20).toISOString(), closedAt: at(11) },
    ]
    expect(dayDefectStats(records, day, 'A')).toEqual({ opened: 2, closed: 2 })
  })
})

describe('default floors', () => {
  it('covers B6 to 30F plus roof, already in display order', () => {
    expect(FLOORS.slice(0, 7)).toEqual(['B6', 'B5', 'B4', 'B3', 'B2', 'B1', '1F'])
    expect(FLOORS).toContain('30F')
    expect(FLOORS).not.toContain('31F')
    expect(FLOORS.filter((f) => /^\d+F$/.test(f))).toHaveLength(30)
    expect(sortFloors(FLOORS).slice(0, 36)).toEqual(FLOORS.slice(0, 36))
  })
})
