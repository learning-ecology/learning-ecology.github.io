-- ============================================================
--  migration62_ticker.sql — Announcement ticker (scrolling bar)
--
--  A site-wide scrolling announcement bar shown at the very top of
--  the dashboard for every signed-in user. The OWNER manages the
--  messages from Bảng điều khiển → Announce → "Announcement bar".
--
--  Read: anyone (announcements are not secret). The client only
--  DISPLAYS rows that are enabled and inside their schedule.
--  Write: OWNER only (public.is_admin() = role 'owner', migration14).
--
--  Safe to run more than once. If this migration has not been run,
--  the dashboard simply shows no bar (the feature fails open).
-- ============================================================

create table if not exists public.ticker_announcements (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,                       -- the message shown
  icon        text not null default '',            -- optional emoji / short icon
  url         text,                                -- optional link / CTA
  new_tab     boolean not null default true,       -- open link in a new tab?
  enabled     boolean not null default true,       -- on/off switch
  sort_order  int     not null default 100,        -- lower = shown first
  starts_at   timestamptz,                         -- optional schedule start
  ends_at     timestamptz,                         -- optional schedule end
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ticker_announcements_order_idx
  on public.ticker_announcements (sort_order, created_at);

alter table public.ticker_announcements enable row level security;

-- Read: everyone (the client filters by enabled + schedule for display).
drop policy if exists "ticker read" on public.ticker_announcements;
create policy "ticker read" on public.ticker_announcements
  for select to anon, authenticated using (true);

-- Write: owner only.
drop policy if exists "ticker write" on public.ticker_announcements;
create policy "ticker write" on public.ticker_announcements
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
