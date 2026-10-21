// 建立 LINE 官方帳號常駐選單（Rich Menu）並設為預設。
// 用法：LINE_CHANNEL_ACCESS_TOKEN=... LIFF_ID=... npm run richmenu
import { readFile } from 'node:fs/promises'

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
const liffId = process.env.LIFF_ID
if (!token || !liffId) {
  console.error('請設定 LINE_CHANNEL_ACCESS_TOKEN 與 LIFF_ID')
  process.exit(1)
}

const liff = `https://liff.line.me/${liffId}`
const headers = { Authorization: `Bearer ${token}` }

async function call(url, init) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status} ${await res.text()}`)
  return res.status === 200 ? res.json().catch(() => ({})) : {}
}

const W = 2500
const H = 843
const area = (i, action) => ({ bounds: { x: Math.round((W / 3) * i), y: 0, width: Math.round(W / 3), height: H }, action })

const { richMenuId } = await call('https://api.line.me/v2/bot/richmenu', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    size: { width: W, height: H },
    selected: true,
    name: '工地缺失改善',
    chatBarText: '📋 缺失登錄',
    areas: [
      area(0, { type: 'uri', label: '新增缺失', uri: liff }),
      area(1, { type: 'uri', label: '缺失紀錄', uri: `${liff}#/records` }),
      area(2, { type: 'message', label: '使用說明', text: '說明' }),
    ],
  }),
})

await call(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/png' },
  body: await readFile(new URL('../assets/richmenu.png', import.meta.url)),
})
await call(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST' })

console.log(`✅ Rich Menu 已建立並設為預設：${richMenuId}`)
