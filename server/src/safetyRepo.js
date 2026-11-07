import { randomBytes, randomUUID } from 'node:crypto'
import {
  DEFAULT_HAZARDS,
  blockingDefects,
  categoryById,
  dueAtFor,
  siteDate,
  zoneMatches,
} from '../../shared/safety.js'
import { tx } from './db.js'
import { assignReportNo, findDefect, replacePhotos } from './repo.js'
import { sha256 } from './http.js'

// ---------- 專案、報到 QR、工區設定 ----------

export async function projectBySiteKey(db, key) {
  const { rows } = await db.query('select * from projects where site_key = $1', [key])
  return rows[0] ?? null
}

export async function ensureProject(db, name) {
  const { rows } = await db.query(
    'insert into projects (name) values ($1) on conflict (name) do update set name = excluded.name returning *',
    [name.trim()],
  )
  return rows[0]
}

/** 取得報到 QR 金鑰；尚未產生時建立。rotate 為 true 時換新（舊 QR 立即失效）。 */
export async function siteKeyFor(db, projectId, { rotate = false } = {}) {
  const key = randomBytes(9).toString('base64url')
  const { rows } = await db.query(
    `update projects set site_key = case when $3 or site_key is null then $2 else site_key end
      where id = $1 returning site_key`,
    [projectId, key, rotate],
  )
  return rows[0].site_key
}

export async function setZones(db, projectId, { buildings, floors }) {
  await db.query('update projects set buildings = $2, floors = $3 where id = $1', [
    projectId,
    JSON.stringify(buildings),
    JSON.stringify(floors),
  ])
}

// ---------- 當日危害告知（TBM） ----------

/** 當日內容；未設定時沿用最近一次，再沒有則用預設內容。 */
export async function hazardsFor(db, projectId, date) {
  const { rows } = await db.query(
    `select hazard_date, items, updated_by from site_hazards
      where project_id = $1 and hazard_date <= $2 order by hazard_date desc limit 1`,
    [projectId, date],
  )
  const row = rows[0]
  if (!row) return { date, items: DEFAULT_HAZARDS, isDefault: true, updatedBy: null }
  return { date: row.hazard_date, items: row.items, isDefault: false, isToday: row.hazard_date === date, updatedBy: row.updated_by }
}

export async function saveHazards(db, projectId, date, items, by) {
  await db.query(
    `insert into site_hazards (project_id, hazard_date, items, updated_by) values ($1, $2, $3, $4)
     on conflict (project_id, hazard_date) do update set items = excluded.items, updated_by = excluded.updated_by, updated_at = now()`,
    [projectId, date, JSON.stringify(items), by || null],
  )
}

// ---------- 工人 ----------

const WORKER_SELECT = `
  select w.*, c.name as contractor_name, c.trade_id as contractor_trade
    from workers w left join contractors c on c.id = w.contractor_id`

export const workerToDto = (w) => ({
  id: w.id,
  name: w.name,
  phone: w.phone,
  contractorId: w.contractor_id ?? '',
  contractorName: w.contractor_name ?? '',
  role: w.role,
  insuranceOk: w.insurance_ok,
  trainingUntil: w.training_until ?? '',
  licenses: w.licenses ?? [],
  verifiedAt: w.verified_at,
  verifiedBy: w.verified_by ?? '',
  active: w.active,
  hasLine: Boolean(w.line_user_id),
  createdAt: w.created_at,
})

export async function workerByToken(db, token) {
  const { rows } = await db.query(`${WORKER_SELECT} where w.token_hash = $1 and w.active`, [sha256(token)])
  return rows[0] ?? null
}

export async function workerById(db, id) {
  const { rows } = await db.query(`${WORKER_SELECT} where w.id = $1`, [id])
  return rows[0] ?? null
}

/**
 * 註冊（同一工地同一手機號碼視為同一人：重新綁定新手機，並需工務所重新核驗）。
 * @returns {{ worker: object, token: string }}
 */
