import React, { useEffect, useState } from 'react';
import { Bell, Eye, Loader2, Send } from 'lucide-react';
import { Badge, Button, Input, Modal, MonoLabel, Select, Skeleton } from './primitives';
import { useToast } from './feedback';
import {
  getNotificationSettings, saveNotificationSettings, sendTestNotification, previewNewsletter, sendNewsletterNow,
} from '../../services/storageService';
import { NotificationChannel, NotificationSettingsPatch, NotificationSettingsResponse, NewsletterPreview } from '../../types';

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const KIND_LABELS = { alert: 'Alerte', newsletter: 'Newsletter', test: 'Test' } as const;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erreur inconnue');

const Check: React.FC<{ label: React.ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }> = ({ label, checked, disabled, onChange }) => (
  <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-stone-400' : 'text-stone-800'}`}>
    <input type="checkbox" className="h-4 w-4 accent-wine-700" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

export const NotificationSettings: React.FC = () => {
  const toast = useToast();
  const [server, setServer] = useState<NotificationSettingsResponse | null>(null);
  const [draft, setDraft] = useState<NotificationSettingsPatch>({});
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<NotificationChannel | null>(null);
  const [preview, setPreview] = useState<NewsletterPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getNotificationSettings().then(setServer).catch((e) => toast.error('Réglages de notification indisponibles : ' + errMsg(e)));
  }, []);

  if (!server) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>;
  }

  const v = { ...server, ...draft };
  const set = (patch: NotificationSettingsPatch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = Object.keys(draft).length > 0 || token.trim() !== '';

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveNotificationSettings({ ...draft, ...(token.trim() ? { gotifyToken: token.trim() } : {}) });
      setServer(saved);
      setDraft({});
      setToken('');
      toast.success('Réglages de notification enregistrés');
    } catch (e) {
      toast.error("L'enregistrement a échoué : " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const test = async (channel: NotificationChannel) => {
    setTesting(channel);
    try {
      const r = await sendTestNotification(channel);
      if (r.ok) toast.success(channel === 'gotify' ? 'Message de test envoyé sur Gotify' : 'Email de test envoyé');
      else toast.error(`Échec du test : ${r.error}`);
      setServer(await getNotificationSettings());
    } catch (e) {
      toast.error('Test impossible : ' + errMsg(e));
    } finally {
      setTesting(null);
    }
  };

  const showPreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await previewNewsletter(v.newsletterAi && server.aiConfigured));
    } catch (e) {
      toast.error('Aperçu impossible : ' + errMsg(e));
    } finally {
      setPreviewing(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const { results } = await sendNewsletterNow();
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) toast.success('Newsletter envoyée');
      else toast.error(failed.map((r) => `${r.channel} : ${r.error}`).join(' · '));
      setServer(await getNotificationSettings());
    } catch (e) {
      toast.error("L'envoi a échoué : " + errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Canaux */}
      <div className="space-y-3">
        <MonoLabel>Canaux</MonoLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Check
            label={<>Email à <strong className="break-all">{server.email}</strong></>}
            checked={v.emailEnabled ?? false}
            disabled={!server.mailConfigured}
            onChange={(emailEnabled) => set({ emailEnabled })}
          />
          {!server.mailConfigured && <Badge tone="neutral">Envoi d'email non configuré sur le serveur</Badge>}
          <Button variant="ghost" size="sm" onClick={() => test('email')} disabled={!server.mailConfigured || testing !== null}>
            {testing === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Tester
          </Button>
        </div>
        <Check label="Gotify" checked={v.gotifyEnabled ?? false} onChange={(gotifyEnabled) => set({ gotifyEnabled })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="URL du serveur Gotify"
            placeholder="https://gotify.example.com"
            value={v.gotifyUrl ?? ''}
            onChange={(e) => set({ gotifyUrl: e.target.value })}
          />
          <Input
            label="Jeton d'application"
            type="password"
            autoComplete="off"
            placeholder={server.gotifyTokenSet ? '••• enregistré' : 'Jeton de l’application Gotify'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => test('gotify')} disabled={!server.gotifyUrl || !server.gotifyTokenSet || testing !== null}>
          {testing === 'gotify' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Tester Gotify
        </Button>
      </div>

      {/* Alertes */}
      <div className="space-y-3">
        <MonoLabel>Alertes immédiates</MonoLabel>
        <Check label="Prévenir quand un vin change d'état" checked={v.alertsEnabled ?? true} onChange={(alertsEnabled) => set({ alertsEnabled })} />
        <div className="pl-6 space-y-2">
          <Check label="Entrée en apogée" checked={v.alertReady ?? true} disabled={!v.alertsEnabled} onChange={(alertReady) => set({ alertReady })} />
          <Check label="Fenêtre qui se referme" checked={v.alertClosing ?? true} disabled={!v.alertsEnabled} onChange={(alertClosing) => set({ alertClosing })} />
          <Check label="Apogée dépassée" checked={v.alertPast ?? true} disabled={!v.alertsEnabled} onChange={(alertPast) => set({ alertPast })} />
        </div>
        <Input
          label="« À boire avant » : horizon en mois"
          type="number" min={1} max={60} wrapperClassName="max-w-[220px]"
          value={v.horizonMonths ?? 12}
          onChange={(e) => set({ horizonMonths: Number(e.target.value) })}
        />
      </div>

      {/* Newsletter */}
      <div className="space-y-3">
        <MonoLabel>Newsletter</MonoLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Fréquence" value={v.newsletterFrequency} onChange={(e) => set({ newsletterFrequency: e.target.value as NotificationSettingsPatch['newsletterFrequency'] })}>
            <option value="off">Désactivée</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle (le 1er)</option>
          </Select>
          {v.newsletterFrequency === 'weekly' && (
            <Select label="Jour" value={v.newsletterWeekday} onChange={(e) => set({ newsletterWeekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </Select>
          )}
          <Select label="Heure" value={v.newsletterHour} onChange={(e) => set({ newsletterHour: Number(e.target.value) })} disabled={v.newsletterFrequency === 'off'}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')} h</option>)}
          </Select>
        </div>
        <Check label="Mot du sommelier (IA)" checked={v.newsletterAi ?? true} onChange={(newsletterAi) => set({ newsletterAi })} />
        {!server.aiConfigured && <p className="text-xs text-stone-500">IA non configurée sur le serveur : la newsletter partira sans le mot du sommelier.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={showPreview} disabled={previewing}>
            {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Aperçu
          </Button>
          <Button variant="outline" size="sm" onClick={sendNow} disabled={sending || dirty}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Envoyer maintenant
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
        </Button>
        {dirty && <span className="text-xs text-stone-500">Modifications non enregistrées</span>}
      </div>

      {/* Journal */}
      {server.recent.length > 0 && (
        <div>
          <MonoLabel>Derniers envois</MonoLabel>
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {server.recent.map((r, i) => (
              <li key={i} className="py-1.5 flex flex-wrap items-center gap-2">
                <Badge tone={r.ok ? 'success' : 'urgent'}>{r.ok ? 'OK' : 'Échec'}</Badge>
                <span className="text-stone-800">{KIND_LABELS[r.kind]} · {r.channel === 'gotify' ? 'Gotify' : 'Email'}</span>
                <span className="text-stone-500 text-xs">{new Date(r.sentAt).toLocaleString('fr-FR')}</span>
                {r.error && <span className="text-wine-700 text-xs w-full">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={preview !== null} onClose={() => setPreview(null)} title="Aperçu de la newsletter" subtitle={preview?.subject} size="lg">
        {preview && <iframe title="Aperçu de la newsletter" sandbox="" srcDoc={preview.html} className="w-full h-[70vh] rounded-md border border-stone-200 bg-white" />}
      </Modal>
    </div>
  );
};
