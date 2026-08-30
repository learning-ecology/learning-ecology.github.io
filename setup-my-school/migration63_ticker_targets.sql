-- ============================================================
--  migration63_ticker_targets.sql — targeting for the ticker
--
--  Adds a `targets` list to ticker_announcements so an announcement
--  can be GLOBAL (empty list, or contains 'all') or TARGETED to
--  specific page groups / pages / courses.
--
--  Token vocabulary (matched against the page's own context in
--  ticker.js): page groups  reading | english | chinese | hsk |
--  vstep | vsat | tools | courses | home | dashboard ;
--  a specific page  page:<file-without-.html> ;
--  a specific course  course:<course-id> ;
--  a custom category  cat:<name>.
--  An announcement shows on a page when it is global OR shares at
--  least one token with that page's context.
--
--  Safe to run more than once; older rows default to GLOBAL.
-- ============================================================

alter table public.ticker_announcements
  add column if not exists targets text[] not null default '{}';

-- (RLS unchanged from migration62: read = everyone, write = owner.)
