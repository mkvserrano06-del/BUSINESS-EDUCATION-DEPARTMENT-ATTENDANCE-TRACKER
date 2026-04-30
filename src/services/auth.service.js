import { requireSupabaseClient, supabase, supabaseConfig } from '../lib/supabase';

export function getSupabaseConfigStatus() {
  if (supabaseConfig.isConfigured) {
    return {
      label: 'Connected configuration',
      detail: 'Supabase URL and public anon key are present. The app can use Supabase services.',
      ready: true,
    };
  }

  return {
    label: 'Local demo mode',
    detail: 'Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to enable Supabase Auth, database, storage, and realtime.',
    ready: false,
  };
}

export async function signInWithPassword(email, password) {
  const client = requireSupabaseClient();
  return client.auth.signInWithPassword({ email, password });
}

export async function getCurrentProfile() {
  const client = requireSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) return { data: null, error: sessionError };

  const userId = sessionData.session?.user?.id;
  if (!userId) {
    return { data: null, error: new Error('No Supabase user session found.') };
  }

  return client
    .from('profiles')
    .select('id, full_name, email, role, department, avatar_url')
    .eq('id', userId)
    .single();
}

export async function signOut() {
  if (!supabase) return { error: null };
  return supabase.auth.signOut();
}

export async function getCurrentSession() {
  if (!supabase) return { data: { session: null }, error: null };
  return supabase.auth.getSession();
}
