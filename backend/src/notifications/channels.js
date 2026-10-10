// Canaux d'envoi des notifications : Gotify (POST {url}/message) et email (Sweego).
import { sendMail, isMailConfigured } from '../services/mailService.js';

export const sendGotify = async ({ url, token, title, markdown, priority = 4 }) => {
  const endpoint = `${String(url).replace(/\/+$/, '')}/message`;
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': token },
      body: JSON.stringify({
        title,
        message: markdown,
        priority,
        extras: { 'client::display': { contentType: 'text/markdown' } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`serveur Gotify injoignable (${error.message})`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`jeton Gotify refusé (${res.status})`);
  if (!res.ok) throw new Error(`Gotify a répondu ${res.status}`);
};

export const availableChannels = (settings) => [
  ...(settings.gotifyEnabled && settings.gotifyUrl && settings.gotifyToken ? ['gotify'] : []),
  ...(settings.emailEnabled && isMailConfigured() ? ['email'] : []),
];

/** Envoie le message sur chaque canal ; ne lève jamais, renvoie un résultat par canal. */
export const deliver = async (channels, { settings, email, message }) => {
  const results = [];
  for (const channel of channels) {
    try {
      if (channel === 'gotify') {
        if (!settings.gotifyUrl || !settings.gotifyToken) throw new Error('URL ou jeton Gotify manquant');
        await sendGotify({
          url: settings.gotifyUrl, token: settings.gotifyToken,
          title: message.title, markdown: message.markdown, priority: message.priority,
        });
      } else {
        const { sent } = await sendMail({ to: email, subject: message.subject, text: message.text, html: message.html });
        if (!sent) throw new Error("envoi d'email non configuré sur le serveur");
      }
      results.push({ channel, ok: true });
    } catch (error) {
      results.push({ channel, ok: false, error: error.message });
    }
  }
  return results;
};
