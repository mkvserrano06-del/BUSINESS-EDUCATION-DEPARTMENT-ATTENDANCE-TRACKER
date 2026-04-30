import { requireSupabaseClient } from '../lib/supabase';

export async function getClassAttendanceSummary(classId) {
  const client = requireSupabaseClient();
  return client.rpc('get_class_attendance_summary', { target_class_id: classId });
}

export async function getAtRiskStudents(classId, threshold = 75) {
  const client = requireSupabaseClient();
  return client.rpc('get_at_risk_students', {
    target_class_id: classId,
    minimum_percentage: threshold,
  });
}

