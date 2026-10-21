import { describe, expect, it } from 'vitest'
import { createDraft, defaultDueDate, nextReportNo, recommendContractor, validateStep } from '../src/lib/defect.js'
import { appendSentence } from '../src/lib/speech.js'

describe('nextReportNo', () => {
  const day = new Date(2026, 9, 21)
  it('starts at 001 for a new day', () => {
    expect(nextReportNo(['DF-20261020-007'], day)).toBe('DF-20261021-001')
  })
  it('increments the max serial of the same day', () => {
    expect(nextReportNo(['DF-20261021-001', 'DF-20261021-004', 'DF-20261021-002'], day)).toBe('DF-20261021-005')
  })
})

describe('defaults', () => {
  it('due date is creation day + 3', () => {
    expect(defaultDueDate(new Date(2026, 11, 30))).toBe('2027-01-02')
  })
  it('recommends contractor by trade', () => {
    expect(recommendContractor('masonry').name).toBe('大成泥作工班')
    expect(recommendContractor('unknown')).toBeNull()
  })
  it('new draft defaults to normal severity and remembered project', () => {
    const d = createDraft('A案')
    expect(d.severity).toBe('normal')
    expect(d.projectName).toBe('A案')
  })
})

describe('validateStep', () => {
  it('requires photo on step 1', () => {
    expect(validateStep(1, createDraft())).toEqual(['至少 1 張缺失照片'])
  })
  it('requires project, floor, trade, item on step 2', () => {
    expect(validateStep(2, createDraft())).toHaveLength(4)
    expect(validateStep(2, { ...createDraft('A案'), floor: '3F', tradeId: 'mep', item: '管線未封' })).toEqual([])
  })
})

describe('appendSentence', () => {
  it('adds full-width punctuation to dictated text', () => {
    expect(appendSentence('', '牆角滲水')).toBe('牆角滲水。')
    expect(appendSentence('牆角滲水。', '需重做防水')).toBe('牆角滲水。需重做防水。')
    expect(appendSentence('牆角滲水', '需重做')).toBe('牆角滲水，需重做。')
  })
})
