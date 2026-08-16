-- ===================================================================
--  Leaf — schema
--  Paste this whole file into the Supabase SQL editor and run it.
--  Free tier is enough for a demo and a first restaurant.
-- ===================================================================

-- ------------------------------------------------------------------
--  Branches. Every other table hangs off this, and every query is
--  scoped to it, so a second restaurant is a row and not a migration.
-- ------------------------------------------------------------------
create table if not exists branches (
  id          text primary key,
  name        text not null,
  name_ar     text,
  city        text,
  tables      int  not null default 12,
  created_at  timestamptz not null default now()
);

insert into branches (id, name, name_ar, city, tables) values
  ('b1', 'Rainbow Street', 'شارع الرينبو', 'Amman', 14),
  ('b2', 'Abdoun',         'عبدون',        'Amman', 10)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
--  The order log. Append-only: a bump, a cancel and an 86 are all just
--  rows. Both surfaces replay it, so nobody holds the truth alone and
--  a screen that reconnects catches up without asking anyone.
-- ------------------------------------------------------------------
create table if not exists order_events (
  id          bigserial primary key,
  branch_id   text not null references branches(id) on delete cascade,
  type        text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists order_events_branch_time
  on order_events (branch_id, created_at desc);

-- realtime push to subscribed clients
alter publication supabase_realtime add table order_events;

-- ------------------------------------------------------------------
--  Menu availability. Kept as its own table rather than only in the
--  log because an 86 has to survive past a day's replay window.
-- ------------------------------------------------------------------
create table if not exists menu_availability (
  branch_id   text not null references branches(id) on delete cascade,
  item_id     text not null,
  available   boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (branch_id, item_id)
);

alter publication supabase_realtime add table menu_availability;

-- ------------------------------------------------------------------
--  Staff. Roles are checked by permission key in the app; this table
--  only says which role a signed-in person holds, and where.
-- ------------------------------------------------------------------
create table if not exists staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  branch_id   text not null references branches(id) on delete cascade,
  role        text not null check (role in ('owner','manager','server','kitchen')),
  display_name text,
  created_at  timestamptz not null default now()
);

-- ===================================================================
--  Row level security
--
--  Demo posture, deliberately permissive: a diner has no account, so
--  anon has to be able to read and write the order log. Tighten before
--  taking real payments — notes on that at the bottom.
-- ===================================================================

alter table branches          enable row level security;
alter table order_events      enable row level security;
alter table menu_availability enable row level security;
alter table staff             enable row level security;

drop policy if exists branches_read on branches;
create policy branches_read on branches
  for select using (true);

drop policy if exists events_read on order_events;
create policy events_read on order_events
  for select using (true);

drop policy if exists events_write on order_events;
create policy events_write on order_events
  for insert with check (
    branch_id in (select id from branches)
    and length(type) between 1 and 64
    and pg_column_size(payload) < 20000
  );

drop policy if exists avail_read on menu_availability;
create policy avail_read on menu_availability
  for select using (true);

-- only signed-in staff may 86 a dish
drop policy if exists avail_write on menu_availability;
create policy avail_write on menu_availability
  for all using (
    exists (select 1 from staff s where s.user_id = auth.uid() and s.branch_id = menu_availability.branch_id)
  ) with check (
    exists (select 1 from staff s where s.user_id = auth.uid() and s.branch_id = menu_availability.branch_id)
  );

drop policy if exists staff_self on staff;
create policy staff_self on staff
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------------
--  Housekeeping: the log is a day's trading, not an archive.
--  Schedule with pg_cron, or call it from an edge function nightly.
-- ------------------------------------------------------------------
create or replace function prune_order_events() returns void
language sql as $$
  delete from order_events where created_at < now() - interval '3 days';
$$;

-- ===================================================================
--  BEFORE REAL MONEY MOVES
--
--  1. A table code should be a signed token in the QR, not a table
--     number. Right now anyone can post an order for table 7.
--  2. Move inserts behind an edge function that validates prices
--     against the menu server-side. A client can currently claim any
--     unit price it likes.
--  3. Bump, recall, close and 86 should require an authenticated
--     staff row — split them out of the anon-writable log.
--  4. Tax invoices come from the POS. Confirm JoFotara enrolment
--     before anything here is treated as a receipt.
-- ===================================================================
