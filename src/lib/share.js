import { formatDateTime, locationOf } from './defect.js'

export function pdfFile(blob, reportNo) {
  return new File([blob], `${reportNo}_缺失改善單.pdf`, { type: 'application/pdf' })
}

/**
 * LINE 隨附文字：欄位與 PDF 通知單一致，PDF 內含照片，文字則讓群組不開檔也能看到重點。
 */
export function shareMessage(record, { tradeLabel, contractorName }) {
  const sev = record.severity === 'major' ? '🔴【重大缺失】' : '🟢【一般缺失】'
  const closed = record.status === 'closed'
  return [
    closed ? `✅【已改善銷案】工程缺失改善通知單 ${record.reportNo}` : `${sev} 工程缺失改善通知單 ${record.reportNo}`,
    `專案：${record.projectName}`,
    `位置：${locationOf(record)}`,
    `工種／項目：${tradeLabel}／${record.item}`,
    record.description ? `說明：${record.description}` : '',
    `責任廠商：${contractorName}`,
    `限期改善：${record.dueDate}`,
    record.inspector ? `開單人員：${record.inspector}` : '',
    closed && record.closedAt ? `銷案時間：${formatDateTime(record.closedAt)}` : '',
    closed && record.reviewNote ? `銷案說明：${record.reviewNote}` : '',
    closed
      ? `（缺失照片 ${record.photos.length} 張與改善後照片 ${record.afterPhotos?.length ?? 0} 張對照，詳見附件 PDF）`
      : `（缺失照片與改善對照詳見附件 PDF，共 ${record.photos.length} 張）`,
    !closed && record.replyUrl ? `📷 回報改善：${record.replyUrl}` : '',
    record.pdfUrl ? `📄 下載：${record.pdfUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n')
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
