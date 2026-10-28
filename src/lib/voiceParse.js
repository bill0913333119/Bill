// 口述轉欄位：把「A棟 三樓 三零一室 牆面蜂窩」解析成棟別、樓層、戶別與缺失項目。

const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const CN_CHARS = '零〇一二兩三四五六七八九十百'
const NUM = `[0-9０-９${CN_CHARS}]+`

const toHalfWidth = (s) =>
  s.replace(/[０-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

/** 數字字串轉整數；支援「十二」「二十三」「一百零一」與逐字念法「三零一」。 */
export function cnToNumber(raw) {
  const s = toHalfWidth(raw)
  if (/^\d+$/.test(s)) return Number(s)
  if (![...s].some((c) => c === '十' || c === '百')) {
    return Number([...s].map((c) => CN_DIGIT[c] ?? '').join(''))
  }
  let total = 0
  let current = 0
  for (const c of s) {
    if (c === '百') {
      total += (current || 1) * 100
      current = 0
    } else if (c === '十') {
      total += (current || 1) * 10
      current = 0
    } else current = CN_DIGIT[c] ?? current
  }
  return total + current
}

const take = (text, re) => {
  const m = text.match(re)
  return m ? { m, rest: text.replace(m[0], ' ') } : { m: null, rest: text }
}

/**
 * @param {string} input 語音辨識文字
 * @param {{ buildings?: string[], floors?: string[], trades?: {id:string, items:string[]}[] }} ctx
 * @returns {{ building?: string, floor?: string, unit?: string, tradeId?: string, item?: string, rest: string }}
 */
export function parseSpeech(input, { buildings = [], floors = [], trades = [] } = {}) {
  let text = toHalfWidth(input).replace(/[，。,.、]/g, ' ')
  const out = {}

  // 棟別：先比對已設定的棟別名稱，其次「A棟」「3棟」「甲棟」
  const knownBuilding = [...buildings].sort((a, b) => b.length - a.length).find((b) => text.includes(b))
  if (knownBuilding) {
    out.building = knownBuilding
    text = text.replace(knownBuilding, ' ')
  } else {
    const r = take(text, new RegExp(`([A-Za-z]|${NUM}|[甲乙丙丁戊己])\\s*棟`))
    if (r.m) {
      const key = r.m[1]
      out.building = `${/^[A-Za-z]$/.test(key) ? key.toUpperCase() : /^[甲乙丙丁戊己]$/.test(key) ? key : cnToNumber(key)}棟`
      text = r.rest
    }
  }

  // 樓層：地下三樓 → B3、屋頂 → RF
  let r = take(text, new RegExp(`(?:地下|B)\\s*(${NUM})\\s*(?:樓|層|F)?`, 'i'))
  if (r.m && !/^B[A-Za-z]/i.test(r.m[0])) {
    out.floor = `B${cnToNumber(r.m[1])}`
    text = r.rest
  } else {
    r = take(text, /屋突/)
    if (r.m) out.floor = '屋突'
    else {
      r = take(text, /屋頂|頂樓|RF|R樓/i)
      if (r.m) out.floor = 'RF'
      else {
        r = take(text, new RegExp(`(${NUM})\\s*(?:樓|層|F)(?![a-zA-Z])`, 'i'))
        if (r.m) out.floor = `${cnToNumber(r.m[1])}F`
      }
    }
    if (r.m) text = r.rest
  }
  // 樓層若不在清單中仍保留，由畫面自動加入選項
  if (out.floor && floors.length && !floors.includes(out.floor)) out.newFloor = true

  // 戶別編號：301室／三零一號／A3戶
  r = take(text, new RegExp(`([A-Za-z]?[0-9${CN_CHARS}]+(?:-[0-9]+)?)\\s*(?:戶|室|號)`))
  if (r.m) {
    const raw = r.m[1]
    out.unit = /[A-Za-z]/.test(raw) || raw.includes('-') ? raw.toUpperCase() : String(cnToNumber(raw))
    text = r.rest
  }

  // 缺失項目：比對常見項目（長詞優先），並帶出工種
  const candidates = trades.flatMap((t) => t.items.map((item) => ({ tradeId: t.id, item })))
  const hit = candidates.sort((a, b) => b.item.length - a.item.length).find((c) => text.includes(c.item))
  if (hit) {
    out.tradeId = hit.tradeId
    out.item = hit.item
    text = text.replace(hit.item, ' ')
  }

  out.rest = text.replace(/\s+/g, ' ').trim()
  return out
}
