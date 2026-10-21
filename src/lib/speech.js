// 語音轉文字（Web Speech API），語言固定為繁體中文（台灣）。
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const speechSupported = Boolean(Recognition)

/**
 * 開始收音；onText 收到最終辨識結果，onEnd 於結束時呼叫。回傳 stop()。
 */
export function startDictation({ onText, onEnd, onError }) {
  const rec = new Recognition()
  rec.lang = 'zh-TW'
  rec.continuous = true
  rec.interimResults = false
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim())
    }
  }
  rec.onerror = (e) => onError?.(e.error)
  rec.onend = () => onEnd?.()
  rec.start()
  return () => rec.stop()
}

/** 語音結果常無標點：句尾無標點時自動補上全形逗號／句號。 */
export function appendSentence(text, sentence) {
  if (!sentence) return text
  const s = /[。！？，、]$/.test(sentence) ? sentence : `${sentence}。`
  if (!text) return s
  return /[。！？，、\n]$/.test(text) ? text + s : `${text}，${s}`
}
