// 現場快選資料：樓層九宮格、工種卡片、常見缺失項目、工種對應分包商。
// 正式上線後可改由後端 /api/presets 下發，此處為預設值。

// 地下 6 層至地上 30 層，另含屋頂與常用非樓層位置
export const FLOORS = [
  ...Array.from({ length: 6 }, (_, i) => `B${6 - i}`),
  ...Array.from({ length: 30 }, (_, i) => `${i + 1}F`),
  'RF', '屋突', '外牆', '車道', '中庭',
]

// 舊版預設（B3～15F）：裝置上仍是這份未修改的清單時，自動升級為新預設
export const LEGACY_FLOORS = [
  'B3', 'B2', 'B1',
  ...Array.from({ length: 15 }, (_, i) => `${i + 1}F`),
  'RF', '屋突', '外牆', '車道', '中庭',
]

// 案場：輸入工程專案時可直接點選
export const PROJECTS = ['六張犁']

export const BUILDINGS = ['A棟', 'B棟', 'C棟', '公設']

export const TRADES = [
  {
    id: 'waterproof',
    label: '防水',
    icon: '💧',
    items: ['滲漏水', '防水層破損', '收邊不良', '洩水坡度不足', '排水孔阻塞'],
  },
  {
    id: 'masonry',
    label: '泥作',
    icon: '🧱',
    items: ['牆面不平整', '粉刷裂縫', '磁磚空心', '磁磚破損', '牆面蜂窩'],
  },
  {
    id: 'mep',
    label: '水電',
    icon: '⚡',
    items: ['管線未封', '留管位置錯誤', '線路外露', '開關盒歪斜', '套管未預埋'],
  },
  {
    id: 'rebar',
    label: '鋼筋',
    icon: '🏗️',
    items: ['鋼筋外露', '保護層不足', '搭接長度不足', '綁紮不確實', '箍筋間距過大'],
  },
  {
    id: 'formwork',
    label: '模板',
    icon: '🪵',
    items: ['模板變形', '支撐不足', '接縫漏漿', '垂直度偏差', '清潔口未清'],
  },
  {
    id: 'safety',
    label: '工安',
    icon: '⛑️',
    items: ['開口未防護', '護欄缺損', '未戴安全帽', '材料堆置不當', '施工架未固定'],
  },
]

export const CONTRACTORS = [
  { id: 'c1', name: '永固防水工程行', tradeId: 'waterproof', phone: '' },
  { id: 'c2', name: '大成泥作工班', tradeId: 'masonry', phone: '' },
  { id: 'c3', name: '光明水電工程', tradeId: 'mep', phone: '' },
  { id: 'c4', name: '鋼強鋼筋工程', tradeId: 'rebar', phone: '' },
  { id: 'c5', name: '協力模板工程', tradeId: 'formwork', phone: '' },
  { id: 'c6', name: '工地安衛小組', tradeId: 'safety', phone: '' },
]

export const SEVERITIES = [
  { id: 'normal', label: '一般', icon: '🟢' },
  { id: 'major', label: '重大', icon: '🔴' },
]

export const DEFAULT_DUE_DAYS = 3
export const MAX_PHOTOS = 3
