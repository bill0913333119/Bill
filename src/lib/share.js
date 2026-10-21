export function pdfFile(blob, reportNo) {
  return new File([blob], `${reportNo}_缺失改善單.pdf`, { type: 'application/pdf' })
}

export function shareMessage(record, { tradeLabel, contractorName }) {
  const sev = record.severity === 'major' ? '🔴【重大缺失】' : '🟢【一般缺失】'
  return [
    `${sev} ${record.reportNo}`,
    `專案：${record.projectName}`,
    `位置：${[record.building, record.floor].filter(Boolean).join(' ')}`,
    `工種／項目：${tradeLabel}／${record.item}`,
    `責任廠商：${contractorName}`,
    `限期改善：${record.dueDate}`,
    '請於期限內完成改善並回傳改善後照片，謝謝！',
  ].join('\n')
}

export const canShareFiles = (file) =>
  typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] })

export function downloadFile(file) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * 分享至 LINE：
 * 1. 支援 Web Share API（手機）→ 喚起系統分享面板，選 LINE 直接傳送 PDF 實體檔。
 * 2. 不支援（桌機）→ 下載 PDF，並開啟 LINE 文字分享連結。
 * 回傳 'shared' | 'cancelled' | 'fallback'。
 */
export async function shareToLine(file, text) {
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: file.name, text })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  downloadFile(file)
  window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank', 'noopener')
  return 'fallback'
}
