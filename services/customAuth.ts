const API_URL = '/api/auth'; // Notre backend au lieu de GoTrue

export interface AuthUser {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
}

export const customAuth = {
  // Inscription
  async signUp(email: string, password: string): Promise<AuthUser> {
    const response = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.msg || 'Signup failed');
    }

    const data = await response.json();
    localStorage.setItem('auth_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    return {
      id: data.user.id,
      email: data.user.email,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    };
  },

  // Connexion
  async signIn(email: string, password: string): Promise<AuthUser> {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.msg || 'Login failed');
    }

    const data = await response.json();
    localStorage.setItem('auth_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    return {
      id: data.user.id,
      email: data.user.email,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    };
  },

  // Déconnexion
  async signOut(): Promise<void> {
    const token = localStorage.getItem('auth_token');
    
    if (token) {
      await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  // Récupérer l'utilisateur actuel
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

  // Vérifier si l'utilisateur est connecté
  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token');
  },

  // Récupérer le token pour les requêtes API
  getToken(): string | null {
    return localStorage.getItem('auth_token');
  },
};
