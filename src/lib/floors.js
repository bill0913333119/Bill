// 樓層清單編輯：支援「1F~20F」「B3~B1」範圍批次新增。

const parse = (label) => {
  const m = label.trim().toUpperCase().match(/^(B)?(\d+)F?$/)
  return m ? { basement: Boolean(m[1]), n: Number(m[2]) } : null
}
const fmt = ({ basement, n }) => (basement ? `B${n}` : `${n}F`)

/** 回傳展開後的樓層標籤；非範圍輸入則原樣回傳單一項目。 */
export function expandFloorInput(input) {
  const text = input.trim()
  if (!text) return []
  const parts = text.split(/\s*[~～\-–—到至]\s*/)
  if (parts.length === 2) {
    const a = parse(parts[0])
    const b = parse(parts[1])
    if (a && b && a.basement === b.basement) {
      const [lo, hi] = a.n <= b.n ? [a.n, b.n] : [b.n, a.n]
      if (hi - lo > 99) return []
      const list = Array.from({ length: hi - lo + 1 }, (_, i) => fmt({ basement: a.basement, n: lo + i }))
      // 地下室由深到淺排列（B3, B2, B1）
      return a.basement ? list.reverse() : list
    }
  }
  const single = parse(text)
  return [single ? fmt(single) : text]
}

/** 地下室 → 地上樓層 → 其他，供選單排序。 */
export function sortFloors(list) {
  const rank = (f) => {
    const p = parse(f)
    if (!p) return [2, 0]
    return p.basement ? [0, -p.n] : [1, p.n]
  }
  return [...new Set(list)].sort((a, b) => {
    const [ra, na] = rank(a)
    const [rb, nb] = rank(b)
    return ra - rb || na - nb
  })
}

export function addUnique(list, values) {
  return [...list, ...values.filter((v) => v && !list.includes(v))]
}
