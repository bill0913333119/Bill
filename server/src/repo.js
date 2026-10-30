import { randomBytes } from 'node:crypto'
import { tx } from './db.js'

const SELECT = `
  select d.*, p.name as project_name, p.line_group_id,
         t.label as trade_label, t.icon as trade_icon, c.name as contractor_name,
         coalesce((select json_agg(url order by sort) from defect_photos where defect_id = d.id and kind = 'before'), '[]') as photos,
         coalesce((select json_agg(url order by sort) from defect_photos where defect_id = d.id and kind = 'after'), '[]') as after_photos
    from defects d
    join projects p on p.id = d.project_id
    join trades t on t.id = d.trade_id
    left join contractors c on c.id = d.contractor_id`

export function toDto(row, publicUrl) {
  return {
    id: row.id,
    reportNo: row.report_no,
    projectName: row.project_name,
    building: row.building ?? '',
    floor: row.floor,
    unit: row.unit ?? '',
    tradeId: row.trade_id,
    tradeLabel: `${row.trade_icon ?? ''} ${row.trade_label}`.trim(),
    item: row.item,
    description: row.description ?? '',
    severity: row.severity,
    contractorId: row.contractor_id ?? '',
    contractorName: row.contractor_name ?? '',
    dueDate: row.due_date,
    status: row.status,
    inspector: row.inspector_name ?? '',
    pdfUrl: row.pdf_url ?? '',
    replyUrl: `${publicUrl}/#/reply/${row.reply_token}`,
    replyNote: row.reply_note ?? '',
    repliedAt: row.replied_at,
    reviewNote: row.review_note ?? '',
    createdAt: row.created_at,
    closedAt: row.closed_at,
    photos: row.photos,
    afterPhotos: row.after_photos,
    lineGroupId: row.line_group_id ?? null,
  }
}

/** 對外（廠商）只揭露改善所需欄位。 */
export function toPublicDto(dto) {
  const { lineGroupId, inspector, reviewNote, ...rest } = dto
  return { ...rest, reviewNote: dto.status === 'open' ? reviewNote : '' }
}

export async function getPresets(db) {
  const [{ rows: trades }, { rows: items }, { rows: contractors }, { rows: projects }] = await Promise.all([
    db.query('select id, label, icon from trades order by sort, id'),
    db.query('select trade_id, label from trade_items order by trade_id, sort, id'),
    db.query('select id, name, trade_id as "tradeId", coalesce(phone, \'\') as phone from contractors where active order by name'),
    db.query('select name from projects order by created_at, name'),
  ])
  return {
    trades: trades.map((t) => ({ ...t, items: items.filter((i) => i.trade_id === t.id).map((i) => i.label) })),
    contractors,
    projects: projects.map((p) => p.name),
  }
}

export async function findDefect(db, where, param) {
  const { rows } = await db.query(`${SELECT} where ${where} = $1`, [param])
  return rows[0] ?? null
}

export async function listDefects(db, { project, status, limit = 200 }) {
  const cond = []
  const params = []
  if (project) cond.push(`p.name = $${params.push(project)}`)
  if (status) cond.push(`d.status = $${params.push(status)}`)
  params.push(Math.min(Number(limit) || 200, 500))
  const { rows } = await db.query(
    `${SELECT} ${cond.length ? `where ${cond.join(' and ')}` : ''} order by d.created_at desc limit $${params.length}`,
    params,
  )
  return rows
}

const TZ_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })

async function assignReportNo(client, requested, createdAt) {
  const prefix = `DF-${TZ_DATE.format(createdAt).replaceAll('-', '')}-`
  if (requested?.startsWith(prefix)) {
    const { rowCount } = await client.query('select 1 from defects where report_no = $1', [requested])
    if (!rowCount) return requested
  }
  const { rows } = await client.query(
    `select coalesce(max(substring(report_no from length($1) + 1)::int), 0) + 1 as n
       from defects where report_no like $1 || '%' and substring(report_no from length($1) + 1) ~ '^[0-9]+$'`,
    [prefix],
  )
  return `${prefix}${String(rows[0].n).padStart(3, '0')}`
}