export async function registerWorker(db, projectId, w, token) {
  const { rows } = await db.query(
    `insert into workers (project_id, name, phone, contractor_id, role, insurance_ok, training_until, licenses, token_hash, line_user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (project_id, phone) do update set
       name = excluded.name, contractor_id = excluded.contractor_id, role = excluded.role,
       insurance_ok = excluded.insurance_ok, training_until = excluded.training_until, licenses = excluded.licenses,
       token_hash = excluded.token_hash, line_user_id = coalesce(excluded.line_user_id, workers.line_user_id),
       verified_at = null, verified_by = null, active = true, updated_at = now()
     returning id`,
    [
      projectId, w.name, w.phone, w.contractorId, w.role, Boolean(w.insuranceOk), w.trainingUntil || null,
      JSON.stringify(w.licenses ?? []), sha256(token), w.lineUserId || null,
    ],
  )
  return workerById(db, rows[0].id)
}

/** 修改資料：所屬工班、身分、保險、訓練或證照有變動時，須工務所重新核驗。 */
export async function updateWorker(db, id, w) {
  await db.query(
    `update workers set
       verified_at = case when contractor_id is distinct from $3 or role <> $4 or insurance_ok <> $5
                           or training_until is distinct from $6::date or licenses <> $7::jsonb
                          then null else verified_at end,
       name = $2, contractor_id = $3, role = $4, insurance_ok = $5, training_until = $6, licenses = $7,
       line_user_id = coalesce($8, line_user_id), updated_at = now()
     where id = $1`,
    [id, w.name, w.contractorId, w.role, Boolean(w.insuranceOk), w.trainingUntil || null, JSON.stringify(w.licenses ?? []), w.lineUserId || null],
  )
  return workerById(db, id)
}

export async function listWorkers(db, projectId) {
  const { rows } = await db.query(`${WORKER_SELECT} where w.project_id = $1 order by w.active desc, c.name, w.name`, [projectId])
  return rows
}

export async function setWorkerStatus(db, id, { verified, active, by }) {
  await db.query(
    `update workers set
       verified_at = case when $2::boolean is null then verified_at when $2 then coalesce(verified_at, now()) else null end,
       verified_by = case when $2::boolean is null then verified_by when $2 then $4 else null end,
       active = coalesce($3, active), updated_at = now()
     where id = $1`,
    [id, verified ?? null, active ?? null, by || null],
  )
  return workerById(db, id)
}

// ---------- 報到 ----------

const CHECKIN_SELECT = `
  select ch.*, w.name as worker_name, w.role, w.line_user_id, w.verified_at,
         c.name as contractor_name, c.trade_id as contractor_trade
    from checkins ch
    join workers w on w.id = ch.worker_id
    left join contractors c on c.id = ch.contractor_id`

export const checkinToDto = (c) => ({
  id: c.id,
  date: c.checkin_date,
  workerId: c.worker_id,
  workerName: c.worker_name,
  role: c.role,
  contractorId: c.contractor_id ?? '',
  contractorName: c.contractor_name ?? '',
  building: c.building ?? '',
  floors: c.floors ?? [],
  heightWork: c.height_work,
  ppe: c.ppe,
  warnings: c.warnings ?? [],
  verified: Boolean(c.verified_at),
  createdAt: c.created_at,
  updatedAt: c.updated_at,
})

export async function checkinOf(db, workerId, date) {
  const { rows } = await db.query(`${CHECKIN_SELECT} where ch.worker_id = $1 and ch.checkin_date = $2`, [workerId, date])
  return rows[0] ?? null
}

export async function checkinsOn(db, projectId, date) {
  const { rows } = await db.query(`${CHECKIN_SELECT} where ch.project_id = $1 and ch.checkin_date = $2 order by ch.created_at`, [
    projectId,
    date,
  ])
  return rows
}

