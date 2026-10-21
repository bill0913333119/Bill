// LINE Flex Message 圖文卡片：前端 LIFF shareTargetPicker 與後端推播共用。

const SEVERITY = {
  normal: { text: '一般缺失', color: '#16a34a' },
  major: { text: '重大缺失', color: '#dc2626' },
}

const row = (label, value, color = '#111111') => ({
  type: 'box',
  layout: 'baseline',
  spacing: 'sm',
  contents: [
    { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
    { type: 'text', text: value || '—', size: 'sm', color, flex: 5, wrap: true, weight: 'bold' },
  ],
})

const button = (label, uri, style = 'link') => ({
  type: 'button',
  style,
  height: 'sm',
  color: style === 'primary' ? '#f59e0b' : undefined,
  action: { type: 'uri', label, uri },
})

/**
 * @param {object} d 缺失資料（reportNo, projectName, building, floor, tradeLabel, item,
 *   contractorName, dueDate, severity, photoUrl?, pdfUrl?, replyUrl?）
 * @param {object} [opt] { title, note }：通知類訊息（例：廠商已回報）可覆寫標題與附註
 */
export function defectFlex(d, opt = {}) {
  const sev = SEVERITY[d.severity] ?? SEVERITY.normal
  const location = [d.building, d.floor].filter(Boolean).join(' ')
  const title = opt.title ?? '工地缺失改善通知'
  const footer = [
    d.replyUrl && button('📷 回報改善', d.replyUrl, 'primary'),
    d.pdfUrl && button('📄 下載 PDF 缺失單', d.pdfUrl),
  ].filter(Boolean)

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1e293b',
      paddingAll: 'md',
      contents: [
        { type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'md' },
        { type: 'text', text: `${d.reportNo}・${sev.text}`, color: sev.color === '#dc2626' ? '#fca5a5' : '#86efac', size: 'xs' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `${location}｜${d.item}`, weight: 'bold', size: 'lg', wrap: true },
        row('專案', d.projectName),
        row('工種', d.tradeLabel),
        row('責任廠商', d.contractorName),
        row('限期改善', d.dueDate, '#dc2626'),
        ...(opt.note ? [{ type: 'text', text: opt.note, size: 'sm', wrap: true, color: '#555555', margin: 'md' }] : []),
      ],
    },
  }
  if (d.photoUrl?.startsWith('https://')) {
    bubble.hero = { type: 'image', url: d.photoUrl, size: 'full', aspectRatio: '4:3', aspectMode: 'cover' }
  }
  if (footer.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer }

  return {
    type: 'flex',
    altText: `【${sev.text}】${d.reportNo} ${location} ${d.item}（限期 ${d.dueDate}）`.slice(0, 400),
    contents: bubble,
  }
}
