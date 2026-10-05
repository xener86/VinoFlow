const API_URL = '/api/auth';

export interface AuthUser {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
}

export interface AuthConfig {
  signupEnabled: boolean;
  bootstrap: boolean;
  passwordMinLength: number;
}

interface SessionResponse {
  user: { id: string; email: string };
  access_token: string;
  refresh_token: string;
}

const storeSession = (data: SessionResponse): AuthUser => {
  localStorage.setItem('auth_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return {
    id: data.user.id,
    email: data.user.email,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  };
};

export const clearSession = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
};

const postJson = (path: string, body: unknown, token?: string | null) =>
  fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const errorMessage = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return data.msg || fallback;
  } catch {
    return fallback;
  }
};

// Un seul refresh à la fois par onglet : toutes les requêtes qui prennent un
// 401 en même temps attendent le même résultat.
let refreshInFlight: Promise<boolean> | null = null;

const doRefresh = async (): Promise<boolean> => {
  const sent = localStorage.getItem('refresh_token');
  if (!sent) return false;
  const response = await postJson('/refresh', { refresh_token: sent });
  if (response.ok) {
    storeSession(await response.json());
    return true;
  }
  // Un autre onglet a peut-être fait la rotation juste avant nous avec le même
  // refresh token : dans ce cas le localStorage (partagé) contient déjà la
  // nouvelle session.
  await new Promise((r) => setTimeout(r, 300));
  const latest = localStorage.getItem('refresh_token');
  return Boolean(latest && latest !== sent);
};

export const customAuth = {
  async getConfig(): Promise<AuthConfig> {
    const response = await fetch(`${API_URL}/config`);
    if (!response.ok) throw new Error(await errorMessage(response, 'Configuration indisponible'));
    return response.json();
  },

  async signUp(email: string, password: string): Promise<AuthUser> {
    const response = await postJson('/signup', { email, password });
    if (!response.ok) throw new Error(await errorMessage(response, "Échec de l'inscription"));
    return storeSession(await response.json());
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    const response = await postJson('/login', { email, password });
    if (!response.ok) throw new Error(await errorMessage(response, 'Échec de la connexion'));
    return storeSession(await response.json());
  },

  // Révoque la session côté serveur (best effort) puis purge le stockage local.
  async signOut(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await postJson('/logout', { refresh_token: refreshToken });
      } catch {
        // hors ligne : on déconnecte quand même localement
      }
    }
    clearSession();
  },

  /**
   * Échange le refresh token contre une nouvelle session. Renvoie false si la
   * session est perdue (refresh expiré/révoqué). Les erreurs réseau sont
   * propagées pour ne pas déconnecter sur une simple coupure.
   */
  refreshSession(): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = doRefresh().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  },

  async forgotPassword(email: string): Promise<string> {
    const response = await postJson('/forgot', { email });
    if (!response.ok) throw new Error(await errorMessage(response, 'Demande impossible'));
    const data = await response.json();
    return data.msg;
  },

  async resetPassword(token: string, password: string): Promise<void> {
    const response = await postJson('/reset', { token, password });
    if (!response.ok) throw new Error(await errorMessage(response, 'Échec de la réinitialisation'));
  },

  // Révoque toutes les sessions du compte ; l'appareil courant reçoit une
  // nouvelle session.
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const send = () => postJson('/password', { currentPassword, newPassword }, localStorage.getItem('auth_token'));
    let response = await send();
    if (response.status === 401 && (await customAuth.refreshSession())) {
      response = await send();
    }
    if (!response.ok) throw new Error(await errorMessage(response, 'Échec du changement de mot de passe'));
    storeSession(await response.json());
  },

  getUser(): AuthUser | null {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) return null;

    const user = JSON.parse(userStr);
    const refresh_token = localStorage.getItem('refresh_token') || '';

    return {
      id: user.id,
      email: user.email,
      access_token: token,
      refresh_token,
    };
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token');
  },

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  },
};
