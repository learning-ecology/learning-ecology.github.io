-- ============================================================
--  migration64_ticker_links.sql — fixed group links on the ticker bar
--
--  Two fixed, clickable group links (Zalo / Facebook) shown on the
--  LEFT of the announcement bar, next to the scrolling text. Each is
--  targeted with the SAME token vocabulary as ticker_announcements
--  (see migration63), so a page can show its own group.
--
--  "Global default + specific override": for each platform the bar
--  picks the most specific matching link — a page-targeted link wins
--  over a global one; a global one (targets '{}' or 'all') is the
--  fallback shown everywhere.
--
--  Read: everyone (public bar, no login). Write: owner only.
--  Safe to run more than once. If not run, the bar simply shows no
--  group links (the feature fails open).
-- ============================================================

create table if not exists public.ticker_links (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null check (platform in ('zalo', 'facebook')),
  title       text not null default '',      -- e.g. "Group luyện VSTEP"
  url         text not null default '',       -- opens in a new tab
  enabled     boolean not null default true,
  targets     text[] not null default '{}',   -- same tokens as ticker_announcements
  sort_order  int     not null default 100,   -- lower wins among equally-specific links
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ticker_links_platform_idx
  on public.ticker_links (platform, sort_order);

alter table public.ticker_links enable row level security;

drop policy if exists "ticker links read" on public.ticker_links;
create policy "ticker links read" on public.ticker_links
  for select to anon, authenticated using (true);

drop policy if exists "ticker links write" on public.ticker_links;
create policy "ticker links write" on public.ticker_links
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
