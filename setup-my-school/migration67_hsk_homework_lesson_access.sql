-- ============================================================
--  migration67_hsk_homework_lesson_access.sql
--
--  A lesson ASSIGNED as homework must be openable by the assigned student
--  even if it is not published, or is premium and the student is not
--  enrolled — the assignment itself is the grant. This adds an extra
--  SELECT policy on hsk_lessons (policies are OR-ed, so it only widens
--  access; migration55's normal student policy still applies otherwise).
--
--  Needs migration66 (hsk_homework) + migration39 (class_students).
--  Safe to run more than once.
-- ============================================================

drop policy if exists "hsk lessons via homework" on public.hsk_lessons;
create policy "hsk lessons via homework" on public.hsk_lessons
  for select to authenticated using (
    exists (
      select 1
        from public.hsk_homework h
        join public.class_students cs on cs.class_id = h.class_id
       where h.lesson_id = hsk_lessons.lesson_id
         and cs.student_id = auth.uid()
         and (cardinality(h.student_ids) = 0 or auth.uid() = any (h.student_ids))
    )
  );
