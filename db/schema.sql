-- 工地缺失改善管理系統：PostgreSQL / Supabase 資料庫結構
-- 前端 MVP 目前以 IndexedDB 離線儲存；後端上線後依此結構同步。

create extension if not exists pgcrypto;

create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text unique,
  created_at  timestamptz not null default now()
);

create table users (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  role         text not null default 'engineer' check (role in ('engineer', 'supervisor', 'admin')),
  line_user_id text unique,
  created_at   timestamptz not null default now()
);

create table trades (
  id     text primary key,          -- waterproof / masonry / mep / rebar / formwork / safety
  label  text not null,
  icon   text,
  sort   int  not null default 0
);

create table trade_items (            -- 常見缺失項目快選標籤
  id        serial primary key,
  trade_id  text not null references trades(id),
  label     text not null,
  sort      int  not null default 0
);

create table contractors (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id),
  name        text not null,
  trade_id    text references trades(id),   -- 依工種自動推薦
  phone       text,
  line_group  text,
  created_at  timestamptz not null default now()
);

create table defects (
  id             uuid primary key,            -- 由前端產生，支援離線建立後同步
  report_no      text not null unique,        -- DF-YYYYMMDD-NNN
  project_id     uuid not null references projects(id),
  building       text,
  floor          text not null,
  trade_id       text not null references trades(id),
  item           text not null,
  description    text,
  severity       text not null default 'normal' check (severity in ('normal', 'major')),
  contractor_id  uuid references contractors(id),
  due_date       date not null,
  status         text not null default 'open' check (status in ('open', 'closed')),
  inspector_id   uuid references users(id),
  pdf_url        text,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);

create index defects_project_status_idx on defects (project_id, status, due_date);

create table defect_photos (
  id          uuid primary key default gen_random_uuid(),
  defect_id   uuid not null references defects(id) on delete cascade,
  kind        text not null default 'before' check (kind in ('before', 'after')),  -- 缺失照 / 改善後照
  url         text not null,                 -- S3 / R2 物件位址
  taken_at    timestamptz,
  sort        int not null default 0
);

create table defect_logs (                   -- 指派、分享、結案等歷程
  id          bigserial primary key,
  defect_id   uuid not null references defects(id) on delete cascade,
  action      text not null,                 -- created / shared_line / closed / reopened
  actor_id    uuid references users(id),
  note        text,
  created_at  timestamptz not null default now()
);
