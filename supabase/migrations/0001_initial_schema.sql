create extension if not exists "pgcrypto";

do $$
begin
  create type public.app_role as enum ('admin', 'coordinator', 'instructor', 'student_viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.session_status as enum ('draft', 'open', 'closed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'instructor',
  department text not null default 'Business Education',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  department text not null default 'Business Education',
  is_active boolean not null default true
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id),
  year_level text not null,
  section_name text not null,
  school_year text not null,
  is_active boolean not null default true,
  unique (program_id, year_level, section_name, school_year)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_number text not null unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  email text,
  program_id uuid references public.programs(id),
  section_id uuid references public.sections(id),
  year_level text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  subject_code text not null unique,
  subject_name text not null,
  units numeric(3,1) not null default 3,
  description text,
  is_active boolean not null default true
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id),
  section_id uuid not null references public.sections(id),
  instructor_id uuid not null references public.profiles(id),
  semester text not null,
  school_year text not null,
  schedule text,
  room text,
  is_active boolean not null default true,
  unique (subject_id, section_id, semester, school_year)
);

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id),
  enrolled_at timestamptz not null default now(),
  status text not null default 'active',
  unique (class_id, student_id)
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  session_date date not null,
  start_time time,
  end_time time,
  status public.session_status not null default 'open',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id),
  status public.attendance_status not null,
  remarks text,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_state_snapshots (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists students_section_id_idx on public.students(section_id);
create index if not exists classes_instructor_id_idx on public.classes(instructor_id);
create index if not exists attendance_sessions_class_date_idx on public.attendance_sessions(class_id, session_date);
create index if not exists attendance_records_session_id_idx on public.attendance_records(session_id);
create index if not exists attendance_records_student_id_idx on public.attendance_records(student_id);

create or replace function public.get_current_user_role()
returns public.app_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.get_current_user_role() = 'admin'
$$;

create or replace function public.is_coordinator()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.get_current_user_role() in ('admin', 'coordinator')
$$;

create or replace function public.is_assigned_instructor(target_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.classes
    where id = target_class_id
      and instructor_id = auth.uid()
  )
$$;

alter table public.profiles enable row level security;
alter table public.programs enable row level security;
alter table public.sections enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_state_snapshots enable row level security;

drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
drop policy if exists "setup data read" on public.programs;
drop policy if exists "programs coordinator write" on public.programs;
drop policy if exists "sections read" on public.sections;
drop policy if exists "sections coordinator write" on public.sections;
drop policy if exists "subjects read" on public.subjects;
drop policy if exists "subjects coordinator write" on public.subjects;
drop policy if exists "students staff read" on public.students;
drop policy if exists "students coordinator write" on public.students;
drop policy if exists "classes scoped read" on public.classes;
drop policy if exists "classes coordinator write" on public.classes;
drop policy if exists "enrollments scoped read" on public.class_enrollments;
drop policy if exists "enrollments coordinator write" on public.class_enrollments;
drop policy if exists "sessions scoped read" on public.attendance_sessions;
drop policy if exists "sessions instructor create" on public.attendance_sessions;
drop policy if exists "sessions instructor update" on public.attendance_sessions;
drop policy if exists "records scoped read" on public.attendance_records;
drop policy if exists "records instructor write" on public.attendance_records;
drop policy if exists "notifications self read" on public.notifications;
drop policy if exists "notifications self update" on public.notifications;
drop policy if exists "audit admin read" on public.audit_logs;
drop policy if exists "app state public read" on public.app_state_snapshots;
drop policy if exists "app state public write" on public.app_state_snapshots;

create policy "profiles self read" on public.profiles for select using (id = auth.uid() or public.is_coordinator());
create policy "profiles admin write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "setup data read" on public.programs for select using (auth.role() = 'authenticated');
create policy "programs coordinator write" on public.programs for all using (public.is_coordinator()) with check (public.is_coordinator());
create policy "sections read" on public.sections for select using (auth.role() = 'authenticated');
create policy "sections coordinator write" on public.sections for all using (public.is_coordinator()) with check (public.is_coordinator());
create policy "subjects read" on public.subjects for select using (auth.role() = 'authenticated');
create policy "subjects coordinator write" on public.subjects for all using (public.is_coordinator()) with check (public.is_coordinator());

create policy "students staff read" on public.students for select using (public.get_current_user_role() in ('admin', 'coordinator', 'instructor'));
create policy "students coordinator write" on public.students for all using (public.is_coordinator()) with check (public.is_coordinator());

create policy "classes scoped read" on public.classes
for select using (public.is_coordinator() or instructor_id = auth.uid());
create policy "classes coordinator write" on public.classes
for all using (public.is_coordinator()) with check (public.is_coordinator());

create policy "enrollments scoped read" on public.class_enrollments
for select using (
  public.is_coordinator()
  or exists (
    select 1 from public.classes c
    where c.id = class_id and c.instructor_id = auth.uid()
  )
);
create policy "enrollments coordinator write" on public.class_enrollments
for all using (public.is_coordinator()) with check (public.is_coordinator());

create policy "sessions scoped read" on public.attendance_sessions
for select using (public.is_coordinator() or public.is_assigned_instructor(class_id));
create policy "sessions instructor create" on public.attendance_sessions
for insert with check (public.is_coordinator() or public.is_assigned_instructor(class_id));
create policy "sessions instructor update" on public.attendance_sessions
for update using (public.is_coordinator() or public.is_assigned_instructor(class_id))
with check (public.is_coordinator() or public.is_assigned_instructor(class_id));

create policy "records scoped read" on public.attendance_records
for select using (
  public.is_coordinator()
  or exists (
    select 1
    from public.attendance_sessions s
    join public.classes c on c.id = s.class_id
    where s.id = session_id and c.instructor_id = auth.uid()
  )
);
create policy "records instructor write" on public.attendance_records
for all using (
  public.is_coordinator()
  or exists (
    select 1
    from public.attendance_sessions s
    join public.classes c on c.id = s.class_id
    where s.id = session_id and c.instructor_id = auth.uid()
  )
) with check (
  public.is_coordinator()
  or exists (
    select 1
    from public.attendance_sessions s
    join public.classes c on c.id = s.class_id
    where s.id = session_id and c.instructor_id = auth.uid()
  )
);

create policy "notifications self read" on public.notifications for select using (user_id = auth.uid());
create policy "notifications self update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audit admin read" on public.audit_logs for select using (public.is_admin());

create policy "app state public read"
on public.app_state_snapshots
for select
to anon, authenticated
using (id = 'business-ed-event-attendance');

create policy "app state public write"
on public.app_state_snapshots
for all
to anon, authenticated
using (id = 'business-ed-event-attendance')
with check (id = 'business-ed-event-attendance');

insert into public.app_state_snapshots (id, state)
values ('business-ed-event-attendance', '{}'::jsonb)
on conflict (id) do nothing;

create or replace function public.get_class_attendance_summary(target_class_id uuid)
returns table (
  session_id uuid,
  session_date date,
  present_count bigint,
  absent_count bigint,
  late_count bigint,
  excused_count bigint,
  total_records bigint
)
language sql
stable
security invoker
as $$
  select
    s.id,
    s.session_date,
    count(*) filter (where r.status = 'present'),
    count(*) filter (where r.status = 'absent'),
    count(*) filter (where r.status = 'late'),
    count(*) filter (where r.status = 'excused'),
    count(r.id)
  from public.attendance_sessions s
  left join public.attendance_records r on r.session_id = s.id
  where s.class_id = target_class_id
  group by s.id, s.session_date
  order by s.session_date desc;
$$;

create or replace function public.get_at_risk_students(target_class_id uuid, minimum_percentage numeric default 75)
returns table (
  student_id uuid,
  student_number text,
  full_name text,
  attendance_percentage numeric
)
language sql
stable
security invoker
as $$
  with class_sessions as (
    select id from public.attendance_sessions where class_id = target_class_id
  ),
  enrolled as (
    select st.id, st.student_number, concat_ws(' ', st.first_name, st.middle_name, st.last_name) as full_name
    from public.class_enrollments ce
    join public.students st on st.id = ce.student_id
    where ce.class_id = target_class_id and ce.status = 'active'
  )
  select
    e.id,
    e.student_number,
    e.full_name,
    coalesce(round(100 * count(r.id) filter (where r.status in ('present', 'late', 'excused'))::numeric / nullif((select count(*) from class_sessions), 0), 2), 0) as attendance_percentage
  from enrolled e
  left join public.attendance_records r on r.student_id = e.id and r.session_id in (select id from class_sessions)
  group by e.id, e.student_number, e.full_name
  having coalesce(round(100 * count(r.id) filter (where r.status in ('present', 'late', 'excused'))::numeric / nullif((select count(*) from class_sessions), 0), 2), 0) < minimum_percentage
  order by attendance_percentage asc, e.full_name asc;
$$;
