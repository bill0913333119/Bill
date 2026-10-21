import { createHmac } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createPool, migrate } from '../src/db.js'
import { localStorage } from '../src/storage.js'

// 需要可用的 PostgreSQL：TEST_DATABASE_URL=postgres://... npm test
const DB_URL = process.env.TEST_DATABASE_URL
const PUBLIC = 'http://test.local'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])

describe.skipIf(!DB_URL)('API', () => {
  let pool, app
  const pushes = []
  const replies = []
  const config = {
    publicUrl: PUBLIC,
    appToken: 'secret',
    line: { channelSecret: 'line-secret', liffId: 'LIFF123' },
    staticDir: '/nonexistent',
  }
  const auth = { Authorization: 'Bearer secret' }

  beforeAll(async () => {
    pool = createPool(DB_URL)
    await pool.query('drop schema public cascade; create schema public;')
    await migrate(pool)
    config.uploadDir = await mkdtemp(path.join(tmpdir(), 'defect-'))
    const line = {
      enabled: true,
      push: async (to, messages) => pushes.push({ to, messages }),
      reply: async (token, messages) => replies.push({ token, messages }),
    }
    app = createApp({ pool, storage: localStorage({ dir: config.uploadDir, publicUrl: PUBLIC }), line, config })
  })
  afterAll(() => pool?.end())

  const upload = async () =>
    (await request(app).post('/api/uploads').set(auth).set('Content-Type', 'image/jpeg').send(JPEG).expect(201)).body.url

  const defect = (over = {}) => ({
    reportNo: 'DF-20261021-001',
    projectName: '信義案',
    floor: '3F',
    tradeId: 'masonry',
    item: '牆面蜂窩',
    contractorId: 'c2',
    dueDate: '2026-10-24',
    severity: 'major',
    createdAt: '2026-10-21T05:00:00Z',
    ...over,
  })

  it('serves presets from seed data', async () => {
    const { body } = await request(app).get('/api/presets').expect(200)
    expect(body.trades).toHaveLength(6)
    expect(body.trades.find((t) => t.id === 'mep').items).toContain('管線未封')
    expect(body.contractors.find((c) => c.tradeId === 'masonry').name).toBe('大成泥作工班')
  })

  it('requires the app token', async () => {
    await request(app).get('/api/defects').expect(401)
  })

  it('creates a defect idempotently and resolves report number collisions', async () => {
    const photo = await upload()
    const id1 = crypto.randomUUID()
    const a = await request(app).put(`/api/defects/${id1}`).set(auth).send(defect({ photos: [photo] })).expect(200)
    expect(a.body.reportNo).toBe('DF-20261021-001')
    expect(a.body.photos).toEqual([photo])
    expect(a.body.replyUrl).toMatch(new RegExp(`^${PUBLIC}/#/reply/.{20,}`))

    // 重送同一筆：不重複建立、單號不變
    const again = await request(app).put(`/api/defects/${id1}`).set(auth).send(defect({ description: '補充' })).expect(200)
    expect(again.body.reportNo).toBe('DF-20261021-001')
    expect(again.body.description).toBe('補充')

    // 另一台手機同單號 → 伺服器改配下一號
    const b = await request(app).put(`/api/defects/${crypto.randomUUID()}`).set(auth).send(defect()).expect(200)
    expect(b.body.reportNo).toBe('DF-20261021-002')

    const list = await request(app).get('/api/defects?project=信義案&status=open').set(auth).expect(200)
    expect(list.body).toHaveLength(2)
  })

  it('rejects invalid input', async () => {
    const id = crypto.randomUUID()
    await request(app).put(`/api/defects/${id}`).set(auth).send(defect({ floor: '' })).expect(400)
    await request(app).put(`/api/defects/${id}`).set(auth).send(defect({ tradeId: 'nope' })).expect(400)
    await request(app).put(`/api/defects/${id}`).set(auth).send(defect({ photos: ['https://evil.example/x.jpg'] })).expect(400)
  })

  it('runs the contractor reply → reject → reply → close cycle', async () => {
    await pool.query("update projects set line_group_id = 'G1' where name = '信義案'")
    const id = crypto.randomUUID()
    const created = (await request(app).put(`/api/defects/${id}`).set(auth).send(defect({ reportNo: '' })).expect(200)).body
    const token = created.replyUrl.split('/').pop()

    const pub = (await request(app).get(`/api/reply/${token}`).expect(200)).body
    expect(pub.item).toBe('牆面蜂窩')
    expect(pub).not.toHaveProperty('lineGroupId')
    await request(app).get('/api/reply/wrong-token').expect(404)

    await request(app).post(`/api/reply/${token}`).send({ photos: [] }).expect(400)
    const after = (await request(app).post(`/api/reply/${token}/photos`).set('Content-Type', 'image/jpeg').send(JPEG).expect(201)).body.url
    const replied = (await request(app).post(`/api/reply/${token}`).send({ note: '已打除補平', photos: [after] }).expect(200)).body
    expect(replied.status).toBe('replied')
    expect(replied.afterPhotos).toEqual([after])
    expect(pushes.at(-1).to).toBe('G1')
    expect(pushes.at(-1).messages[0].type).toBe('flex')

    const rejected = (await request(app).patch(`/api/defects/${id}`).set(auth).send({ status: 'open', reviewNote: '表面仍不平' }).expect(200)).body
    expect(rejected.status).toBe('open')
    expect((await request(app).get(`/api/reply/${token}`)).body.reviewNote).toBe('表面仍不平')

    await request(app).post(`/api/reply/${token}`).send({ note: '重新粉光', photos: [after] }).expect(200)
    const closed = (await request(app).patch(`/api/defects/${id}`).set(auth).send({ status: 'closed' }).expect(200)).body
    expect(closed.status).toBe('closed')
    expect(closed.closedAt).toBeTruthy()
    await request(app).post(`/api/reply/${token}`).send({ photos: [after] }).expect(409)

    const { rows } = await pool.query('select action from defect_logs where defect_id = $1 order by id', [id])
    expect(rows.map((r) => r.action)).toEqual(['created', 'replied', 'rejected', 'replied', 'closed'])
  })

  it('verifies LINE webhook signatures and binds groups', async () => {
    const body = JSON.stringify({
      events: [{ type: 'message', replyToken: 'r1', source: { type: 'group', groupId: 'G9' }, message: { type: 'text', text: '綁定 大安案' } }],
    })
    const sig = createHmac('sha256', 'line-secret').update(body).digest('base64')
    await request(app).post('/api/line/webhook').set('x-line-signature', 'bad').set('Content-Type', 'application/json').send(body).expect(401)
    await request(app).post('/api/line/webhook').set('x-line-signature', sig).set('Content-Type', 'application/json').send(body).expect(200)
    const { rows } = await pool.query("select line_group_id from projects where name = '大安案'")
    expect(rows[0].line_group_id).toBe('G9')
    expect(replies.at(-1).messages[0].text).toContain('大安案')
  })
})
