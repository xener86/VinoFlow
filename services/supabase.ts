let supabaseUrl: string | null = null;
let supabaseKey: string | null = null;

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
  initSupabase();
};

export const initSupabase = () => {
  const { url, key } = getSupabaseConfig();
  supabaseUrl = url;
  supabaseKey = key;
};

// Initialize immediately if config exists
initSupabase();

export const getClient = () => null; // Not used anymore

// --- Auth API avec GoTrue direct ---

export const signInWithEmail = async (email: string, password: string) => {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase non configuré");
  
  const response = await fetch(`${supabaseUrl}/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.msg || error.error_description || 'Connexion échouée');
  }

  const data = await response.json();
  localStorage.setItem('auth_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return { user: data.user, session: data };
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase non configuré");
  
  const response = await fetch(`${supabaseUrl}/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.msg || error.error_description || 'Inscription échouée');
  }

  const data = await response.json();
  localStorage.setItem('auth_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return { user: data.user, session: data };
};

export const signOut = async () => {
  const token = localStorage.getItem('auth_token');
  
  if (token && supabaseUrl && supabaseKey) {
    try {
      await fetch(`${supabaseUrl}/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': supabaseKey,
        },
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
  }

  localStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
};

export const getCurrentUser = async () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

// Helper pour les requêtes API authentifiées
export const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};