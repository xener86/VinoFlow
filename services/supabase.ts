
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

// --- Configuration Management ---
export const getSupabaseConfig = () => {
  return {
    url: localStorage.getItem('vf_supabase_url') || '',
    key: localStorage.getItem('vf_supabase_key') || ''
  };
};

export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('vf_supabase_url', url);
  localStorage.setItem('vf_supabase_key', key);
  // Re-init client
  initSupabase();
};

export const initSupabase = () => {
  const { url, key } = getSupabaseConfig();
  if (url && key) {
    supabase = createClient(url, key);
  } else {
    supabase = null;
  }
  return supabase;
};

// Initialize immediately if config exists
initSupabase();

export const getClient = () => supabase;

// --- Auth API ---

export const signInWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase non configuré");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase non configuré");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};

export const getCurrentUser = async () => {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};