async function replacePhotos(client, defectId, kind, urls) {
  await client.query('delete from defect_photos where defect_id = $1 and kind = $2', [defectId, kind])
  for (const [i, url] of urls.entries()) {
    await client.query('insert into defect_photos (defect_id, kind, url, sort) values ($1, $2, $3, $4)', [defectId, kind, url, i])
  }
}

/**
 * 建立或更新缺失（以前端 id 冪等）。新建時由伺服器確認單號，避免多台手機撞號。
 */
export async function upsertDefect(pool, id, d) {
  return tx(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('defect_report_no'))")
    const { rows: proj } = await client.query(
      'insert into projects (name) values ($1) on conflict (name) do update set name = excluded.name returning id',
      [d.projectName.trim()],
    )
    const fields = [
      proj[0].id, d.building || null, d.floor, d.tradeId, d.item, d.description || null,
      d.severity ?? 'normal', d.contractorId || null, d.dueDate, d.inspector || null, d.unit || null,
    ]
    const existing = await client.query('select 1 from defects where id = $1', [id])
    if (existing.rowCount) {
      await client.query(
        `update defects set project_id = $2, building = $3, floor = $4, trade_id = $5, item = $6, description = $7,
                severity = $8, contractor_id = $9, due_date = $10, inspector_name = $11, unit = $12,
                pdf_url = coalesce($13, pdf_url)
          where id = $1`,
        [id, ...fields, d.pdfUrl || null],
      )
    } else {
      const createdAt = d.createdAt ? new Date(d.createdAt) : new Date()
      const reportNo = await assignReportNo(client, d.reportNo, createdAt)
      await client.query(
        `insert into defects (id, project_id, building, floor, trade_id, item, description, severity, contractor_id,
                              due_date, inspector_name, unit, pdf_url, report_no, reply_token, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [id, ...fields, d.pdfUrl || null, reportNo, randomBytes(18).toString('base64url'), createdAt],
      )
      await client.query("insert into defect_logs (defect_id, action, actor) values ($1, 'created', $2)", [id, d.inspector || null])
    }
    if (Array.isArray(d.photos)) await replacePhotos(client, id, 'before', d.photos)
    return findDefect(client, 'd.id', id)
  })
}

export async function submitReply(pool, defectId, { note, photos }) {
  return tx(pool, async (client) => {
    await client.query(
      "update defects set status = 'replied', reply_note = $2, replied_at = now() where id = $1",
      [defectId, note || null],
    )
    await replacePhotos(client, defectId, 'after', photos)
    await client.query("insert into defect_logs (defect_id, action, actor, note) values ($1, 'replied', 'contractor', $2)", [defectId, note || null])
    return findDefect(client, 'd.id', defectId)
  })
}

/** 工程師複查：closed 結案；open 退回（已回報者）或重開。 */
export async function reviewDefect(pool, defectId, { status, reviewNote, pdfUrl, afterPhotos }, before) {
  return tx(pool, async (client) => {
    if (pdfUrl) await client.query('update defects set pdf_url = $2 where id = $1', [defectId, pdfUrl])
    if (afterPhotos) await replacePhotos(client, defectId, 'after', afterPhotos)
    if (status && status !== before.status) {
      await client.query(
        `update defects set status = $2, review_note = $3,
                closed_at = case when $2 = 'closed' then now() else null end
          where id = $1`,
        [defectId, status, reviewNote || null],
      )
      const action = status === 'closed' ? 'closed' : before.status === 'replied' ? 'rejected' : 'reopened'
      await client.query('insert into defect_logs (defect_id, action, actor, note) values ($1, $2, $3, $4)', [
        defectId, action, 'engineer', reviewNote || null,
      ])
    }
    return findDefect(client, 'd.id', defectId)
  })
}

export async function bindLineGroup(db, projectName, groupId) {
  await db.query(
    'insert into projects (name, line_group_id) values ($1, $2) on conflict (name) do update set line_group_id = excluded.line_group_id',
    [projectName, groupId],
  )
}

// ---------- 每日工作日誌 ----------
const LOG_SELECT = `
  select l.*, p.name as project_name
    from daily_logs l left join projects p on p.id = l.project_id`

export const logToDto = (r) => ({
  id: r.id,
  date: r.log_date,
  projectName: r.project_name ?? '',
  engineer: r.engineer,
  weather: r.weather ?? 'sunny',
  workContent: r.work_content ?? '',
  manpower: r.manpower ?? '',
  issues: r.issues ?? '',
  tomorrowPlan: r.tomorrow_plan ?? '',
  defectsOpened: r.defects_opened,
  defectsClosed: r.defects_closed,
  submittedAt: r.submitted_at,
  clockOutAt: r.clock_out_at,
})

export async function upsertLog(db, id, l) {
  const { rows: proj } = await db.query(
    'insert into projects (name) values ($1) on conflict (name) do update set name = excluded.name returning id',
    [l.projectName.trim()],
  )
  // 已送出的日誌不可被舊資料覆蓋：送出時間與簽退時間一旦寫入就保留
  await db.query(
    `insert into daily_logs (id, log_date, project_id, engineer, weather, work_content, manpower, issues, tomorrow_plan,
                             defects_opened, defects_closed, submitted_at, clock_out_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (id) do update set
       project_id = excluded.project_id, weather = excluded.weather, work_content = excluded.work_content,
       manpower = excluded.manpower, issues = excluded.issues, tomorrow_plan = excluded.tomorrow_plan,
       defects_opened = excluded.defects_opened, defects_closed = excluded.defects_closed,
       submitted_at = coalesce(daily_logs.submitted_at, excluded.submitted_at),
       clock_out_at = coalesce(daily_logs.clock_out_at, excluded.clock_out_at),
       updated_at = now()`,
    [
      id, l.date, proj[0].id, l.engineer.trim(), l.weather || null, l.workContent || null, l.manpower || null,
      l.issues || null, l.tomorrowPlan || null, l.defectsOpened ?? 0, l.defectsClosed ?? 0,
      l.submittedAt || null, l.clockOutAt || null,
    ],
  )
  const { rows } = await db.query(`${LOG_SELECT} where l.id = $1`, [id])
  return rows[0]
}

export async function listLogs(db, { date, project, engineer }) {
  const cond = []
  const params = []
  if (date) cond.push(`l.log_date = $${params.push(date)}`)
  if (project) cond.push(`p.name = $${params.push(project)}`)
  if (engineer) cond.push(`l.engineer = $${params.push(engineer)}`)
  const { rows } = await db.query(
    `${LOG_SELECT} ${cond.length ? `where ${cond.join(' and ')}` : ''} order by l.log_date desc, l.engineer limit 500`,
    params,
  )
  return rows
}

/** 指定日期尚未送出日誌的工程師：近 14 天內開過單或交過日誌者，視為該專案的現場工程師。 */
export async function missingLogs(db, date, project) {
  const { rows } = await db.query(
    `with crew as (
       select distinct d.inspector_name as engineer, d.project_id
         from defects d where d.inspector_name is not null and d.created_at >= $1::date - 14
       union
       select distinct l.engineer, l.project_id from daily_logs l where l.log_date >= $1::date - 14
     )
     select c.engineer, p.name as project_name
       from crew c join projects p on p.id = c.project_id
      where ($2::text is null or p.name = $2)
        and not exists (
          select 1 from daily_logs l
           where l.log_date = $1 and l.engineer = c.engineer and l.project_id = c.project_id and l.submitted_at is not null)
      order by p.name, c.engineer`,
    [date, project || null],
  )
  return rows.map((r) => ({ engineer: r.engineer, projectName: r.project_name }))
}
