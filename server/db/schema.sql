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
