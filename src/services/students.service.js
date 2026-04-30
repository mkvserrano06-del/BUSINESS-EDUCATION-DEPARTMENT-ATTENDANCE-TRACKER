import { requireSupabaseClient } from '../lib/supabase';

const table = 'students';

export async function listStudents(filters = {}) {
  const client = requireSupabaseClient();
  let query = client
    .from(table)
    .select('*, programs(code, name), sections(year_level, section_name)')
    .order('last_name', { ascending: true });

  if (filters.sectionId) {
    query = query.eq('section_id', filters.sectionId);
  }

  if (filters.search) {
    query = query.or(`student_number.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`);
  }

  return query;
}

export async function upsertStudent(student) {
  const client = requireSupabaseClient();
  return client.from(table).upsert(student, { onConflict: 'student_number' }).select().single();
}

export async function archiveStudent(id) {
  const client = requireSupabaseClient();
  return client.from(table).update({ status: 'archived' }).eq('id', id).select().single();
}

