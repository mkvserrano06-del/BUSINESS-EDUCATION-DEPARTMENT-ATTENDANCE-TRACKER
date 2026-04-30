import { supabase, supabaseConfig } from '../lib/supabase';

export const liveStateSnapshotId = 'business-ed-event-attendance';

export function canUseLiveState() {
  return Boolean(supabaseConfig.isConfigured && supabase);
}

export function stripPrivateState(state) {
  return {
    students: state.students || [],
    events: state.events || [],
    logs: state.logs || [],
    notices: state.notices || [],
    adminAccount: state.adminAccount || null,
    officerAccounts: state.officerAccounts || [],
  };
}

export function normalizeLiveState(liveState = {}) {
  return {
    students: Array.isArray(liveState.students) ? liveState.students : [],
    events: Array.isArray(liveState.events) ? liveState.events : [],
    logs: Array.isArray(liveState.logs) ? liveState.logs : [],
    notices: Array.isArray(liveState.notices) ? liveState.notices : [],
    adminAccount: liveState.adminAccount || null,
    officerAccounts: Array.isArray(liveState.officerAccounts) ? liveState.officerAccounts : null,
  };
}

export function mergeLiveState(localState, liveState) {
  const normalized = normalizeLiveState(liveState);

  return {
    ...localState,
    students: normalized.students,
    events: normalized.events,
    logs: normalized.logs,
    notices: normalized.notices,
    adminAccount: normalized.adminAccount || localState.adminAccount,
    officerAccounts: normalized.officerAccounts || localState.officerAccounts,
  };
}

export async function loadLiveStateSnapshot() {
  if (!canUseLiveState()) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }

  const { data, error } = await supabase
    .from('app_state_snapshots')
    .select('state, updated_at')
    .eq('id', liveStateSnapshotId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: data?.state || null, error: null, updatedAt: data?.updated_at };
}

export async function saveLiveStateSnapshot(state) {
  if (!canUseLiveState()) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }

  const snapshotResult = await supabase
    .from('app_state_snapshots')
    .upsert({
      id: liveStateSnapshotId,
      state: stripPrivateState(state),
      updated_at: new Date().toISOString(),
    })
    .select('updated_at')
    .single();

  if (snapshotResult.error) return snapshotResult;

  const studentSyncResult = await syncStudentsTable(state.students || []);
  if (studentSyncResult.error) {
    return {
      data: snapshotResult.data,
      error: studentSyncResult.error,
    };
  }

  return snapshotResult;
}

export async function syncStudentsTable(students) {
  if (!students.length) return { data: null, error: null };

  const rows = students
    .map(toStudentRow)
    .filter((student) => student.student_number && student.first_name && student.last_name);

  if (!rows.length) return { data: null, error: null };

  return supabase
    .from('students')
    .upsert(rows, { onConflict: 'student_number', ignoreDuplicates: false })
    .select('id, student_number');
}

function toStudentRow(student) {
  return {
    student_number: student.idNo || student.studentNo || student.student_number || '',
    first_name: student.firstName || student.first_name || '',
    middle_name: student.middleName || student.middle_name || null,
    last_name: student.lastName || student.last_name || '',
    email: student.email || null,
    year_level: student.yearLevel || student.year_level || student.year || null,
    college: student.college || null,
    course: student.course || student.program || null,
    sex: student.sex || student.gender || null,
    civil_status: student.civilStatus || student.civil_status || null,
    status: student.status || 'active',
    updated_at: new Date().toISOString(),
  };
}

export function subscribeToLiveStateSnapshot(onStateChange, onError) {
  if (!canUseLiveState()) return null;

  const channel = supabase
    .channel('app-state-snapshot-live')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'app_state_snapshots',
        filter: `id=eq.${liveStateSnapshotId}`,
      },
      (payload) => {
        const nextState = payload.new?.state;
        if (nextState) onStateChange(nextState);
      }
    )
    .subscribe((status, error) => {
      if (error) onError?.(error);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
