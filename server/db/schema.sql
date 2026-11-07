-- 工地缺失改善管理系統：PostgreSQL / Supabase 資料庫結構（可重複執行）

create extension if not exists pgcrypto;

create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  line_group_id  text,                        -- LINE 群組綁定後，廠商回報時推播通知
  created_at     timestamptz not null default now()
);

create table if not exists trades (
  id     text primary key,                    -- waterproof / masonry / mep / rebar / formwork / safety
  label  text not null,
  icon   text,
  sort   int  not null default 0
);

create table if not exists trade_items (      -- 常見缺失項目快選標籤
  id        serial primary key,
  trade_id  text not null references trades(id) on delete cascade,
  label     text not null,
  sort      int  not null default 0,
  unique (trade_id, label)
);

create table if not exists contractors (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  trade_id    text references trades(id),     -- 依工種自動推薦
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists defects (
  id             uuid primary key,            -- 由前端產生，離線建立後可重送（冪等）
  report_no      text not null unique,        -- DF-YYYYMMDD-NNN
  project_id     uuid not null references projects(id),
  building       text,
  floor          text not null,
  trade_id       text not null references trades(id),
  item           text not null,
  description    text,
  severity       text not null default 'normal' check (severity in ('normal', 'major')),
  contractor_id  text references contractors(id),
  due_date       date not null,
  status         text not null default 'open' check (status in ('open', 'replied', 'closed')),
  inspector_name text,
  pdf_url        text,
  reply_token    text not null unique,        -- 廠商回報連結用，免登入
  reply_note     text,
  replied_at     timestamptz,
  review_note    text,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);

create index if not exists defects_project_status_idx on defects (project_id, status, due_date);

create table if not exists defect_photos (
  id          uuid primary key default gen_random_uuid(),
  defect_id   uuid not null references defects(id) on delete cascade,
  kind        text not null default 'before' check (kind in ('before', 'after')),  -- 缺失照 / 改善後照
  url         text not null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists defect_photos_defect_idx on defect_photos (defect_id, kind, sort);

create table if not exists defect_logs (      -- 建立、回報、複查、結案歷程
  id          bigserial primary key,
  defect_id   uuid not null references defects(id) on delete cascade,
  action      text not null,                  -- created / replied / closed / reopened / rejected
  actor       text,
  note        text,
  created_at  timestamptz not null default now()
);

-- 戶別／編號（口述「三零一室」等）
alter table defects add column if not exists unit text;

-- 每日工作日誌：每位工程師每天每專案一份；送出後才可簽退下班
create table if not exists daily_logs (
  id              text primary key,             -- '<日期>_<工程師>'，離線重送冪等
  log_date        date not null,
  project_id      uuid references projects(id),
  engineer        text not null,
  weather         text,
  work_content    text,
  manpower        text,
  issues          text,
  tomorrow_plan   text,
  defects_opened  int not null default 0,
  defects_closed  int not null default 0,
  submitted_at    timestamptz,
  clock_out_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists daily_logs_date_idx on daily_logs (log_date, project_id);

-- 照片／PDF 存於資料庫（STORAGE=db，免費主機無持久磁碟時使用）
create table if not exists stored_files (
  key           text primary key,
  content_type  text not null,
  data          bytea not null,
  created_at    timestamptz not null default now()
);

-- ===================================================================
-- 工人進場報到＋全員吹哨＋整改閉環（封閉式工安管理）
-- ===================================================================

-- 工地報到 QR 金鑰（印在工地入口）與工區設定（棟別、樓層）
alter table projects add column if not exists site_key text unique;
alter table projects add column if not exists buildings jsonb;
alter table projects add column if not exists floors jsonb;

create table if not exists workers (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null,
  phone           text not null,
  contractor_id   text references contractors(id),
  role            text not null default 'worker' check (role in ('worker', 'leader', 'manager')),
  insurance_ok    boolean not null default false,  -- 勞保／職災保險已投保（自填，工務所核驗）
  training_until  date,                            -- 安衛教育訓練有效期限
  licenses        jsonb not null default '[]',     -- [{type, until}]
  token_hash      text not null unique,            -- 工人手機登入憑證，只存雜湊
  line_user_id    text,
  verified_at     timestamptz,                     -- 工務所核驗身分與證照
  verified_by     text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, phone)
);

create table if not exists checkins (              -- 每日進場報到（一人一天一筆）
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  worker_id       uuid not null references workers(id) on delete cascade,
  contractor_id   text references contractors(id),
  checkin_date    date not null,
  building        text,
  floors          jsonb not null default '[]',
  height_work     boolean not null default false,
  ppe             jsonb not null default '{}',
  hazards_ack     jsonb not null default '[]',     -- 簽認的危害告知內容
  handover_ack    jsonb not null default '[]',     -- 確認閱讀的工區缺失 id
  warnings        jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (worker_id, checkin_date)
);
create index if not exists checkins_project_date_idx on checkins (project_id, checkin_date);

create table if not exists checkin_attempts (      -- 被擋下的報到（資格不符、工區管制）
  id             bigserial primary key,
  project_id     uuid not null references projects(id) on delete cascade,
  worker_id      uuid not null references workers(id) on delete cascade,
  contractor_id  text,
  attempt_date   date not null,
  reasons        jsonb not null,
  created_at     timestamptz not null default now()
);
create index if not exists checkin_attempts_project_date_idx on checkin_attempts (project_id, attempt_date);

create table if not exists site_hazards (          -- 當日危害告知（TBM）
  project_id   uuid not null references projects(id) on delete cascade,
  hazard_date  date not null,
  items        jsonb not null,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  primary key (project_id, hazard_date)
);

-- 缺失來源、通報分類與限期改善（SLA）
alter table defects add column if not exists source text not null default 'engineer';
alter table defects add column if not exists category text;
alter table defects add column if not exists reporter_worker_id uuid references workers(id) on delete set null;
alter table defects add column if not exists due_at timestamptz;
alter table defects add column if not exists dispatched_at timestamptz;
alter table defects add column if not exists escalated_at timestamptz;
alter table defects add column if not exists receipt_hash text unique;  -- 匿名吹哨回執（只存雜湊，不含身分）
update defects set due_at = (due_date + time '17:00') at time zone 'Asia/Taipei' where due_at is null;
create index if not exists defects_project_due_idx on defects (project_id, status, due_at);

do $$
begin
  -- 狀態新增 pending（待審派工）與 dismissed（通報不成立）
  if not exists (select 1 from pg_constraint where conname = 'defects_status_check'
                  and pg_get_constraintdef(oid) like '%dismissed%') then
    alter table defects drop constraint if exists defects_status_check;
    alter table defects add constraint defects_status_check
      check (status in ('pending', 'open', 'replied', 'closed', 'dismissed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'defects_source_check') then
    alter table defects add constraint defects_source_check check (source in ('engineer', 'worker', 'whistle'));
  end if;
end $$;

create table if not exists defect_dispatches (     -- 派工通知對象
  id             bigserial primary key,
  defect_id      uuid not null references defects(id) on delete cascade,
  worker_id      uuid references workers(id) on delete cascade,
  contractor_id  text,
  responsible    boolean not null default false,   -- true：責任工班；false：同工區知會
  created_at     timestamptz not null default now()
);
create index if not exists defect_dispatches_defect_idx on defect_dispatches (defect_id);

create table if not exists zone_unlocks (          -- 隔日工區管制：會同安衛確認後當日解鎖
  id           bigserial primary key,
  defect_id    uuid not null references defects(id) on delete cascade,
  unlock_date  date not null,
  unlocked_by  text,
  note         text,
  created_at   timestamptz not null default now(),
  unique (defect_id, unlock_date)
);

create table if not exists safety_points (         -- 工安點數
  id          bigserial primary key,
  worker_id   uuid not null references workers(id) on delete cascade,
  defect_id   uuid references defects(id) on delete set null,
  points      int not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  unique (worker_id, defect_id, reason)
);
