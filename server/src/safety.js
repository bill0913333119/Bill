// 工人進場報到、全員吹哨、派工整改、隔日管制、工安點數與統計的 API。
import express from 'express'
import {
  DATE_RE,
  PPE_ITEMS,
  SCORE_FORMULA,
  SLA,
  addSiteDays,
  categoryById,
  checkQualification,
  contractorScore,
  locationText,
  missingPpe,
  normalizePhone,
  siteDate,
  siteTime,
  suggestContractor,
  validateWorker,
} from '../../shared/safety.js'
import { HttpError, newToken, rateLimit, sha256, urlList } from './http.js'
import * as repo from './repo.js'
import * as srepo from './safetyRepo.js'
import { ALLOWED_TYPES } from './storage.js'

const IMAGE_TYPES = ALLOWED_TYPES.filter((t) => t.startsWith('image/'))
const SEVERITIES = ['major', 'normal']
const HOUR = 3600_000

const str = (v, max) => String(v ?? '').trim().slice(0, max)

/**
 * @param {import('express').Express} app
 * @param {object} deps { pool, storage, line, config, now, auth, requireSafety, dtoFor, notifyGroup, flexFor }
 */
export function mountSafety(app, { pool, storage, line, config, now, auth, requireSafety, dtoFor, notifyGroup, flexFor }) {
  const today = () => siteDate(now())
  const fullDto = (row) => repo.toDto(row, config.publicUrl)
  const limit = (key, max) => rateLimit({ windowMs: HOUR, max: config.rateLimit?.[key] ?? max })

  async function pushText(groupId, text) {
    if (!line.enabled || !groupId) return
    await line.push(groupId, [{ type: 'text', text: text.slice(0, 4900) }]).catch((e) => console.error('LINE 推播失敗', e.message))
  }

  /** 派工通知：工地群組＋責任工班長個人（已綁定 LINE 者）。 */
  async function announceDispatch(d, notified) {
    const opt = {
      title: `📣 工安通報派工（${SLA[d.severity].label}）`,
      note: `限 ${siteTime(d.dueAt)} 前改善・責任工班：${d.contractorName || '待指派'}`,
    }
    await notifyGroup(d, opt)
    for (const n of notified.filter((x) => x.responsible && x.lineUserId)) {
      await line.push(n.lineUserId, [flexFor(d, opt)]).catch((e) => console.error('LINE 個人推播失敗', e.message))
    }
  }

  async function projectById(id) {
    const { rows } = await pool.query('select * from projects where id = $1', [id])
    return rows[0]
  }

  // ---------- 逾時升級（排程與工安總覽都會觸發） ----------
  async function runEscalation() {
    const rows = await srepo.escalateOverdue(pool, now())
    const byGroup = new Map()
    for (const r of rows) {
      if (!r.line_group_id) continue
      byGroup.set(r.line_group_id, [...(byGroup.get(r.line_group_id) ?? []), r])
    }
    for (const [group, list] of byGroup) {
      const lines = list.slice(0, 8).map((r) => {
        const what = r.source === 'whistle' && r.status === 'pending' ? '匿名吹哨（待審）' : r.item
        return `・${r.report_no} ${locationText(r)} ${what}（${SLA[r.severity].level}級，期限 ${siteTime(r.due_at)}）`
      })
      const more = list.length > 8 ? `\n…另 ${list.length - 8} 件` : ''
      await pushText(group, `⚠️ 逾時未改善升級通報 ${list.length} 件，請專案經理、工務所長處理：\n${lines.join('\n')}${more}`)
    }
    return rows.length
  }
  app.locals.runEscalation = runEscalation

  // ---------- 共用：通報內容 ----------
  function parseReport(b) {
    const cat = categoryById(b?.categoryId)
    if (!cat) throw new HttpError(400, '請選擇通報分類')
    if (!SEVERITIES.includes(b.severity)) throw new HttpError(400, '請選擇危險等級')
    if (!str(b.floor, 20)) throw new HttpError(400, '請選擇樓層')
    const photos = urlList(b.photos ?? [], storage, 3)
    if (!photos.length) throw new HttpError(400, '請至少拍 1 張照片')
    return {
      categoryId: cat.id,
      severity: b.severity,
      building: str(b.building, 20),
      floor: str(b.floor, 20),
      unit: str(b.unit, 20),
      description: str(b.description, 1000),
      photos,
      contractorId: b.contractorId ? String(b.contractorId) : null,
    }
  }

  function parseZone(src) {
    const raw = Array.isArray(src.floors) ? src.floors : String(src.floors ?? '').split(',')
    const floors = [...new Set(raw.map((f) => str(f, 20)).filter(Boolean))].slice(0, 80)
    return { building: str(src.building, 20), floors }
  }

  function parseWorker(b) {
    const w = {
      name: str(b?.name, 20),
      phone: normalizePhone(b?.phone),
      contractorId: str(b?.contractorId, 64),
      role: b?.role,
      insuranceOk: b?.insuranceOk === true,
      trainingUntil: str(b?.trainingUntil, 10),
      licenses: Array.isArray(b?.licenses)
        ? b.licenses.slice(0, 11).map((l) => ({ type: str(l?.type, 40), until: str(l?.until, 10) }))
        : [],
      lineUserId: b?.lineUserId ? str(b.lineUserId, 64) : null,
    }
    const errors = validateWorker(w)
    if (errors.length) throw new HttpError(400, `請確認：${errors.join('、')}`)
    return w
  }

  const imageBody = (req) => {
    const type = req.get('content-type')?.split(';')[0]
    if (!IMAGE_TYPES.includes(type) || !req.body?.length) throw new HttpError(400, '僅接受照片')
    return type
  }

  // ================= 工地 QR（免登入，以報到金鑰存取） =================

  async function siteProject(req) {
    const p = await srepo.projectBySiteKey(pool, req.params.key)
    if (!p) throw new HttpError(404, '此報到 QR Code 已失效，請洽工務所')
    return p
  }

  app.get('/api/site/:key', async (req, res) => {
    const p = await siteProject(req)
    const [hazards, contractors] = await Promise.all([srepo.hazardsFor(pool, p.id, today()), srepo.listContractors(pool)])
    res.json({
      project: { name: p.name },
      buildings: p.buildings, // null 時前端使用預設清單
      floors: p.floors,
      contractors: contractors.filter((c) => c.active).map(({ id, name, tradeId }) => ({ id, name, tradeId })),
      hazards,
      today: today(),
      liffId: config.line.liffId,
    })
  })

  app.post('/api/site/:key/workers', limit('register', 30), async (req, res) => {
    const p = await siteProject(req)
    const token = newToken()
    const w = await srepo.registerWorker(pool, p.id, parseWorker(req.body), token)
    res.status(201).json({ token, worker: srepo.workerToDto(w) })
  })

  app.get('/api/site/:key/crews', async (req, res) => {
    const p = await siteProject(req)
    const crews = srepo.crewsAt(await srepo.checkinsOn(pool, p.id, today()), { building: str(req.query.building, 20), floor: str(req.query.floor, 20) })
    res.json(crews.map(({ contractorId, contractorName, count }) => ({ contractorId, contractorName, count })))
  })

  // ---------- 匿名吹哨：不收工人憑證、不存任何身分，只回傳回執碼供查詢進度 ----------
  app.post('/api/site/:key/uploads', limit('anonymousUpload', 60), express.raw({ type: IMAGE_TYPES, limit: '10mb' }), async (req, res) => {
    await siteProject(req)
    const type = imageBody(req)
    res.status(201).json({ url: await storage.put('reports', req.body, type) })
  })

  app.post('/api/site/:key/whistle', limit('whistle', 20), async (req, res) => {
    const p = await siteProject(req)
    const report = parseReport(req.body)
    const crews = srepo.crewsAt(await srepo.checkinsOn(pool, p.id, today()), report)
    const contractorId = suggestContractor({ categoryId: report.categoryId, presentCrews: crews, chosenId: report.contractorId })
    const receipt = newToken(9)
    const { row } = await srepo.createReport(pool, {
      project: p,
      source: 'whistle',
      report,
      contractorId,
      crews,
      receiptHash: sha256(receipt),
      now: now(),
    })
    // 群組只通知「有一件待審」，內容與照片僅安衛人員在系統內檢視
    await pushText(
      p.line_group_id,
      `🕵️ 收到 1 件匿名工安吹哨（${SLA[report.severity].label}，期限 ${siteTime(row.due_at)}），請安衛人員立即至系統審核。`,
    )
    res.status(201).json({ receipt, reportNo: row.report_no, status: row.status, dueAt: row.due_at })
  })

  app.get('/api/site/:key/whistle/:receipt', async (req, res) => {
    await siteProject(req)
    const s = await srepo.statusByReceipt(pool, req.params.receipt)
    if (!s) throw new HttpError(404, '查無此回執碼')
    res.json(s)
  })

  // ================= 工人（手機登入憑證） =================

  const workerAuth = async (req, _res, next) => {
    const m = (req.get('authorization') ?? '').match(/^Bearer (.+)$/)
    const w = m ? await srepo.workerByToken(pool, m[1]) : null
    if (!w) throw new HttpError(401, '登入已失效，請重新掃描工地 QR Code')
    req.worker = w
    next()
  }

  async function checkinContext(w, zone, date) {
    const [restrictions, hazards, defects, existing] = await Promise.all([
      srepo.restrictionsFor(pool, w.project_id, date, w.contractor_id, zone),
      srepo.hazardsFor(pool, w.project_id, date),
      srepo.zoneDefects(pool, w.project_id, zone),
      srepo.checkinOf(pool, w.id, date),
    ])
    return {
      date,
      zone,
      qualification: checkQualification(srepo.workerToDto(w), date),
      restrictions,
      hazards,
      defects,
      checkin: existing && srepo.checkinToDto(existing),
    }
  }

  app.get('/api/worker/me', workerAuth, async (req, res) => {
    const w = req.worker
    const date = today()
    const [checkin, points, project] = await Promise.all([
      srepo.checkinOf(pool, w.id, date),
      srepo.pointsOf(pool, w.id),
      projectById(w.project_id),
    ])
    const worker = srepo.workerToDto(w)
    res.json({
      worker,
      project: { name: project.name },
      date,
      checkin: checkin && srepo.checkinToDto(checkin),
      points: points.total,
      qualification: checkQualification(worker, date),
    })
  })

  app.put('/api/worker/me', workerAuth, async (req, res) => {
    const w = await srepo.updateWorker(pool, req.worker.id, parseWorker({ ...req.body, phone: req.worker.phone }))
    res.json(srepo.workerToDto(w))
  })

  app.get('/api/worker/checkin-context', workerAuth, async (req, res) => {
    res.json(await checkinContext(req.worker, parseZone(req.query), today()))
  })

  /** 三合一進場校驗＋危險交接：伺服器重新檢核，不信任手機端判斷。 */
  app.post('/api/worker/checkins', workerAuth, async (req, res) => {
    const w = req.worker
    const date = today()
    const b = req.body ?? {}
    const zone = parseZone(b)
    const ctx = await checkinContext(w, zone, date)
    const reasons = [
      ...ctx.qualification.blocks,
      ...ctx.restrictions.map((d) => `工區管制：${d.reportNo} ${locationText(d)} ${d.item}（A級未改善，須會同安衛人員確認解鎖）`),
    ]
    if (reasons.length) {
      await srepo.recordAttempt(pool, { projectId: w.project_id, workerId: w.id, contractorId: w.contractor_id, date, reasons })
      throw new HttpError(409, '今日無法完成報到', { reasons })
    }
    const heightWork = b.heightWork === true
    const ppe = Object.fromEntries(PPE_ITEMS.map((p) => [p.id, b.ppe?.[p.id] === true]))
    const missing = missingPpe(ppe, { height: heightWork })
    if (missing.length) throw new HttpError(400, `請確認配戴：${missing.join('、')}`)
    if (b.hazardsAck !== true) throw new HttpError(400, '請先閱讀並簽認今日危害告知')
    const acked = new Set(Array.isArray(b.handoverAck) ? b.handoverAck : [])
    if (ctx.defects.some((d) => !acked.has(d.id))) throw new HttpError(409, '工區危險事項有更新，請重新確認', { refresh: true })
    const saved = await srepo.saveCheckin(pool, {
      projectId: w.project_id,
      workerId: w.id,
      contractorId: w.contractor_id,
      date,
      building: zone.building,
      floors: zone.floors,
      heightWork,
      ppe,
      hazardsAck: ctx.hazards.items,
      handoverAck: ctx.defects.map((d) => d.id),
      warnings: ctx.qualification.warnings,
    })
    res.status(201).json(srepo.checkinToDto(saved))
  })

  app.post('/api/worker/uploads', workerAuth, express.raw({ type: IMAGE_TYPES, limit: '10mb' }), async (req, res) => {
    const type = imageBody(req)
    res.status(201).json({ url: await storage.put('reports', req.body, type) })
  })

  /** 具名通報：比對當日報到名冊，自動派工給在場責任工班。 */
  app.post('/api/worker/reports', workerAuth, async (req, res) => {
    const w = req.worker
    const date = today()
    if (!(await srepo.checkinOf(pool, w.id, date))) throw new HttpError(403, '請先完成今日進場報到，才能具名通報')
    const report = parseReport(req.body)
    const project = await projectById(w.project_id)
    const crews = srepo.crewsAt(await srepo.checkinsOn(pool, project.id, date), report)
    const contractorId = suggestContractor({ categoryId: report.categoryId, presentCrews: crews, chosenId: report.contractorId })
    const { row, notified } = await srepo.createReport(pool, {
      project,
      source: 'worker',
      reporterId: w.id,
      report,
      contractorId,
      crews,
      now: now(),
    })
    const d = fullDto(row)
    if (row.status === 'open') await announceDispatch(d, notified)
    else await pushText(project.line_group_id, `📣 收到 1 件現場工安通報（${SLA[d.severity].label}），請工務所指派責任工班。`)
    res.status(201).json({
      reportNo: d.reportNo,
      status: d.status,
      severity: d.severity,
      dueAt: d.dueAt,
      contractorName: d.contractorName,
      notified: notified.filter((n) => n.responsible).map((n) => n.name),
    })
  })

  app.get('/api/worker/reports', workerAuth, async (req, res) => {
    res.json(await srepo.myReports(pool, req.worker.id))
  })

  app.get('/api/worker/points', workerAuth, async (req, res) => {
    res.json(await srepo.pointsOf(pool, req.worker.id))
  })

  /** 工班長／負責人（經工務所核驗）：本工班待改善缺失。 */
  app.get('/api/worker/tasks', workerAuth, async (req, res) => {
    const w = req.worker
    if (w.role === 'worker') return res.json({ allowed: false, reason: '僅工班長或分包商負責人可處理工班缺失', tasks: [] })
    if (!w.verified_at) return res.json({ allowed: false, reason: '需工務所核驗身分後，才能處理工班缺失', tasks: [] })
    res.json({ allowed: true, tasks: await srepo.crewTasks(pool, w.project_id, w.contractor_id) })
  })

  // ================= 工務所／安衛（工程師金鑰） =================

  async function staffProject(req) {
    const name = str(req.query.project ?? req.body?.project, 100)
    if (!name) throw new HttpError(400, '請先在設定填寫工程專案')
    return srepo.ensureProject(pool, name)
  }
  const pickDate = (v) => (DATE_RE.test(v ?? '') ? v : today())

  app.get('/api/safety/overview', auth, async (req, res) => {
    const p = await staffProject(req)
    const date = pickDate(req.query.date)
    await runEscalation()
    const [checkins, attempts, hazards, majors, active] = await Promise.all([
      srepo.checkinsOn(pool, p.id, date),
      srepo.attemptsOn(pool, p.id, date),
      srepo.hazardsFor(pool, p.id, date),
      srepo.openMajorDefects(pool, p.id, date, null),
      repo.activeDefects(pool, p.id),
    ])
    const crews = new Map()
    for (const c of checkins) {
      const key = c.contractor_id ?? ''
      const crew = crews.get(key) ?? { contractorId: key, contractorName: c.contractor_name ?? '未指定', count: 0, leaders: [] }
      crew.count++
      if (c.role !== 'worker') crew.leaders.push(c.worker_name)
      crews.set(key, crew)
    }
    const toDto = dtoFor(req)
    const t = now()
    const open = active.filter((d) => d.status !== 'pending')
    res.json({
      date,
      checkins: checkins.map(srepo.checkinToDto),
      crews: [...crews.values()].sort((a, b) => b.count - a.count),
      attempts,
      hazards,
      pending: active.filter((d) => d.status === 'pending').map(toDto),
      active: open.map(toDto),
      restrictions: majors.filter((d) => siteDate(d.createdAt) < date),
      counts: {
        checkins: checkins.length,
        blocked: attempts.length,
        pending: active.length - open.length,
        majorOpen: open.filter((d) => d.severity === 'major').length,
        overdue: active.filter((d) => d.status !== 'replied' && d.due_at && new Date(d.due_at) < t).length,
      },
    })
  })

  app.put('/api/safety/hazards', auth, async (req, res) => {
    const p = await staffProject(req)
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).map((s) => str(s, 200)).filter(Boolean).slice(0, 20)
    if (!items.length) throw new HttpError(400, '請至少填寫 1 項危害告知')
    const date = pickDate(req.body?.date)
    await srepo.saveHazards(pool, p.id, date, items, str(req.body?.by, 40))
    res.json(await srepo.hazardsFor(pool, p.id, date))
  })

  app.post('/api/safety/unlocks', auth, requireSafety, async (req, res) => {
    const d = await repo.findDefect(pool, 'd.id', str(req.body?.defectId, 64))
    if (!d) throw new HttpError(404, '找不到缺失')
    const note = str(req.body?.note, 300)
    if (!note) throw new HttpError(400, '請填寫會同確認的安全措施')
    await srepo.unlockDefect(pool, d.id, today(), str(req.body?.by, 40) || '安衛人員', note)
    res.json({ ok: true })
  })

  app.post('/api/defects/:id/dispatch', auth, async (req, res) => {
    const before = await repo.findDefect(pool, 'd.id', req.params.id)
    if (!before) throw new HttpError(404, '找不到缺失')
    if (!['pending', 'dismissed'].includes(before.status)) throw new HttpError(409, '此缺失已派工')
    if (before.source === 'whistle' && req.role !== 'safety') throw new HttpError(403, '匿名吹哨需由安衛人員審核派工')
    const contractorId = str(req.body?.contractorId, 64)
    if (!contractorId) throw new HttpError(400, '請選擇責任工班')
    const severity = SEVERITIES.includes(req.body?.severity) ? req.body.severity : before.severity
    const crews = srepo.crewsAt(await srepo.checkinsOn(pool, before.project_id, today()), before)
    const { row, notified } = await srepo.dispatchDefect(pool, before, {
      contractorId,
      severity,
      actor: str(req.body?.by, 40) || 'engineer',
      crews,
      now: now(),
    })
    await announceDispatch(fullDto(row), notified)
    res.json({ ...dtoFor(req)(row), notified: notified.map((n) => n.name) })
  })

  app.post('/api/defects/:id/dismiss', auth, async (req, res) => {
    const before = await repo.findDefect(pool, 'd.id', req.params.id)
    if (!before) throw new HttpError(404, '找不到缺失')
    if (before.status !== 'pending') throw new HttpError(409, '只有待審派工的通報可判定不成立')
    if (before.source === 'whistle' && req.role !== 'safety') throw new HttpError(403, '匿名吹哨需由安衛人員審核')
    const reason = str(req.body?.reason, 300)
    if (!reason) throw new HttpError(400, '請填寫不成立的原因')
    const row = await srepo.dismissDefect(pool, before.id, { reason, actor: str(req.body?.by, 40) || 'engineer', now: now() })
    res.json(dtoFor(req)(row))
  })

  /** 派工時參考：某位置今日在場的工班。 */
  app.get('/api/safety/crews', auth, async (req, res) => {
    const p = await staffProject(req)
    const crews = srepo.crewsAt(await srepo.checkinsOn(pool, p.id, today()), { building: str(req.query.building, 20), floor: str(req.query.floor, 20) })
    res.json(crews.map(({ contractorId, contractorName, count, leaders }) => ({ contractorId, contractorName, count, leaders: leaders.map((l) => l.name) })))
  })

  app.get('/api/defects/:id/notified', auth, async (req, res) => {
    res.json(await srepo.notifiedFor(pool, req.params.id))
  })

  app.get('/api/safety/stats', auth, async (req, res) => {
    const p = await staffProject(req)
    const to = pickDate(req.query.to)
    const from = DATE_RE.test(req.query.from ?? '') ? req.query.from : addSiteDays(to, -6)
    if (from > to || from < addSiteDays(to, -366)) throw new HttpError(400, '統計區間需在一年以內')
    const s = await srepo.statsFor(pool, p.id, from, to, now())
    s.contractors = s.contractors.map((c) => ({ ...c, ...contractorScore(c) })).sort((a, b) => b.score - a.score)
    res.json({ from, to, ...s, formula: SCORE_FORMULA })
  })

  app.get('/api/workers', auth, async (req, res) => {
    const p = await staffProject(req)
    const date = today()
    res.json(
      (await srepo.listWorkers(pool, p.id)).map((w) => {
        const dto = srepo.workerToDto(w)
        return { ...dto, qualification: checkQualification(dto, date) }
      }),
    )
  })

  app.patch('/api/workers/:id', auth, async (req, res) => {
    if (!(await srepo.workerById(pool, req.params.id))) throw new HttpError(404, '找不到此人員')
    const b = req.body ?? {}
    const w = await srepo.setWorkerStatus(pool, req.params.id, {
      verified: typeof b.verified === 'boolean' ? b.verified : undefined,
      active: typeof b.active === 'boolean' ? b.active : undefined,
      by: str(b.by, 40) || '工務所',
    })
    res.json(srepo.workerToDto(w))
  })

  app.get('/api/contractors', auth, async (_req, res) => res.json(await srepo.listContractors(pool)))

  app.post('/api/contractors', auth, async (req, res) => {
    const name = str(req.body?.name, 40)
    if (!name) throw new HttpError(400, '請填寫分包商名稱')
    const id = await srepo.saveContractor(pool, null, { name, tradeId: str(req.body?.tradeId, 32), phone: str(req.body?.phone, 20) })
    res.status(201).json((await srepo.listContractors(pool)).find((c) => c.id === id))
  })

  app.patch('/api/contractors/:id', auth, async (req, res) => {
    const existing = (await srepo.listContractors(pool)).find((c) => c.id === req.params.id)
    if (!existing) throw new HttpError(404, '找不到分包商')
    const b = req.body ?? {}
    await srepo.saveContractor(pool, existing.id, {
      name: b.name !== undefined ? str(b.name, 40) || existing.name : existing.name,
      tradeId: b.tradeId !== undefined ? str(b.tradeId, 32) : existing.tradeId,
      phone: b.phone !== undefined ? str(b.phone, 20) : existing.phone,
      active: typeof b.active === 'boolean' ? b.active : undefined,
    })
    res.json((await srepo.listContractors(pool)).find((c) => c.id === existing.id))
  })

  app.get('/api/safety/site', auth, async (req, res) => {
    const p = await staffProject(req)
    const key = await srepo.siteKeyFor(pool, p.id)
    res.json({ project: p.name, siteKey: key, url: `${config.publicUrl}/#/site/${key}` })
  })

  app.post('/api/safety/site/rotate', auth, requireSafety, async (req, res) => {
    const p = await staffProject(req)
    const key = await srepo.siteKeyFor(pool, p.id, { rotate: true })
    res.json({ project: p.name, siteKey: key, url: `${config.publicUrl}/#/site/${key}` })
  })

  app.get('/api/projects/zones', auth, async (req, res) => {
    const p = await staffProject(req)
    res.json({ buildings: p.buildings, floors: p.floors })
  })

  app.put('/api/projects/zones', auth, async (req, res) => {
    const p = await staffProject(req)
    const clean = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 20)).filter(Boolean))].slice(0, 200) : null)
    const buildings = clean(req.body?.buildings)
    const floors = clean(req.body?.floors)
    if (!buildings || !floors?.length) throw new HttpError(400, '請提供棟別與樓層清單')
    await srepo.setZones(pool, p.id, { buildings, floors })
    res.json({ buildings, floors })
  })
}