/** 某位置當日在場的工班（依報到工區比對），附各工班的工班長／負責人。 */
export function crewsAt(checkins, loc) {
  const crews = new Map()
  for (const c of checkins) {
    if (!c.contractor_id || !zoneMatches({ building: c.building, floors: c.floors }, loc)) continue
    const crew = crews.get(c.contractor_id) ?? {
      contractorId: c.contractor_id,
      contractorName: c.contractor_name,
      tradeId: c.contractor_trade,
      count: 0,
      leaders: [],
    }
    crew.count++
    if (c.role !== 'worker') crew.leaders.push({ workerId: c.worker_id, name: c.worker_name, lineUserId: c.line_user_id })
    crews.set(c.contractor_id, crew)
  }
  return [...crews.values()].sort((a, b) => b.count - a.count)
}

export async function saveCheckin(db, c) {
  const { rows } = await db.query(
    `insert into checkins (project_id, worker_id, contractor_id, checkin_date, building, floors, height_work, ppe,
                           hazards_ack, handover_ack, warnings)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (worker_id, checkin_date) do update set
       contractor_id = excluded.contractor_id, building = excluded.building, floors = excluded.floors,
       height_work = excluded.height_work, ppe = excluded.ppe, hazards_ack = excluded.hazards_ack,
       handover_ack = excluded.handover_ack, warnings = excluded.warnings, updated_at = now()
     returning worker_id`,
    [
      c.projectId, c.workerId, c.contractorId || null, c.date, c.building || null, JSON.stringify(c.floors),
      c.heightWork, JSON.stringify(c.ppe), JSON.stringify(c.hazardsAck), JSON.stringify(c.handoverAck), JSON.stringify(c.warnings),
    ],
  )
  return checkinOf(db, rows[0].worker_id, c.date)
}

export async function recordAttempt(db, { projectId, workerId, contractorId, date, reasons }) {
  await db.query(
    'insert into checkin_attempts (project_id, worker_id, contractor_id, attempt_date, reasons) values ($1, $2, $3, $4, $5)',
    [projectId, workerId, contractorId || null, date, JSON.stringify(reasons)],
  )
}

export async function attemptsOn(db, projectId, date) {
  const { rows } = await db.query(
    `select a.*, w.name as worker_name, c.name as contractor_name
       from checkin_attempts a join workers w on w.id = a.worker_id left join contractors c on c.id = a.contractor_id
      where a.project_id = $1 and a.attempt_date = $2 order by a.created_at desc`,
    [projectId, date],
  )
  return rows.map((a) => ({
    workerId: a.worker_id,
    workerName: a.worker_name,
    contractorName: a.contractor_name ?? '',
    reasons: a.reasons,
    createdAt: a.created_at,
  }))
}

// ---------- 工區缺失與隔日管制 ----------

/** 工人看得到的缺失摘要（不含通報人）。 */
export const briefDefect = (d) => ({
  id: d.id,
  reportNo: d.report_no,
  building: d.building ?? '',
  floor: d.floor,
  unit: d.unit ?? '',
  item: d.item,
  category: d.category ?? '',
  description: d.description ?? '',
  severity: d.severity,
  status: d.status,
  source: d.source,
  contractorId: d.contractor_id ?? '',
  contractorName: d.contractor_name ?? '',
  dueAt: d.due_at,
  escalatedAt: d.escalated_at,
  createdAt: d.created_at,
  photo: d.photo ?? null,
})

const BRIEF_SELECT = `
  select d.*, c.name as contractor_name,
         (select url from defect_photos where defect_id = d.id and kind = 'before' order by sort limit 1) as photo
    from defects d left join contractors c on c.id = d.contractor_id`

