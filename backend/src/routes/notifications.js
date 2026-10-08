// Réglages des notifications du compte connecté, test d'un canal, aperçu et
// envoi immédiat de la newsletter.
import { Router } from 'express';
import { isMailConfigured } from '../services/mailService.js';
import { notifyLimiter } from '../middleware/rateLimits.js';
import { getSettings, saveSettings, validateSettingsPatch, publicSettings, recentLog, logDeliveries } from '../notifications/store.js';
import { availableChannels, deliver } from '../notifications/channels.js';
import { renderNewsletter, testMessage } from '../notifications/render.js';
import { composeNewsletter } from '../notifications/newsletter.js';
import { isNoteAvailable } from '../notifications/sommelierNote.js';
import { APP_URL } from '../config.js';

const router = Router();

const settingsResponse = async (req, settings) => ({
  ...publicSettings(settings),
  email: req.user.email,
  mailConfigured: isMailConfigured(),
  aiConfigured: isNoteAvailable(),
  recent: await recentLog(req.user.userId),
});

router.get('/notifications/settings', async (req, res) => {
  try {
    res.json(await settingsResponse(req, await getSettings(req.user.userId)));
  } catch (error) {
    console.error('notifications settings error:', error);
    res.status(500).json({ error: 'Lecture des réglages impossible' });
  }
});

router.put('/notifications/settings', async (req, res) => {
  const { patch, errors } = validateSettingsPatch(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' ; ') });
  try {
    res.json(await settingsResponse(req, await saveSettings(req.user.userId, patch)));
  } catch (error) {
    console.error('notifications save error:', error);
    res.status(500).json({ error: 'Enregistrement des réglages impossible' });
  }
});

router.post('/notifications/test', notifyLimiter, async (req, res) => {
  const { channel } = req.body || {};
  if (!['gotify', 'email'].includes(channel)) return res.status(400).json({ error: 'channel doit valoir gotify ou email' });
  try {
    const settings = await getSettings(req.user.userId);
    if (channel === 'gotify' && (!settings.gotifyUrl || !settings.gotifyToken)) {
      return res.status(400).json({ error: 'Renseignez et enregistrez l’URL et le jeton Gotify' });
    }
    const message = testMessage({ appUrl: APP_URL });
    const results = await deliver([channel], { settings, email: req.user.email, message });
    await logDeliveries(req.user.userId, 'test', results, message.title);
    res.json(results[0]);
  } catch (error) {
    console.error('notifications test error:', error);
    res.status(500).json({ error: 'Test impossible' });
  }
});

const limitWhenAi = (req, res, next) => (req.query.ai === '1' ? notifyLimiter(req, res, next) : next());

router.get('/notifications/newsletter/preview', limitWhenAi, async (req, res) => {
  try {
    const settings = await getSettings(req.user.userId);
    const message = renderNewsletter(await composeNewsletter(settings, { withAi: req.query.ai === '1' }));
    res.json({ subject: message.subject, html: message.html, markdown: message.markdown });
  } catch (error) {
    console.error('newsletter preview error:', error);
    res.status(500).json({ error: 'Aperçu impossible' });
  }
});

router.post('/notifications/newsletter/send-now', notifyLimiter, async (req, res) => {
  try {
    const settings = await getSettings(req.user.userId);
    const channels = availableChannels(settings);
    if (channels.length === 0) return res.status(400).json({ error: 'Aucun canal activé et configuré' });
    const message = renderNewsletter(await composeNewsletter(settings, { withAi: settings.newsletterAi }));
    const results = await deliver(channels, { settings, email: req.user.email, message });
    await logDeliveries(req.user.userId, 'newsletter', results, message.title);
    res.json({ results });
  } catch (error) {
    console.error('newsletter send error:', error);
    res.status(500).json({ error: 'Envoi impossible' });
  }
});

export default router;
