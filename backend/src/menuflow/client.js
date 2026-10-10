// Client de l'API MenuFlow (planning des dîners du foyer). Seul VinoFlow appelle
// MenuFlow : lecture des dîners, écriture du vin de chaque dîner (jeton « write »).
const base = () => `${(process.env.MENUFLOW_URL || '').replace(/\/+$/, '')}/api/v1`;

export const isMenuflowConfigured = () => Boolean(process.env.MENUFLOW_URL && process.env.MENUFLOW_TOKEN);

const call = async (method, path, body) => {
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.MENUFLOW_TOKEN}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`MenuFlow injoignable (${error.message})`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`jeton MenuFlow refusé (${res.status})`);
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) throw new Error(`MenuFlow a répondu ${res.status}`);
  return res.status === 204 ? null : res.json();
};

export const getWeeks = (limit = 8) => call('GET', `/weeks?limit=${limit}`);
export const getWeek = (startDate) => call('GET', `/weeks/${startDate}`);
export const getDinnerByDate = (day) => call('GET', `/dinners/by-date/${day}`);
export const putDinnerWine = (day, payload) => call('PUT', `/dinners/by-date/${day}/wine`, payload);
export const deleteDinnerWine = (day) => call('DELETE', `/dinners/by-date/${day}/wine`);
