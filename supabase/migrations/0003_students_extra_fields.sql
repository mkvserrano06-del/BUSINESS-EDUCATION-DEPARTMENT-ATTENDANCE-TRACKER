alter table public.students
  add column if not exists college text,
  add column if not exists course text,
  add column if not exists sex text,
  add column if not exists civil_status text;

drop policy if exists "students anon live app write" on public.students;

create policy "students anon live app write"
on public.students
for all
to anon
using (true)
with check (true);
