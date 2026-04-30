-- Hosted Supabase seed data for demo user profiles.
-- Run after supabase/migrations/0001_initial_schema.sql.
--
-- IMPORTANT:
-- Supabase hosted SQL Editor does not allow direct inserts/updates into auth.users.
-- Create these users first in Supabase Dashboard > Authentication > Users:
--
--   Admin:
--     Email:    admin@example.com
--     Password: admin123
--
--   Student Officer:
--     Email:    officer@example.com
--     Password: officer123
--
-- After the Auth users exist, run this file to create their public.profiles rows.
--
-- Note:
-- The current app_role enum does not include student_officer, so the Student
-- Officer is stored as instructor for now. The frontend's current local demo
-- login still uses admin/officer usernames until Supabase Auth login is wired in.

do $$
declare
  admin_user_id uuid;
  officer_user_id uuid;
begin
  select id
    into admin_user_id
  from auth.users
  where email = 'admin@example.com'
  limit 1;

  select id
    into officer_user_id
  from auth.users
  where email = 'officer@example.com'
  limit 1;

  if admin_user_id is null then
    raise notice 'Auth user admin@example.com was not found. Create it in Authentication > Users first.';
  else
    insert into public.profiles (
      id,
      full_name,
      email,
      role,
      department,
      created_at,
      updated_at
    )
    values (
      admin_user_id,
      'System Admin',
      'admin@example.com',
      'admin'::public.app_role,
      'Business Education',
      now(),
      now()
    )
    on conflict (id) do update
    set
      full_name = excluded.full_name,
      email = excluded.email,
      role = excluded.role,
      department = excluded.department,
      updated_at = now();
  end if;

  if officer_user_id is null then
    raise notice 'Auth user officer@example.com was not found. Create it in Authentication > Users first.';
  else
    insert into public.profiles (
      id,
      full_name,
      email,
      role,
      department,
      created_at,
      updated_at
    )
    values (
      officer_user_id,
      'Student Officer',
      'officer@example.com',
      'instructor'::public.app_role,
      'Business Education',
      now(),
      now()
    )
    on conflict (id) do update
    set
      full_name = excluded.full_name,
      email = excluded.email,
      role = excluded.role,
      department = excluded.department,
      updated_at = now();
  end if;
end $$;
