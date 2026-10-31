import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

/**
 * 將 A4 版面的 DOM（794×1123px，即 96dpi 下的 210×297mm）轉為 PDF Blob 與整頁預覽圖。
 * 以瀏覽器排版後點陣化，中文字型無需另外嵌入，任何手機皆可正確顯示。
 */
export async function renderA4Pdf(el) {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageW = 210
  const pageH = 297
  const imgH = (canvas.height * pageW) / canvas.width
  const img = canvas.toDataURL('image/jpeg', 0.92)

  // 內容超過一頁時自動分頁
  let offset = 0
  do {
    if (offset > 0) pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, -offset, pageW, imgH)
    offset += pageH
  } while (offset < imgH - 1)

  // image：整頁圖片，供畫面上直接預覽（不需下載或開新分頁）
  return { blob: pdf.output('blob'), image: img }
}
