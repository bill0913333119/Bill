import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.line.me/v2/bot'

export function verifySignature(channelSecret, rawBody, signature) {
  if (!channelSecret || !signature) return false
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest()
  const given = Buffer.from(signature, 'base64')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** LINE Messaging API 用戶端；未設定 token 時所有呼叫為 no-op。 */
export function lineClient({ channelAccessToken }, fetchImpl = globalThis.fetch) {
  const enabled = Boolean(channelAccessToken)
  async function call(path, body) {
    if (!enabled) return null
    const res = await fetchImpl(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`LINE API ${path} ${res.status}: ${await res.text()}`)
    return res
  }
  return {
    enabled,
    reply: (replyToken, messages) => call('/message/reply', { replyToken, messages }),
    push: (to, messages) => call('/message/push', { to, messages }),
  }
}
