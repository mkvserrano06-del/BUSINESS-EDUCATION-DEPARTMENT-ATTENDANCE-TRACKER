import { requireSupabaseClient } from '../lib/supabase';

export async function listAttendanceSessions(classId) {
  const client = requireSupabaseClient();
  return client
    .from('attendance_sessions')
    .select('*, classes(subjects(subject_code, subject_name), sections(year_level, section_name))')
    .eq('class_id', classId)
    .order('session_date', { ascending: false });
}

export async function createAttendanceSession(payload) {
  const client = requireSupabaseClient();
  return client.from('attendance_sessions').insert(payload).select().single();
}

export async function saveAttendanceRecord(record) {
  const client = requireSupabaseClient();
  return client
    .from('attendance_records')
    .upsert(record, { onConflict: 'session_id,student_id' })
    .select()
    .single();
}

export async function listAttendanceRecords(sessionId) {
  const client = requireSupabaseClient();
  return client
    .from('attendance_records')
    .select('*, students(student_number, first_name, middle_name, last_name)')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: false });
}

