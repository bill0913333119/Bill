import { existsSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import { defectFlex } from '../../shared/flex.js'
import { verifySignature } from './line.js'
import * as repo from './repo.js'
import { ALLOWED_TYPES } from './storage.js'

const IMAGE_TYPES = ALLOWED_TYPES.filter((t) => t.startsWith('image/'))
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => !String(body?.[f] ?? '').trim())
  if (missing.length) throw new HttpError(400, `缺少欄位：${missing.join(', ')}`)
}

const urlList = (v, storage, max) => {
  if (!Array.isArray(v) || v.length > max || !v.every((u) => typeof u === 'string' && storage.owns(u))) {
    throw new HttpError(400, `照片需為本系統上傳之網址，最多 ${max} 張`)
  }
  return v
}

/**
 * @param {object} deps { pool, storage, line, config }
 */
export function createApp({ pool, storage, line, config }) {
  const app = express()
  app.disable('x-powered-by')
  const dto = (row) => repo.toDto(row, config.publicUrl)

  const auth = (req, _res, next) => {
    if (config.appToken && req.get('authorization') !== `Bearer ${config.appToken}`) throw new HttpError(401, '未授權')
    next()
  }

  // 卡片資料：缺失 → LINE Flex
  const flexFor = (d, opt) => defectFlex({ ...d, photoUrl: d.photos[0] }, opt)

  async function notifyGroup(d, opt) {
    if (!line.enabled || !d.lineGroupId) return
    try {
      await line.push(d.lineGroupId, [flexFor(d, opt)])
    } catch (e) {
      console.error('LINE 推播失敗', e.message)
    }
  }

  // ---------- LINE webhook（需原始 body 驗證簽章，放在 json parser 之前） ----------
  app.post('/api/line/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    if (!verifySignature(config.line.channelSecret, req.body, req.get('x-line-signature'))) {
      throw new HttpError(401, 'invalid signature')
    }
    const { events = [] } = JSON.parse(req.body.toString('utf8'))
    const liffUrl = config.line.liffId ? `https://liff.line.me/${config.line.liffId}` : config.publicUrl
    for (const ev of events) {
      if (!ev.replyToken) continue
      const text = ev.type === 'message' && ev.message.type === 'text' ? ev.message.text.trim() : ''
      const bind = text.match(/^綁定\s*(.+)$/)
      let reply = null
      if (bind && ev.source.type === 'group') {
        await repo.bindLineGroup(pool, bind[1].trim(), ev.source.groupId)
        reply = `✅ 已將本群組綁定專案「${bind[1].trim()}」。廠商回報改善時會在這裡通知。`
      } else if (bind) {
        reply = '請在工地 LINE 群組中輸入「綁定 專案名稱」。'
      } else if (ev.type === 'join' || /^(缺失|說明|help)$/i.test(text)) {
        reply = `📋 工地缺失改善系統\n・登錄缺失：${liffUrl}\n・群組輸入「綁定 專案名稱」即可接收廠商回報通知`
      }
      if (reply) await line.reply(ev.replyToken, [{ type: 'text', text: reply }]).catch((e) => console.error(e.message))
    }
    res.json({ ok: true })
  })

  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', async (_req, res) => {
    await pool.query('select 1')
    res.json({ ok: true })
  })

  // 前端執行期設定（不需重新 build 即可切換 LIFF）
  app.get('/api/config', (_req, res) => {
    res.json({ liffId: config.line.liffId, authRequired: Boolean(config.appToken), lineEnabled: line.enabled })
  })

  app.get('/api/presets', async (_req, res) => res.json(await repo.getPresets(pool)))

  // ---------- 工程師端 ----------
  app.post('/api/uploads', auth, express.raw({ type: ALLOWED_TYPES, limit: '10mb' }), async (req, res) => {
    const type = req.get('content-type')?.split(';')[0]
    if (!ALLOWED_TYPES.includes(type) || !req.body?.length) throw new HttpError(400, '不支援的檔案格式')
    const url = await storage.put(type === 'application/pdf' ? 'pdf' : 'photos', req.body, type)
    res.status(201).json({ url })
  })

  app.get('/api/defects', auth, async (req, res) => {
    res.json((await repo.listDefects(pool, req.query)).map(dto))
  })

  app.get('/api/defects/:id', auth, async (req, res) => {
    const row = await repo.findDefect(pool, 'd.id', req.params.id)
    if (!row) throw new HttpError(404, '找不到缺失')
    res.json(dto(row))
  })

  app.put('/api/defects/:id', auth, async (req, res) => {
    const b = req.body
    requireFields(b, ['projectName', 'floor', 'tradeId', 'item', 'dueDate'])
    if (!DATE_RE.test(b.dueDate)) throw new HttpError(400, 'dueDate 格式需為 YYYY-MM-DD')
    if (b.photos) urlList(b.photos, storage, 3)
    if (b.pdfUrl && !storage.owns(b.pdfUrl)) throw new HttpError(400, 'pdfUrl 無效')
    res.json(dto(await repo.upsertDefect(pool, req.params.id, b)))
  })

  app.patch('/api/defects/:id', auth, async (req, res) => {
    const before = await repo.findDefect(pool, 'd.id', req.params.id)
    if (!before) throw new HttpError(404, '找不到缺失')
    const { status, reviewNote, pdfUrl, afterPhotos } = req.body ?? {}
    if (status && !['open', 'closed'].includes(status)) throw new HttpError(400, 'status 僅可為 open 或 closed')
    if (pdfUrl && !storage.owns(pdfUrl)) throw new HttpError(400, 'pdfUrl 無效')
    // 工程師現場複查：自行拍改善後照片並銷案
    if (afterPhotos !== undefined) {
      if (status !== 'closed') throw new HttpError(400, '改善後照片需與銷案（status=closed）一併送出')
      urlList(afterPhotos, storage, 3)
      if (!afterPhotos.length) throw new HttpError(400, '請至少 1 張改善後照片')
    }
    const d = dto(await repo.reviewDefect(pool, before.id, { status, reviewNote, pdfUrl, afterPhotos }, before))
    if (before.status === 'replied' && status === 'open') {
      await notifyGroup(d, { title: '↩️ 缺失改善退回', note: `退回原因：${reviewNote || '未填寫'}` })
    }
    res.json(d)
  })

  // ---------- 每日工作日誌 ----------
  app.put('/api/logs/:id', auth, async (req, res) => {
    const b = req.body
    requireFields(b, ['projectName', 'engineer', 'date'])
    if (!DATE_RE.test(b.date)) throw new HttpError(400, 'date 格式需為 YYYY-MM-DD')
    if (req.params.id !== `${b.date}_${b.engineer.trim()}`) throw new HttpError(400, 'id 需為「日期_工程師」')
    res.json(repo.logToDto(await repo.upsertLog(pool, req.params.id, b)))
  })

  app.get('/api/logs', auth, async (req, res) => {
    res.json((await repo.listLogs(pool, req.query)).map(repo.logToDto))
  })

  // 管理者查詢：今天誰還沒交日誌（可由排程或 LINE 提醒使用）
  app.get('/api/logs/missing', auth, async (req, res) => {
    const date = req.query.date
    if (!DATE_RE.test(date ?? '')) throw new HttpError(400, 'date 格式需為 YYYY-MM-DD')
    res.json(await repo.missingLogs(pool, date, req.query.project))
  })

  // ---------- 廠商回報（以 reply token 存取，免登入） ----------
  async function byToken(token) {
    const row = await repo.findDefect(pool, 'd.reply_token', token)
    if (!row) throw new HttpError(404, '連結無效或已失效')
    return row
  }

  app.get('/api/reply/:token', async (req, res) => {
    res.json(repo.toPublicDto(dto(await byToken(req.params.token))))
  })

  app.post('/api/reply/:token/photos', express.raw({ type: IMAGE_TYPES, limit: '10mb' }), async (req, res) => {
    const row = await byToken(req.params.token)
    if (row.status === 'closed') throw new HttpError(409, '此缺失已結案')
    const type = req.get('content-type')?.split(';')[0]
    if (!IMAGE_TYPES.includes(type) || !req.body?.length) throw new HttpError(400, '僅接受照片')
    res.status(201).json({ url: await storage.put('after', req.body, type) })
  })

  app.post('/api/reply/:token', async (req, res) => {
    const row = await byToken(req.params.token)
    if (row.status === 'closed') throw new HttpError(409, '此缺失已結案')
    const photos = urlList(req.body?.photos, storage, 3)
    if (!photos.length) throw new HttpError(400, '請至少上傳 1 張改善後照片')
    const d = dto(await repo.submitReply(pool, row.id, { note: String(req.body.note ?? '').slice(0, 2000), photos }))
    await notifyGroup(
      { ...d, photos: d.afterPhotos },
      { title: '🛠️ 廠商已回報改善，請複查', note: d.replyNote ? `改善說明：${d.replyNote}` : undefined },
    )
    res.json(repo.toPublicDto(d))
  })

  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'Not found')
  })

  // ---------- 靜態檔案：上傳檔與前端 ----------
  if (storage.get) {
    app.get('/files/{*key}', async (req, res) => {
      const file = await storage.get(req.params.key.join('/'))
      if (!file) throw new HttpError(404, 'Not found')
      res.set({ 'Content-Type': file.contentType, 'Cache-Control': 'public, max-age=2592000, immutable' })
      res.send(file.data)
    })
  } else {
    app.use('/files', express.static(config.uploadDir, { immutable: true, maxAge: '30d', fallthrough: false }))
  }
  if (existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir))
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(config.staticDir, 'index.html')))
  }

  app.use((err, _req, res, _next) => {
    // 常見資料錯誤（外鍵、檢查條件、格式）轉為 400
    const pgClient = ['23503', '23514', '22P02', '22007', '22008'].includes(err.code)
    const status = err.status ?? err.statusCode ?? (pgClient ? 400 : 500)
    if (status >= 500) console.error(err)
    res.status(status).json({ error: status >= 500 ? '伺服器錯誤' : pgClient ? '資料格式或關聯錯誤' : err.message })
  })

  return app
}
