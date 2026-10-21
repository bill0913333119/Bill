import { describe, expect, it } from 'vitest'
import { defectFlex } from '../shared/flex.js'

const d = {
  reportNo: 'DF-20261021-001',
  projectName: '信義案',
  floor: '3F',
  tradeLabel: '🧱 泥作',
  item: '牆面蜂窩',
  contractorName: '大成泥作工班',
  dueDate: '2026-10-24',
  severity: 'major',
}

describe('defectFlex', () => {
  it('builds a bubble with reply and PDF buttons', () => {
    const m = defectFlex({ ...d, replyUrl: 'https://x/#/reply/t', pdfUrl: 'https://x/a.pdf', photoUrl: 'https://x/p.jpg' })
    expect(m.type).toBe('flex')
    expect(m.altText).toContain('重大缺失')
    expect(m.contents.hero.url).toBe('https://x/p.jpg')
    expect(m.contents.footer.contents.map((b) => b.action.uri)).toEqual(['https://x/#/reply/t', 'https://x/a.pdf'])
  })

  it('omits hero for non-https photos (LINE requires https)', () => {
    const m = defectFlex({ ...d, photoUrl: 'data:image/jpeg;base64,xx' })
    expect(m.contents.hero).toBeUndefined()
    expect(m.contents.footer).toBeUndefined()
  })
})