/** 工區危險交接：該工區尚未銷案的缺失（待審中的匿名吹哨未經安衛審核，不公開）。 */
export async function zoneDefects(db, projectId, zone) {
  const { rows } = await db.query(
    `${BRIEF_SELECT}
      where d.project_id = $1 and d.status in ('pending', 'open', 'replied')
        and not (d.source = 'whistle' and d.status = 'pending')
      order by (d.severity = 'major') desc, d.due_at nulls last`,
    [projectId],
  )
  return rows.filter((d) => zoneMatches(zone, d)).map(briefDefect)
}

/** 未銷案 A 級缺失（含今日是否已解鎖），供隔日管制判斷。 */
export async function openMajorDefects(db, projectId, date, contractorId) {
  const { rows } = await db.query(
    `${BRIEF_SELECT.replace('select d.*,', `select d.*, exists(select 1 from zone_unlocks u where u.defect_id = d.id and u.unlock_date = $2) as unlocked,`)}
      where d.project_id = $1 and d.severity = 'major' and d.status in ('open', 'replied')
        and ($3::text is null or d.contractor_id = $3)
      order by d.created_at`,
    [projectId, date, contractorId ?? null],
  )
  return rows.map((d) => ({ ...briefDefect(d), unlocked: d.unlocked }))
}

export async function restrictionsFor(db, projectId, date, contractorId, zone) {
  if (!contractorId) return []
  const defects = await openMajorDefects(db, projectId, date, contractorId)
  return blockingDefects({ defects, contractorId, zone, date })
}

export async function unlockDefect(db, defectId, date, by, note) {
  await db.query(
    `insert into zone_unlocks (defect_id, unlock_date, unlocked_by, note) values ($1, $2, $3, $4)
     on conflict (defect_id, unlock_date) do update set unlocked_by = excluded.unlocked_by, note = excluded.note`,
    [defectId, date, by || null, note || null],
  )
  await db.query("insert into defect_logs (defect_id, action, actor, note) values ($1, 'unlocked', $2, $3)", [
    defectId,
    by || 'safety',
    note || null,
  ])
}

// ---------- 通報與派工 ----------

/** 責任工班的工班長／負責人（不論今日是否在場）。 */
async function crewLeaders(db, projectId, contractorId) {
  const { rows } = await db.query(
    `select id as worker_id, name, line_user_id from workers
      where project_id = $1 and contractor_id = $2 and role in ('leader', 'manager') and active`,
    [projectId, contractorId],
  )
  return rows.map((r) => ({ workerId: r.worker_id, name: r.name, lineUserId: r.line_user_id }))
}

/**
 * 記錄派工通知對象：責任工班的工班長／負責人，以及同工區在場其他工班的工班長（知會）。
 * @returns {Promise<{ workerId: string, name: string, lineUserId: string|null, responsible: boolean }[]>}
 */
async function recordDispatch(client, { defectId, projectId, contractorId, crews }) {
  const notified = []
  for (const l of await crewLeaders(client, projectId, contractorId)) notified.push({ ...l, contractorId, responsible: true })
  for (const crew of crews) {
    if (crew.contractorId === contractorId) continue
    for (const l of crew.leaders) notified.push({ ...l, contractorId: crew.contractorId, responsible: false })
  }
  for (const n of notified) {
    await client.query(
      'insert into defect_dispatches (defect_id, worker_id, contractor_id, responsible) values ($1, $2, $3, $4)',
      [defectId, n.workerId, n.contractorId, n.responsible],
    )
  }
  return notified
}

/**
 * 建立現場通報（具名 worker／匿名 whistle）。
 * 具名且可判定責任工班時立即派工（status open）；否則進入待審派工（pending）。匿名吹哨一律先經安衛審核。
 * @returns {Promise<{ row: object, notified: object[] }>}
 */
