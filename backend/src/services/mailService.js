// Envoi d'emails transactionnels via l'API Sweego.
// Doc : https://learn.sweego.io/docs/sending/how_to_send_email_by_api
//   POST https://api.sweego.io/send — en-tête `Api-Key`, corps JSON
//   { channel: 'email', provider: 'sweego', recipients, from, subject,
//     'message-txt', 'message-html' }
//
// Sans SWEEGO_API_KEY (dev, self-host sans email), rien n'est envoyé : le
// contenu texte est écrit dans les logs du backend pour pouvoir suivre les
// liens à la main.

const SWEEGO_URL = 'https://api.sweego.io/send';

export const isMailConfigured = () => Boolean(process.env.SWEEGO_API_KEY && process.env.MAIL_FROM);

// MAIL_FROM accepte "adresse@domaine" ou "Nom <adresse@domaine>".
const parseFrom = (raw) => {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw || '');
  if (m) return { name: m[1] || 'VinoFlow', email: m[2] };
  return { name: 'VinoFlow', email: (raw || '').trim() };
};

/**
 * Envoie un email. Lève une erreur si Sweego répond en erreur.
 * @param {{ to: string, subject: string, text: string, html?: string }} msg
 * @returns {Promise<{ sent: boolean }>} sent=false quand l'envoi est désactivé (log only)
 */
export async function sendMail({ to, subject, text, html }) {
  if (!isMailConfigured()) {
    console.log(`📧 [mail désactivé — SWEEGO_API_KEY/MAIL_FROM absents] À: ${to}\nSujet: ${subject}\n${text}`);
    return { sent: false };
  }

  const body = {
    channel: 'email',
    provider: 'sweego',
    recipients: [{ email: to }],
    from: parseFrom(process.env.MAIL_FROM),
    subject,
    'message-txt': text,
    ...(html ? { 'message-html': html } : {}),
    'campaign-type': 'transac',
  };

  const res = await fetch(SWEEGO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': process.env.SWEEGO_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Sweego ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { sent: true };
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Gabarit HTML minimal et sobre, partagé par tous les emails VinoFlow.
export const renderMailHtml = ({ title, paragraphs, cta, footer = [] }) => `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Georgia,serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-size:20px;color:#7f1d1d">VinoFlow</p>
<h1 style="font-size:18px;font-weight:normal;margin:0 0 16px">${escapeHtml(title)}</h1>
${paragraphs.map((p) => `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;margin:0 0 16px">${escapeHtml(p)}</p>`).join('\n')}
${cta ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#7f1d1d;color:#fff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;padding:12px 20px;border-radius:6px">${escapeHtml(cta.label)}</a></p>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#78716c;word-break:break-all;margin:0 0 16px">${escapeHtml(cta.url)}</p>` : ''}
${footer.map((p) => `<p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#78716c;margin:0 0 12px">${escapeHtml(p)}</p>`).join('\n')}
</div></body></html>`;
