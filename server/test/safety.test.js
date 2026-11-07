import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createPool, migrate } from '../src/db.js'
import { localStorage } from '../src/storage.js'

// 工人進場報到＋吹哨＋整改閉環（需 PostgreSQL：TEST_DATABASE_URL=postgres://... npm test）
const DB_URL = process.env.TEST_DATABASE_URL
const PUBLIC = 'http://site.local'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const PROJECT = '報到測試案'
const tw = (s) => new Date(`${s}+08:00`)

describe.skipIf(!DB_URL)('worker check-in, whistleblowing and closed-loop remediation', () => {
  let pool, app, siteKey
  let clock = tw('2026-11-07T08:00:00')
  const pushes = []
  const config = {
    publicUrl: PUBLIC,
    appToken: 'staff-key',
    safetyToken: 'safety-key',
    line: { channelSecret: 's', liffId: '' },
    staticDir: '/nonexistent',
  }
  const staff = { Authorization: 'Bearer staff-key' }
  const safety = { Authorization: 'Bearer safety-key' }
  const bearer = (token) => ({ Authorization: `Bearer ${token}` })
  const tokens = {}
  const ids = {}

  beforeAll(async () => {
    pool = createPool(DB_URL)
    await pool.query('drop schema public cascade; create schema public;')
    await migrate(pool)
    config.uploadDir = await mkdtemp(path.join(tmpdir(), 'safety-'))
    const line = { enabled: true, push: async (to, messages) => pushes.push({ to, messages }), reply: async () => {} }
    app = createApp({ pool, storage: localStorage({ dir: config.uploadDir, publicUrl: PUBLIC }), line, config, now: () => clock })
  })
  afterAll(() => pool?.end())

  const ok = { insuranceOk: true, trainingUntil: '2027-12-31', licenses: [] }
  const register = async (body, expectStatus = 201) =>
    (await request(app).post(`/api/site/${siteKey}/workers`).send({ ...ok, ...body }).expect(expectStatus)).body
  const workerUpload = async (token) =>
    (await request(app).post('/api/worker/uploads').set(bearer(token)).set('Content-Type', 'image/jpeg').send(JPEG).expect(201)).body.url
  const ALL_PPE = { helmet: true, shoes: true, vest: true, harness: true }

  /** 依畫面流程：取得報到內容 → 簽認危害告知與工區危險 → 送出。 */
  async function checkin(token, zone, expectStatus = 201, extra = {}) {
    const ctx = (
      await request(app)
        .get('/api/worker/checkin-context')
        .query({ building: zone.building, floors: zone.floors.join(',') })
        .set(bearer(token))
        .expect(200)
    ).body
    const res = await request(app)
      .post('/api/worker/checkins')
      .set(bearer(token))
      .send({ ...zone, ppe: ALL_PPE, hazardsAck: true, handoverAck: ctx.defects.map((d) => d.id), ...extra })
      .expect(expectStatus)
    return { ctx, body: res.body }
  }

  async function report(token, body, expectStatus = 201) {
    const photo = await workerUpload(token)
    return (await request(app).post('/api/worker/reports').set(bearer(token)).send({ photos: [photo], ...body }).expect(expectStatus)).body
  }

  it('issues a site QR key to staff and serves site info to workers', async () => {
    await request(app).get('/api/safety/site').query({ project: PROJECT }).expect(401)
    const site = (await request(app).get('/api/safety/site').query({ project: PROJECT }).set(staff).expect(200)).body
    siteKey = site.siteKey
    expect(site.url).toBe(`${PUBLIC}/#/site/${siteKey}`)
    // 再取一次仍是同一把
    expect((await request(app).get('/api/safety/site').query({ project: PROJECT }).set(staff)).body.siteKey).toBe(siteKey)
    await pool.query("update projects set line_group_id = 'G-site' where name = $1", [PROJECT])

    const info = (await request(app).get(`/api/site/${siteKey}`).expect(200)).body
    expect(info.project.name).toBe(PROJECT)
    expect(info.contractors.map((c) => c.id)).toContain('c2')
    expect(info.hazards.isDefault).toBe(true)
    await request(app).get('/api/site/not-a-key').expect(404)
  })

  it('registers workers with validation and re-binds a phone number', async () => {
    const bad = await register({ name: '', phone: '12', contractorId: 'c2', role: 'worker' }, 400)
    expect(bad.error).toContain('姓名')

    tokens.wang = (await register({ name: '王小明', phone: '0911-000-001', contractorId: 'c2', role: 'worker' })).token
    const lee = await register({ name: '李班長', phone: '0911000002', contractorId: 'c2', role: 'leader' })
    tokens.lee = lee.token
    ids.lee = lee.worker.id
    const chen = await register({ name: '陳水電', phone: '0911000003', contractorId: 'c3', role: 'leader', lineUserId: 'U-chen' })
    tokens.chen = chen.token
    ids.chen = chen.worker.id
    tokens.expired = (await register({ name: '張過期', phone: '0911000004', contractorId: 'c5', role: 'worker', trainingUntil: '2026-10-31' })).token
    tokens.late = (await register({ name: '林未報到', phone: '0911000005', contractorId: 'c4', role: 'worker' })).token

    // 同一支號碼重新綁定：舊憑證失效
    const rebound = await register({ name: '林未報到', phone: '0911000005', contractorId: 'c4', role: 'worker' })
    await request(app).get('/api/worker/me').set(bearer(tokens.late)).expect(401)
    tokens.late = rebound.token

    const me = (await request(app).get('/api/worker/me').set(bearer(tokens.wang)).expect(200)).body
    expect(me.worker).toMatchObject({ name: '王小明', phone: '0911000001', contractorName: '大成泥作工班', verifiedAt: null })
    expect(me.qualification.allowed).toBe(true)
    expect(me.qualification.warnings).toContain('身分與證照尚未經工務所核驗，請攜帶證件至工務所')
    expect(me.checkin).toBeNull()

    // 工務所核驗工班長
    for (const id of [ids.lee, ids.chen]) {
      const v = (await request(app).patch(`/api/workers/${id}`).set(staff).send({ verified: true, by: '安衛周' }).expect(200)).body
      expect(v.verifiedBy).toBe('安衛周')
    }
    const roster = (await request(app).get('/api/workers').query({ project: PROJECT }).set(staff).expect(200)).body
    expect(roster).toHaveLength(5)
    expect(roster.find((w) => w.name === '張過期').qualification.allowed).toBe(false)
  })

  it('checks in with PPE, TBM sign-off and hazard handover, and blocks expired training', async () => {
    const zone = { building: 'A棟', floors: ['3F', '4F'] }
    const ctx = (
      await request(app).get('/api/worker/checkin-context').query({ building: 'A棟', floors: '3F,4F' }).set(bearer(tokens.wang)).expect(200)
    ).body
    expect(ctx).toMatchObject({ date: '2026-11-07', zone, restrictions: [], defects: [] })
    expect(ctx.hazards.items.length).toBeGreaterThan(3)

    const missingPpe = await request(app).post('/api/worker/checkins').set(bearer(tokens.wang)).send({ ...zone, ppe: { helmet: true }, hazardsAck: true, handoverAck: [] }).expect(400)
    expect(missingPpe.body.error).toBe('請確認配戴：安全鞋、反光背心')
    const harness = await request(app).post('/api/worker/checkins').set(bearer(tokens.wang)).send({ ...zone, heightWork: true, ppe: { helmet: true, shoes: true, vest: true }, hazardsAck: true, handoverAck: [] }).expect(400)
    expect(harness.body.error).toBe('請確認配戴：全身式安全帶')
    await request(app).post('/api/worker/checkins').set(bearer(tokens.wang)).send({ ...zone, ppe: ALL_PPE, handoverAck: [] }).expect(400)

    const { body } = await checkin(tokens.wang, zone)
    expect(body).toMatchObject({ workerName: '王小明', contractorName: '大成泥作工班', building: 'A棟', floors: ['3F', '4F'] })
    await checkin(tokens.lee, { building: 'A棟', floors: ['3F'] })
    await checkin(tokens.chen, { building: 'A棟', floors: ['3F'] })

    const blocked = (await checkin(tokens.expired, zone, 409)).body
    expect(blocked.reasons).toEqual(['安衛教育訓練已於 2026-10-31 到期，請先回訓'])

    const overview = (await request(app).get('/api/safety/overview').query({ project: PROJECT }).set(staff).expect(200)).body
    expect(overview.counts).toMatchObject({ checkins: 3, blocked: 1 })
    expect(overview.crews.find((c) => c.contractorId === 'c2')).toMatchObject({ count: 2, leaders: ['李班長'] })
    expect(overview.attempts[0]).toMatchObject({ workerName: '張過期' })
  })

  it('requires check-in before a named report', async () => {
    await report(tokens.late, { categoryId: 'fall', severity: 'normal', building: 'A棟', floor: '3F' }, 403)
  })

  it('auto-dispatches a named report to the crew on site and notifies its leader', async () => {
    pushes.length = 0
    const r = await report(tokens.wang, {
      categoryId: 'electric',
      severity: 'major',
      building: 'A棟',
      floor: '3F',
      description: '配電箱門未關，電線泡水',
    })
    expect(r).toMatchObject({ status: 'open', contractorName: '光明水電工程', notified: ['陳水電'] })
    expect(new Date(r.dueAt).toISOString()).toBe(tw('2026-11-07T10:00:00').toISOString()) // A 級 2 小時
    ids.electric = r.reportNo
    expect(pushes.map((p) => p.to).sort()).toEqual(['G-site', 'U-chen'])
    expect(pushes[0].messages[0].contents.header.contents[0].text).toBe('📣 工安通報派工（A級・立即危險）')

    // 工程師端看得到具名通報人；廠商回報頁看不到
    const list = (await request(app).get('/api/defects').query({ project: PROJECT }).set(staff).expect(200)).body
    const d = list.find((x) => x.reportNo === ids.electric)
    ids.electricId = d.id
    expect(d).toMatchObject({ source: 'worker', category: 'electric', reporterName: '王小明', tradeId: 'mep', item: '臨時用電' })
    const pub = (await request(app).get(`/api/reply/${d.replyUrl.split('/').pop()}`).expect(200)).body
    expect(pub).not.toHaveProperty('reporterName')
  })

  it('queues an ambiguous report for the site office, which dispatches it', async () => {
    const r = await report(tokens.wang, { categoryId: 'fall', severity: 'normal', building: 'A棟', floor: '3F' })
    expect(r).toMatchObject({ status: 'pending', notified: [] })
    const present = (await request(app).get('/api/safety/crews').query({ project: PROJECT, building: 'A棟', floor: '3F' }).set(staff).expect(200)).body
    expect(present.map((c) => [c.contractorId, c.count, c.leaders])).toEqual([
      ['c2', 2, ['李班長']],
      ['c3', 1, ['陳水電']],
    ])
    const pending = (await request(app).get('/api/safety/overview').query({ project: PROJECT }).set(staff)).body.pending
    const item = pending.find((p) => p.reportNo === r.reportNo)
    expect(item.source).toBe('worker')

    // 待審通報不能直接用 PATCH 結案
    await request(app).patch(`/api/defects/${item.id}`).set(staff).send({ status: 'closed' }).expect(409)
    const dispatched = (await request(app).post(`/api/defects/${item.id}/dispatch`).set(staff).send({ contractorId: 'c2', severity: 'major' }).expect(200)).body
    expect(dispatched).toMatchObject({ status: 'open', contractorId: 'c2', severity: 'major', notified: ['李班長', '陳水電'] })
    ids.fallId = item.id
    await request(app).post(`/api/defects/${item.id}/dispatch`).set(staff).send({ contractorId: 'c2' }).expect(409)
    const notified = (await request(app).get(`/api/defects/${item.id}/notified`).set(staff)).body
    expect(notified.map((n) => [n.name, n.responsible])).toEqual([
      ['李班長', true],
      ['陳水電', false],
    ])
  })

  it('takes anonymous whistleblowing without any identity and restricts its content to safety staff', async () => {
    pushes.length = 0
    const photo = (await request(app).post(`/api/site/${siteKey}/uploads`).set('Content-Type', 'image/jpeg').send(JPEG).expect(201)).body.url
    // 匿名通道不接受工人憑證也不需要
    const w = (
      await request(app)
        .post(`/api/site/${siteKey}/whistle`)
        .send({ photos: [photo], categoryId: 'opening', severity: 'major', building: 'A棟', floor: '4F', description: '主管要求拆除護欄趕工' })
        .expect(201)
    ).body
    expect(w.status).toBe('pending')
    expect(w.receipt).toMatch(/^[\w-]{10,}$/)

    const { rows } = await pool.query('select reporter_worker_id, source, receipt_hash from defects where report_no = $1', [w.reportNo])
    expect(rows[0]).toMatchObject({ reporter_worker_id: null, source: 'whistle' })
    expect(rows[0].receipt_hash).not.toBe(w.receipt) // 只存雜湊
    const logs = await pool.query('select actor from defect_logs l join defects d on d.id = l.defect_id where d.report_no = $1', [w.reportNo])
    expect(logs.rows.map((r) => r.actor)).toEqual(['anonymous'])

    // 群組通知不含內容
    expect(pushes).toHaveLength(1)
    expect(pushes[0].messages[0].text).toContain('匿名工安吹哨')
    expect(pushes[0].messages[0].text).not.toContain('護欄')

    expect((await request(app).get(`/api/site/${siteKey}/whistle/${w.receipt}`).expect(200)).body).toMatchObject({ status: 'pending', reportNo: w.reportNo })
    await request(app).get(`/api/site/${siteKey}/whistle/wrong`).expect(404)

    // 工程師金鑰：只看得到有一件，看不到內容；安衛金鑰：看得到
    const asStaff = (await request(app).get('/api/defects').query({ project: PROJECT }).set(staff)).body.find((d) => d.reportNo === w.reportNo)
    expect(asStaff).toMatchObject({ locked: true, photos: [], description: '（匿名吹哨內容僅限安衛人員檢視）' })
    const asSafety = (await request(app).get('/api/defects').query({ project: PROJECT }).set(safety)).body.find((d) => d.reportNo === w.reportNo)
    expect(asSafety).toMatchObject({ description: '主管要求拆除護欄趕工', reporterName: '' })
    expect(asSafety.photos).toEqual([photo])
    expect(asSafety.locked).toBeUndefined()

    // 待審吹哨不出現在工人的工區危險交接
    const ctx = (await request(app).get('/api/worker/checkin-context').query({ building: 'A棟', floors: '4F' }).set(bearer(tokens.wang))).body
    expect(ctx.defects.map((d) => d.reportNo)).not.toContain(w.reportNo)

    await request(app).post(`/api/defects/${asStaff.id}/dispatch`).set(staff).send({ contractorId: 'c2' }).expect(403)
    await request(app).post(`/api/defects/${asStaff.id}/dispatch`).set(safety).send({ contractorId: 'c2' }).expect(200)
    expect((await request(app).get(`/api/site/${siteKey}/whistle/${w.receipt}`)).body.status).toBe('open')

    // 另一件判定不成立：回報連結失效
    const photo2 = (await request(app).post(`/api/site/${siteKey}/uploads`).set('Content-Type', 'image/jpeg').send(JPEG)).body.url
    const w2 = (await request(app).post(`/api/site/${siteKey}/whistle`).send({ photos: [photo2], categoryId: 'other', severity: 'normal', floor: '1F' }).expect(201)).body
    const id2 = (await request(app).get('/api/defects').query({ project: PROJECT }).set(safety)).body.find((d) => d.reportNo === w2.reportNo)
    await request(app).post(`/api/defects/${id2.id}/dismiss`).set(safety).send({ reason: '' }).expect(400)
    const dismissed = (await request(app).post(`/api/defects/${id2.id}/dismiss`).set(safety).send({ reason: '現場查無此情形' }).expect(200)).body
    expect(dismissed.status).toBe('dismissed')
    await request(app).get(`/api/reply/${id2.replyUrl.split('/').pop()}`).expect(404)
  })

  it('lets a verified crew leader return same-angle photos, and awards points when closed', async () => {
    const asWorker = (await request(app).get('/api/worker/tasks').set(bearer(tokens.wang)).expect(200)).body
    expect(asWorker).toMatchObject({ allowed: false, tasks: [] })

    const tasks = (await request(app).get('/api/worker/tasks').set(bearer(tokens.chen)).expect(200)).body
    expect(tasks.allowed).toBe(true)
    const task = tasks.tasks.find((t) => t.reportNo === ids.electric)
    expect(task).toMatchObject({ severity: 'major', status: 'open', contractorName: '光明水電工程' })
    expect(task).not.toHaveProperty('reporterName')

    const after = (await request(app).post(`/api/reply/${task.replyToken}/photos`).set('Content-Type', 'image/jpeg').send(JPEG).expect(201)).body.url
    await request(app).post(`/api/reply/${task.replyToken}`).send({ note: '已關閉配電箱並架高電線', photos: [after] }).expect(200)
    await request(app).patch(`/api/defects/${ids.electricId}`).set(staff).send({ status: 'closed' }).expect(200)

    let pts = (await request(app).get('/api/worker/points').set(bearer(tokens.wang)).expect(200)).body
    expect(pts.total).toBe(20)
    // 重開後再銷案不重複發點
    await request(app).patch(`/api/defects/${ids.electricId}`).set(staff).send({ status: 'open' }).expect(200)
    await request(app).patch(`/api/defects/${ids.electricId}`).set(staff).send({ status: 'closed' }).expect(200)
    pts = (await request(app).get('/api/worker/points').set(bearer(tokens.wang))).body
    expect(pts.total).toBe(20)
    expect(pts.history[0]).toMatchObject({ points: 20, reason: 'report_closed', reportNo: ids.electric })

    const mine = (await request(app).get('/api/worker/reports').set(bearer(tokens.wang)).expect(200)).body
    expect(mine.find((r) => r.reportNo === ids.electric)).toMatchObject({ status: 'closed', points: 20 })
  })

  it('escalates reports that pass their deadline once and notifies the site group', async () => {
    pushes.length = 0
    clock = tw('2026-11-07T17:30:00') // A 級 2 小時、B 級收工時間都已過
    const overview = (await request(app).get('/api/safety/overview').query({ project: PROJECT }).set(staff).expect(200)).body
    expect(overview.counts.overdue).toBeGreaterThan(0)
    expect(pushes).toHaveLength(1)
    expect(pushes[0].messages[0].text).toMatch(/^⚠️ 逾時未改善升級通報 \d+ 件/)
    const fall = overview.active.find((d) => d.id === ids.fallId)
    expect(fall.escalatedAt).toBeTruthy()
    // 第二次檢查不重複推播
    await request(app).get('/api/safety/overview').query({ project: PROJECT }).set(staff)
    expect(pushes).toHaveLength(1)
  })

  it('restricts the responsible crew from the zone the next day until safety staff unlock it', async () => {
    clock = tw('2026-11-08T07:30:00')
    const zone = { building: 'A棟', floors: ['3F'] }
    const lee = (await checkin(tokens.lee, zone, 409)).body
    expect(lee.reasons[0]).toMatch(/^工區管制：DF-20261107-\d{3} A棟 3F 防墜／高處作業（A級未改善/)
    await checkin(tokens.wang, zone, 409) // 同工班
    await checkin(tokens.chen, zone, 201) // 其他工班不受影響
    await checkin(tokens.wang, { building: 'A棟', floors: ['5F'] }, 201) // 換到別的工區可報到

    const overview = (await request(app).get('/api/safety/overview').query({ project: PROJECT }).set(staff)).body
    const r = overview.restrictions.find((d) => d.id === ids.fallId)
    expect(r).toMatchObject({ unlocked: false, contractorName: '大成泥作工班' })

    await request(app).post('/api/safety/unlocks').set(staff).send({ defectId: ids.fallId, note: '已會同確認' }).expect(403)
    await request(app).post('/api/safety/unlocks').set(safety).send({ defectId: ids.fallId, note: '' }).expect(400)
    await request(app).post('/api/safety/unlocks').set(safety).send({ defectId: ids.fallId, note: '已會同安衛確認臨時護欄', by: '安衛周' }).expect(200)
    await checkin(tokens.lee, zone, 201)
  })

  it('uses the site office’s hazard notice and refuses a stale hazard handover', async () => {
    await request(app).put('/api/safety/hazards').set(staff).send({ project: PROJECT, items: [] }).expect(400)
    const saved = (await request(app).put('/api/safety/hazards').set(staff).send({ project: PROJECT, items: ['今日 A棟 3F 吊掛鋼筋，下方禁止進入', ' '] }).expect(200)).body
    expect(saved).toMatchObject({ items: ['今日 A棟 3F 吊掛鋼筋，下方禁止進入'], isDefault: false, isToday: true })
    const ctx = (await request(app).get('/api/worker/checkin-context').query({ building: 'A棟', floors: '3F' }).set(bearer(tokens.chen))).body
    expect(ctx.hazards.items).toEqual(['今日 A棟 3F 吊掛鋼筋，下方禁止進入'])
    expect(ctx.defects.length).toBeGreaterThan(0)
    const stale = await request(app)
      .post('/api/worker/checkins')
      .set(bearer(tokens.chen))
      .send({ building: 'A棟', floors: ['3F'], ppe: ALL_PPE, hazardsAck: true, handoverAck: [] })
      .expect(409)
    expect(stale.body.refresh).toBe(true)
  })

  it('reports contractor scores, categories, points leaderboard and whistle outcomes', async () => {
    const s = (await request(app).get('/api/safety/stats').query({ project: PROJECT, from: '2026-11-01', to: '2026-11-08' }).set(staff).expect(200)).body
    const c2 = s.contractors.find((c) => c.contractorId === 'c2')
    expect(c2).toMatchObject({ contractorName: '大成泥作工班', major: 2, checkins: 4 })
    expect(c2.score).toBeLessThan(100)
    const c5 = s.contractors.find((c) => c.contractorId === 'c5')
    expect(c5).toMatchObject({ blocked: 1, checkins: 0, checkinRate: 0 })
    expect(s.categories).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'electric', source: 'worker', count: 1 })]))
    expect(s.leaderboard[0]).toMatchObject({ name: '王小明', points: 20 })
    expect(s.whistle).toMatchObject({ open: 1, dismissed: 1 })
    expect(s.formula).toContain('綜合分數')
    await request(app).get('/api/safety/stats').query({ project: PROJECT, from: '2026-11-09', to: '2026-11-08' }).set(staff).expect(400)
  })

  it('manages contractors and the zone list shown to workers', async () => {
    const c = (await request(app).post('/api/contractors').set(staff).send({ name: '新興鷹架', tradeId: 'safety' }).expect(201)).body
    expect(c).toMatchObject({ name: '新興鷹架', active: true })
    await request(app).patch(`/api/contractors/${c.id}`).set(staff).send({ active: false }).expect(200)
    let info = (await request(app).get(`/api/site/${siteKey}`)).body
    expect(info.contractors.map((x) => x.name)).not.toContain('新興鷹架')

    await request(app).put('/api/projects/zones').set(staff).send({ project: PROJECT, buildings: ['A棟', 'A棟', '機房'], floors: [] }).expect(400)
    await request(app).put('/api/projects/zones').set(staff).send({ project: PROJECT, buildings: ['A棟', 'A棟', '機房'], floors: ['B1', '1F'] }).expect(200)
    info = (await request(app).get(`/api/site/${siteKey}`)).body
    expect(info).toMatchObject({ buildings: ['A棟', '機房'], floors: ['B1', '1F'] })
  })

  it('invalidates the old QR when safety staff rotate it', async () => {
    await request(app).post('/api/safety/site/rotate').set(staff).send({ project: PROJECT }).expect(403)
    const rotated = (await request(app).post('/api/safety/site/rotate').set(safety).send({ project: PROJECT }).expect(200)).body
    expect(rotated.siteKey).not.toBe(siteKey)
    await request(app).get(`/api/site/${siteKey}`).expect(404)
    // 已登入的工人不受影響
    await request(app).get('/api/worker/me').set(bearer(tokens.wang)).expect(200)
    siteKey = rotated.siteKey
  })

  it('limits anonymous submissions per source', async () => {
    const limited = createApp({
      pool,
      storage: localStorage({ dir: config.uploadDir, publicUrl: PUBLIC }),
      line: { enabled: false },
      config: { ...config, rateLimit: { whistle: 1 } },
      now: () => clock,
    })
    const body = { photos: [], categoryId: 'other', severity: 'normal', floor: '1F' }
    await request(limited).post(`/api/site/${siteKey}/whistle`).send(body).expect(400) // 沒照片，但計入次數
    await request(limited).post(`/api/site/${siteKey}/whistle`).send(body).expect(429)
  })
})