export async function createReport(pool, { project, source, reporterId, report, contractorId, crews, receiptHash, now }) {
  const cat = categoryById(report.categoryId)
  const dueAt = dueAtFor(report.severity, now)
  const dispatchNow = source === 'worker' && Boolean(contractorId)
  return tx(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('defect_report_no'))")
    const id = randomUUID()
    const reportNo = await assignReportNo(client, null, now)
    await client.query(
      `insert into defects (id, project_id, building, floor, unit, trade_id, item, description, severity, contractor_id,
                            due_date, due_at, status, source, category, reporter_worker_id, receipt_hash, report_no,
                            reply_token, created_at, dispatched_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        id, project.id, report.building || null, report.floor, report.unit || null, cat.tradeId, cat.label,
        report.description || null, report.severity, contractorId || null, siteDate(dueAt), dueAt,
        dispatchNow ? 'open' : 'pending', source, cat.id, source === 'worker' ? reporterId : null, receiptHash ?? null,
        reportNo, randomBytes(18).toString('base64url'), now, dispatchNow ? now : null,
      ],
    )
    await replacePhotos(client, id, 'before', report.photos)
    // 匿名吹哨：歷程不記任何身分
    await client.query('insert into defect_logs (defect_id, action, actor) values ($1, $2, $3)', [
      id,
      'reported',
      source === 'worker' ? 'worker' : 'anonymous',
    ])
    const notified = dispatchNow ? await recordDispatch(client, { defectId: id, projectId: project.id, contractorId, crews }) : []
    if (dispatchNow) await client.query("insert into defect_logs (defect_id, action, actor) values ($1, 'dispatched', 'system')", [id])
    return { row: await findDefect(client, 'd.id', id), notified }
  })
}

/** 工務所派工：指定責任工班與等級（期限自通報時間起算），狀態轉為待改善。 */
export async function dispatchDefect(pool, before, { contractorId, severity, actor, crews, now }) {
  const dueAt = dueAtFor(severity, before.created_at)
  return tx(pool, async (client) => {
    await client.query(
      `update defects set contractor_id = $2, severity = $3, due_at = $4::timestamptz, due_date = $5, status = 'open',
              dispatched_at = $6::timestamptz,
              escalated_at = case when $4::timestamptz > $6::timestamptz then null else escalated_at end,
              review_note = null, closed_at = null
        where id = $1`,
      [before.id, contractorId, severity, dueAt, siteDate(dueAt), now],
    )
    await client.query("insert into defect_logs (defect_id, action, actor) values ($1, 'dispatched', $2)", [before.id, actor])
    const notified = await recordDispatch(client, { defectId: before.id, projectId: before.project_id, contractorId, crews })
    return { row: await findDefect(client, 'd.id', before.id), notified }
  })
}

export async function dismissDefect(pool, id, { reason, actor, now }) {
  return tx(pool, async (client) => {
    await client.query("update defects set status = 'dismissed', review_note = $2, closed_at = $3 where id = $1", [id, reason, now])
    await client.query("insert into defect_logs (defect_id, action, actor, note) values ($1, 'dismissed', $2, $3)", [id, actor, reason])
    return findDefect(client, 'd.id', id)
  })
}

export async function notifiedFor(db, defectId) {
  const { rows } = await db.query(
    `select w.name, w.role, c.name as contractor_name, dd.responsible
       from defect_dispatches dd join workers w on w.id = dd.worker_id left join contractors c on c.id = dd.contractor_id
      where dd.defect_id = $1 order by dd.responsible desc, w.name`,
    [defectId],
  )
  return rows.map((r) => ({ name: r.name, role: r.role, contractorName: r.contractor_name ?? '', responsible: r.responsible }))
}

/** 工班長／負責人：本工班待改善與待複查的缺失（含回報連結 token）。 */
export async function crewTasks(db, projectId, contractorId) {
  const { rows } = await db.query(
    `${BRIEF_SELECT}
      where d.project_id = $1 and d.contractor_id = $2 and d.status in ('open', 'replied')
      order by d.due_at nulls last`,
    [projectId, contractorId],
  )
  return rows.map((d) => ({ ...briefDefect(d), replyToken: d.reply_token, reviewNote: d.status === 'open' ? d.review_note ?? '' : '' }))
}

export async function myReports(db, workerId) {
  const { rows } = await db.query(
    `${BRIEF_SELECT.replace('select d.*,', 'select d.*, (select sum(points) from safety_points p where p.defect_id = d.id and p.worker_id = $1) as points,')}
      where d.reporter_worker_id = $1 order by d.created_at desc limit 50`,
    [workerId],
  )
  return rows.map((d) => ({ ...briefDefect(d), points: Number(d.points ?? 0), closedAt: d.closed_at }))
}

export async function statusByReceipt(db, receipt) {
  const { rows } = await db.query('select report_no, status, created_at, closed_at from defects where receipt_hash = $1', [sha256(receipt)])
  const r = rows[0]
  return r ? { reportNo: r.report_no, status: r.status, createdAt: r.created_at, closedAt: r.closed_at } : null
}

// ---------- 逾時升級 ----------

/** 已過改善期限仍未回報的缺失標記升級（每件只升級一次），回傳需推播的缺失。 */
export async function escalateOverdue(pool, now) {
  return tx(pool, async (client) => {
    const { rows } = await client.query(
      `update defects set escalated_at = $1
        where status in ('pending', 'open') and due_at < $1 and escalated_at is null
        returning id`,
      [now],
    )
    const out = []
    for (const { id } of rows) {
      await client.query("insert into defect_logs (defect_id, action, actor) values ($1, 'escalated', 'system')", [id])
      out.push(await findDefect(client, 'd.id', id))
    }
    return out
  })
}

// ---------- 點數 ----------

export async function pointsOf(db, workerId) {
  const { rows } = await db.query(
    `select p.points, p.reason, p.created_at, d.report_no, d.item
       from safety_points p left join defects d on d.id = p.defect_id
      where p.worker_id = $1 order by p.created_at desc limit 100`,
    [workerId],
  )
  return {
    total: rows.reduce((s, r) => s + r.points, 0),
    history: rows.map((r) => ({ points: r.points, reason: r.reason, reportNo: r.report_no, item: r.item, createdAt: r.created_at })),
  }
}

// ---------- 統計 ----------

const RANGE = `created_at >= $2::date at time zone 'Asia/Taipei' and created_at < ($3::date + 1) at time zone 'Asia/Taipei'`

export async function statsFor(db, projectId, from, to, now) {
  const [byContractor, checkins, attempts, contractors, categories, daily, leaders, whistle, totals] = await Promise.all([
    db.query(
      `select contractor_id,
              count(*) filter (where severity = 'major') as major,
              count(*) filter (where severity = 'normal') as normal,
              count(*) filter (where coalesce(replied_at, closed_at) is not null or due_at < $4) as judged,
              count(*) filter (where coalesce(replied_at, closed_at) <= due_at) as on_time,
              count(*) filter (where status = 'open' and due_at < $4) as overdue,
              avg(extract(epoch from coalesce(replied_at, closed_at) - coalesce(dispatched_at, created_at)) / 3600)
                filter (where coalesce(replied_at, closed_at) is not null) as avg_hours
         from defects
        where project_id = $1 and contractor_id is not null and status not in ('pending', 'dismissed') and ${RANGE}
        group by contractor_id`,
      [projectId, from, to, now],
    ),
    db.query(
      `select contractor_id, count(*) as n, count(distinct worker_id) as people from checkins
        where project_id = $1 and checkin_date between $2 and $3 group by contractor_id`,
      [projectId, from, to],
    ),
    db.query(
      `select contractor_id, count(*) as n from checkin_attempts
        where project_id = $1 and attempt_date between $2 and $3 group by contractor_id`,
      [projectId, from, to],
    ),
    db.query('select id, name from contractors'),
    db.query(
      `select coalesce(category, '') as category, source, count(*) as n from defects
        where project_id = $1 and ${RANGE} group by 1, 2`,
      [projectId, from, to],
    ),
    db.query(
      `select to_char(created_at at time zone 'Asia/Taipei', 'YYYY-MM-DD') as day, source, count(*) as n from defects
        where project_id = $1 and ${RANGE} group by 1, 2 order by 1`,
      [projectId, from, to],
    ),
    db.query(
      `select w.name, c.name as contractor_name, sum(p.points) as points, count(*) as reports
         from safety_points p join workers w on w.id = p.worker_id left join contractors c on c.id = w.contractor_id
        where w.project_id = $1 and p.created_at >= $2::date at time zone 'Asia/Taipei'
          and p.created_at < ($3::date + 1) at time zone 'Asia/Taipei'
        group by w.id, w.name, c.name order by points desc, w.name limit 10`,
      [projectId, from, to],
    ),
    db.query(
      `select status, count(*) as n from defects where project_id = $1 and source = 'whistle' and ${RANGE} group by status`,
      [projectId, from, to],
    ),
    db.query(
      `select (select count(*) from checkins where project_id = $1 and checkin_date between $2 and $3) as checkins,
              (select count(distinct worker_id) from checkins where project_id = $1 and checkin_date between $2 and $3) as people,
              (select count(*) from checkin_attempts where project_id = $1 and attempt_date between $2 and $3) as blocked`,
      [projectId, from, to],
    ),
  ])
  const n = (v) => Number(v ?? 0)
  const names = new Map(contractors.rows.map((c) => [c.id, c.name]))
  const ids = new Set([...byContractor.rows, ...checkins.rows, ...attempts.rows].map((r) => r.contractor_id).filter(Boolean))
  return {
    contractors: [...ids].map((id) => {
      const d = byContractor.rows.find((r) => r.contractor_id === id) ?? {}
      const c = checkins.rows.find((r) => r.contractor_id === id) ?? {}
      const a = attempts.rows.find((r) => r.contractor_id === id) ?? {}
      return {
        contractorId: id,
        contractorName: names.get(id) ?? id,
        checkins: n(c.n),
        people: n(c.people),
        blocked: n(a.n),
        major: n(d.major),
        normal: n(d.normal),
        judged: n(d.judged),
        onTime: n(d.on_time),
        overdue: n(d.overdue),
        avgHours: d.avg_hours == null ? null : Math.round(Number(d.avg_hours) * 10) / 10,
      }
    }),
    categories: categories.rows.map((r) => ({ category: r.category, source: r.source, count: n(r.n) })),
    daily: daily.rows.map((r) => ({ day: r.day, source: r.source, count: n(r.n) })),
    leaderboard: leaders.rows.map((r) => ({ name: r.name, contractorName: r.contractor_name ?? '', points: n(r.points), reports: n(r.reports) })),
    whistle: Object.fromEntries(whistle.rows.map((r) => [r.status, n(r.n)])),
    totals: { checkins: n(totals.rows[0].checkins), people: n(totals.rows[0].people), blocked: n(totals.rows[0].blocked) },
  }
}

// ---------- 分包商 ----------

export async function listContractors(db) {
  const { rows } = await db.query('select id, name, trade_id, phone, active from contractors order by active desc, name')
  return rows.map((c) => ({ id: c.id, name: c.name, tradeId: c.trade_id ?? '', phone: c.phone ?? '', active: c.active }))
}

export async function saveContractor(db, id, { name, tradeId, phone, active }) {
  const { rows } = await db.query(
    `insert into contractors (id, name, trade_id, phone, active) values (coalesce($1, gen_random_uuid()::text), $2, $3, $4, coalesce($5, true))
     on conflict (id) do update set name = excluded.name, trade_id = excluded.trade_id, phone = excluded.phone,
       active = coalesce($5, contractors.active)
     returning id`,
    [id ?? null, name, tradeId || null, phone || null, active ?? null],
  )
  return rows[0].id
}
