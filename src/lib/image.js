import { formatDateTime } from './defect.js'

const MAX_EDGE = 1600
const TARGET_BYTES = 1.5 * 1024 * 1024

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/**
 * 壓縮照片（長邊 1600px、目標 ≤1.5MB JPEG）並於右下角嵌入拍攝時間＋案名浮水印。
 * 回傳 dataURL，方便存入 IndexedDB 與嵌入 PDF。
 */
export async function processPhoto(file, { projectName = '', takenAt = new Date() } = {}) {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)

  const fontSize = Math.max(16, Math.round(w / 32))
  const lines = [formatDateTime(takenAt), projectName].filter(Boolean)
  ctx.font = `bold ${fontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  const pad = Math.round(fontSize * 0.6)
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2
  const boxH = lines.length * fontSize * 1.3 + pad
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(w - boxW, h - boxH, boxW, boxH)
  ctx.fillStyle = '#facc15'
  lines.forEach((line, i) => {
    ctx.fillText(line, w - pad, h - pad / 2 - (lines.length - 1 - i) * fontSize * 1.3)
  })

  let quality = 0.85
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  // dataURL 的 base64 約為原始位元組的 4/3
  while (dataUrl.length * 0.75 > TARGET_BYTES && quality > 0.4) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  return dataUrl
}
