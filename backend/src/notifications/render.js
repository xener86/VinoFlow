// Mise en forme des messages. Email : gabarit Cockpit (tableaux, styles en ligne,
// identité de l'app — voir docs/superpowers/specs/newsletter-exemple.html).
// Gotify : markdown court. Tout texte venu de la base est échappé.
import { wineLabel, stateLabel, euros } from './format.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Neutralise la syntaxe markdown (noms de vins).
const md = (s) => String(s ?? '').replace(/([\\`*_[\]()#<>!|])/g, '\\$1');
const truncate = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

const F = {
  serif: "'Playfair Display',Georgia,serif",
  sans: 'Outfit,Helvetica,Arial,sans-serif',
  mono: "'JetBrains Mono',Courier,monospace",
};
const C = {
  cream: '#fcfaf6', line: '#e7e5e4', rule: '#f5f5f4', wine: '#7f1d1d', ink: '#1c1917', body: '#44403c',
  soft: '#57534e', muted: '#78716c', faint: '#a8a29e', creamCard: '#f5f0e6', creamLine: '#ebe2cf', green: '#15803d',
};
const BADGE = {
  passe: 'background:#7f1d1d;color:#ffffff',
  bientot: 'background:#fef3c7;color:#92400e',
  neutre: 'background:#f5f5f4;color:#57534e',
};

const mono = (text, color = C.muted, size = 10) =>
  `<div style="font-family:${F.mono};font-size:${size}px;letter-spacing:1.5px;color:${color};">${esc(text)}</div>`;
const wineLink = (label, url, size = 15) =>
  `<a href="${esc(url)}" style="font-family:${F.serif};font-style:italic;font-size:${size}px;color:${C.ink};text-decoration:none;">${esc(label)}</a>`;
const badge = ({ text, tone }) =>
  `<span style="font-family:${F.mono};font-size:10px;${BADGE[tone] || BADGE.neutre};padding:2px 6px;border-radius:3px;">${esc(text)}</span>`;
const card = (inner, { cream = false } = {}) => `<tr><td class="pad" style="padding:12px 28px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cream ? C.creamCard : '#ffffff'};border:1px solid ${cream ? C.creamLine : C.line};border-radius:6px;">
<tr><td style="padding:14px 16px;">${inner}</td></tr></table></td></tr>`;
const cardTitle = (text) =>
  `<div style="font-family:${F.serif};font-style:italic;font-size:19px;color:${C.ink};margin-top:6px;">${esc(text)}</div>`;

export const cockpitShell = ({ title, preheader = '', label, body, appUrl }) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>@media (max-width: 620px) { .kpi { display:block !important; width:100% !important; box-sizing:border-box; margin-bottom:8px; } .pad { padding-left:20px !important; padding-right:20px !important; } .hide-sm { display:none !important; } }</style>
</head><body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;color:${C.cream};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td class="pad" style="padding:0 28px 18px;border-bottom:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${F.serif};font-style:italic;font-size:26px;color:${C.ink};line-height:1;">VinoFlow
<div style="font-family:${F.mono};font-style:normal;font-size:9px;letter-spacing:2px;color:${C.faint};margin-top:4px;">CELLAR.OS</div></td>
<td align="right" style="font-family:${F.mono};font-size:10px;letter-spacing:1.5px;color:${C.muted};"><span style="color:${C.wine};">●</span> ${esc(label)}</td>
</tr></table></td></tr>
${body}
<tr><td class="pad" align="center" style="padding:24px 28px 8px;"><a href="${esc(appUrl)}" style="display:inline-block;background:${C.wine};color:#ffffff;text-decoration:none;font-family:${F.sans};font-size:14px;font-weight:500;padding:12px 22px;border-radius:6px;">Ouvrir la cave&nbsp;→</a></td></tr>
<tr><td class="pad" style="padding:22px 28px 0;">
<p style="margin:0;font-family:${F.serif};font-style:italic;font-size:13px;line-height:1.5;color:${C.muted};">« Le vin est la plus saine et la plus hygiénique des boissons. » — Louis Pasteur</p>
<p style="margin:14px 0 0;font-family:${F.mono};font-size:10px;letter-spacing:1px;color:${C.faint};line-height:1.6;">FRÉQUENCE ET CANAUX : RÉGLAGES › NOTIFICATIONS<br>VINOFLOW · CAVE DU FOYER</p>
</td></tr></table></td></tr></table></body></html>`;

const kpi = (labelText, value, sub, { serif = false, color = C.ink } = {}) => `<td class="kpi" width="25%" style="padding:0 4px;">
<div style="background:#ffffff;border:1px solid ${C.line};border-radius:6px;padding:12px 14px;">
${mono(labelText, C.muted, 9)}
<div style="font-family:${serif ? F.serif : F.sans};font-size:26px;font-weight:${serif ? 400 : 500};color:${color};margin-top:6px;line-height:1;">${esc(value)}</div>
<div style="font-family:${F.sans};font-size:11px;color:${C.muted};margin-top:4px;">${esc(sub)}</div></div></td>`;

const statsBlock = (s) => `<tr><td class="pad" style="padding:20px 28px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${kpi('BOUTEILLES', String(s.bottlesInCellar), 'en cave')}
${kpi('ENTRÉES', `+${s.bottlesIn}`, `${euros(s.spent)} dépensés`, { serif: true, color: C.green })}
${kpi('SORTIES', `−${s.bottlesOut}`, s.gifts ? `dont ${s.gifts} offerte(s)` : 'bues', { serif: true, color: C.wine })}
${kpi('VALEUR D’ACHAT', euros(s.cellarValue), `${s.winesInCellar} vins`)}
</tr></table></td></tr>`;

const urgentBlock = (rows) => {
  const cell = 'padding:9px 0;border-bottom:1px solid #f5f5f4;';
  const lines = rows.map((r) => `<tr>
<td style="${cell}">${wineLink(r.label, r.url)}<br><span style="font-size:11px;color:${C.muted};">${esc(r.sub)}</span></td>
<td class="hide-sm" style="${cell}font-size:12px;color:${C.muted};">${esc(r.location || '')}</td>
<td align="center" style="${cell}">${esc(r.qty)}</td>
<td align="right" style="${cell}">${badge(r.badge)}</td></tr>`).join('\n');
  const head = 'padding:6px 0;border-bottom:1px solid #f5f5f4;';
  return card(`${mono(`● ${rows.length} URGENT${rows.length > 1 ? 'S' : ''} · EN FIN DE FENÊTRE`, C.wine)}
${cardTitle('Avant qu’ils ne passent leur pic')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-family:${F.sans};font-size:13px;color:${C.body};">
<tr style="font-family:${F.mono};font-size:9px;letter-spacing:1.5px;color:${C.faint};"><td style="${head}">VIN</td><td class="hide-sm" style="${head}">EMPLACEMENT</td><td align="center" style="${head}">QTÉ</td><td align="right" style="${head}">FENÊTRE</td></tr>
${lines}</table>`);
};

const readyBlock = (rows, year) => card(`${mono(`● ENTRÉS EN APOGÉE · ${year}`, C.green)}
${cardTitle('Enfin prêts')}
<div style="margin-top:6px;font-family:${F.sans};font-size:13px;color:${C.body};line-height:1.7;">
${rows.map((r) => `${wineLink(r.label, r.url)} <span style="color:${C.muted};font-size:12px;">· ${esc(r.sub)}</span>`).join('<br>\n')}</div>`);

const noteBlock = (note, appUrl) => card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td>${mono('◌ SOMMELIER · LE MOT DU MOIS', C.wine)}</td><td align="right">${mono('RÉDIGÉ PAR L’IA', C.faint, 9)}</td></tr></table>
<p style="margin:12px 0 0;font-family:${F.serif};font-style:italic;font-size:17px;line-height:1.55;color:${C.ink};">« ${esc(note.intro)} »</p>
${note.picks.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;font-family:${F.sans};font-size:13px;color:${C.body};line-height:1.55;">
${note.picks.map((p, i) => `<tr><td width="22" valign="top" style="font-family:${F.mono};font-size:11px;color:${C.wine};padding:4px 0;">${String(i + 1).padStart(2, '0')}</td>
<td style="padding:4px 0;">${wineLink(wineLabel(p.wine), `${appUrl}/wine/${p.wine.id}`)} — ${esc(p.reason)}</td></tr>`).join('\n')}</table>` : ''}
${note.seasonalPairing ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid ${C.creamLine};font-family:${F.sans};font-size:13px;color:${C.soft};line-height:1.55;">${mono('ACCORD DE SAISON', C.muted, 9)}${esc(note.seasonalPairing)}</div>` : ''}
${note.closing ? `<p style="margin:12px 0 0;font-family:${F.sans};font-size:13px;color:${C.soft};">${esc(note.closing)}</p>` : ''}`, { cream: true });

const tastingsBlock = (rows) => card(`${mono('◌ JOURNAL · DÉGUSTATIONS DU MOIS')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-family:${F.sans};font-size:13px;color:${C.body};">
${rows.map((r) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f5f5f4;">${wineLink(r.label, r.url)} <span style="color:${C.muted};font-size:12px;">${esc(r.sub)}</span></td>
<td align="right" style="padding:6px 0;border-bottom:1px solid #f5f5f4;font-family:${F.mono};font-size:12px;color:${C.ink};">${esc(r.rating || '')}</td></tr>`).join('\n')}</table>`);

// Rubriques MenuFlow (tâche 15) : no-op tant que nl.menuflow est nul.
export const menuflowBlocks = (mf) => {
  if (!mf) return '';
  const out = [];
  if (mf.accords.length) {
    out.push(card(`${mono('◌ MENUFLOW · VOS ACCORDS DU MOIS', C.wine)}
${cardTitle('Ce qui a accompagné vos dîners')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-family:${F.sans};font-size:13px;color:${C.body};">
${mf.accords.map((a) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f5f5f4;"><span style="font-family:${F.mono};font-size:11px;color:${C.muted};">${esc(a.date)}</span> ${esc(a.dish)} × ${wineLink(a.wine, a.url)}
${a.verdict || a.rating ? `<br><span style="font-size:11px;color:${C.muted};">${esc([a.verdict, a.rating].filter(Boolean).join(' · '))}</span>` : ''}</td></tr>`).join('\n')}</table>`));
  }
  if (mf.couldHave.length) {
    out.push(card(`${mono('◌ MENUFLOW · VOUS AURIEZ PU…', C.wine)}
${mf.couldHave.map((c) => `<p style="margin:10px 0 0;font-family:${F.serif};font-style:italic;font-size:15px;line-height:1.5;color:${C.ink};">Le ${esc(c.date)}, avec ${esc(c.dish)} : ${wineLink(c.wine, c.url)}</p>
${c.reason ? `<p style="margin:2px 0 0;font-family:${F.sans};font-size:12px;color:${C.soft};">${esc(c.reason)}</p>` : ''}`).join('\n')}`, { cream: true }));
  }
  if (mf.forgotten.length) {
    out.push(`<tr><td class="pad" style="padding:12px 28px 4px;">${mono('◌ D’AILLEURS…', C.muted, 9)}
${mf.forgotten.map((f) => `<p style="margin:6px 0 0;font-family:${F.sans};font-size:13px;color:${C.soft};">Vous n’avez pas noté le ${wineLink(f.wine, f.url, 13)} du ${esc(f.date)} (${esc(f.dish)}).</p>`).join('\n')}</td></tr>`);
  }
  return out.join('\n');
};

export const renderNewsletterEmail = (nl) => {
  const year = nl.periodLabel.match(/\d{4}/)?.[0] ?? '';
  const body = [
    `<tr><td class="pad" style="padding:28px 28px 8px;">
${mono(`◌ VINOFLOW · ${nl.periodLabel.toUpperCase()}`)}
<h1 style="margin:10px 0 6px;font-family:${F.serif};font-weight:400;font-size:34px;line-height:1.15;color:${C.ink};">${esc(nl.heading.lead)} <em style="color:${C.wine};">${esc(nl.heading.accent)}</em>&nbsp;?</h1>
<p style="margin:0;font-family:${F.sans};font-size:14px;line-height:1.6;color:${C.soft};">${esc(nl.intro)}</p></td></tr>`,
    statsBlock(nl.stats),
    nl.urgent.length ? urgentBlock(nl.urgent) : '',
    nl.ready.length ? readyBlock(nl.ready, year) : '',
    menuflowBlocks(nl.menuflow),
    nl.note ? noteBlock(nl.note, nl.appUrl) : '',
    nl.tastings.length ? tastingsBlock(nl.tastings) : '',
  ].join('\n');
  const preheader = [
    nl.urgent.length ? `${nl.urgent.length} vin(s) à ouvrir en priorité` : null,
    nl.ready.length ? `${nl.ready.length} entré(s) en apogée` : null,
    nl.note ? 'le mot du sommelier' : null,
  ].filter(Boolean).join(', ');
  return cockpitShell({ title: nl.subject, preheader, label: 'NEWSLETTER', body, appUrl: nl.appUrl });
};

const statsLine = (s) =>
  `${s.bottlesInCellar} bouteilles · +${s.bottlesIn} entrées · −${s.bottlesOut} sorties · ${euros(s.cellarValue)} (valeur d’achat)`;

export const renderNewsletter = (nl) => {
  const mf = nl.menuflow;
  const text = [
    nl.title, '', nl.intro, '', statsLine(nl.stats), '',
    ...(nl.urgent.length ? ['À ouvrir en priorité', ...nl.urgent.map((r) => `- ${r.label} (${r.sub}) — ${r.badge.text} : ${r.url}`), ''] : []),
    ...(nl.ready.length ? ['Enfin prêts', ...nl.ready.map((r) => `- ${r.label} — ${r.sub} : ${r.url}`), ''] : []),
    ...(mf?.accords.length ? ['Vos accords du mois', ...mf.accords.map((a) => `- ${a.date} · ${a.dish} × ${a.wine}`), ''] : []),
    ...(mf?.couldHave.length ? ['Vous auriez pu…', ...mf.couldHave.map((c) => `- Le ${c.date}, avec ${c.dish} : ${c.wine}`), ''] : []),
    ...(mf?.forgotten.length ? ['D’ailleurs…', ...mf.forgotten.map((f) => `- Vous n’avez pas noté le ${f.wine} du ${f.date} (${f.dish}) : ${f.url}`), ''] : []),
    ...(nl.note ? ['Le mot du sommelier', nl.note.intro, ...nl.note.picks.map((p) => `- ${wineLabel(p.wine)} — ${p.reason}`), ''] : []),
    ...(nl.tastings.length ? ['Dégustations', ...nl.tastings.map((r) => `- ${r.label} ${r.sub}${r.rating ? ` — ${r.rating}` : ''}`), ''] : []),
    nl.appUrl,
  ].join('\n');
  const markdown = [
    `**Bilan** : ${md(statsLine(nl.stats))}`,
    nl.urgent.length ? `**À ouvrir en priorité**\n${nl.urgent.slice(0, 5).map((r) => `- [${md(r.label)}](${r.url}) — ${md(r.badge.text)}`).join('\n')}` : null,
    mf ? `**MenuFlow** : ${mf.accords.length} accord(s) · ${mf.forgotten.length} dégustation(s) à noter` : null,
    nl.note ? `**Le mot du sommelier**\n${md(truncate(nl.note.intro, 600))}` : null,
    `[Ouvrir la cave](${nl.appUrl})`,
  ].filter(Boolean).join('\n\n');
  return { title: nl.title, markdown, priority: 4, subject: nl.subject, text, html: renderNewsletterEmail(nl) };
};

const GROUPS = [
  { state: 'DEPASSEE', title: 'Apogée dépassée', color: C.wine },
  { state: 'SE_REFERME', title: 'Fenêtre qui se referme', color: '#92400e' },
  { state: 'PRET', title: 'Entrés en apogée', color: C.green },
];

export const renderAlert = (transitions, { appUrl }) => {
  const n = transitions.length;
  const title = n === 1 ? '1 vin change d’état' : `${n} vins changent d’état`;
  const groups = GROUPS
    .map((g) => ({ ...g, items: transitions.filter((t) => t.to === g.state) }))
    .filter((g) => g.items.length > 0);
  const lineOf = (t) => ({ label: wineLabel(t.wine), detail: `${stateLabel(t)} · ${t.wine.inventoryCount} bt`, url: `${appUrl}/wine/${t.wine.id}` });
  const markdown = groups
    .map((g) => `**${g.title}**\n${g.items.map(lineOf).map((l) => `- [${md(l.label)}](${l.url}) — ${md(l.detail)}`).join('\n')}`)
    .join('\n\n');
  const text = groups
    .map((g) => `${g.title}\n${g.items.map(lineOf).map((l) => `- ${l.label} — ${l.detail} : ${l.url}`).join('\n')}`)
    .join('\n\n');
  const body = `<tr><td class="pad" style="padding:28px 28px 8px;">${mono('◌ VINOFLOW · ALERTE')}
<h1 style="margin:10px 0 0;font-family:${F.serif};font-weight:400;font-size:28px;line-height:1.2;color:${C.ink};">${esc(title)}</h1></td></tr>
${groups.map((g) => card(`${mono(`● ${g.title.toUpperCase()}`, g.color)}
<div style="margin-top:8px;font-family:${F.sans};font-size:13px;color:${C.body};line-height:1.8;">
${g.items.map(lineOf).map((l) => `${wineLink(l.label, l.url)} <span style="color:${C.muted};font-size:12px;">· ${esc(l.detail)}</span>`).join('<br>\n')}</div>`)).join('\n')}`;
  return {
    title,
    markdown,
    priority: transitions.some((t) => t.to === 'DEPASSEE') ? 5 : 4,
    subject: `VinoFlow — ${title}`,
    text,
    html: cockpitShell({ title: `VinoFlow — ${title}`, preheader: title, label: 'ALERTE', body, appUrl }),
  };
};

export const testMessage = ({ appUrl }) => {
  const title = 'VinoFlow — test de notification';
  const message = 'Si vous lisez ceci, les notifications VinoFlow arrivent bien sur ce canal.';
  const body = `<tr><td class="pad" style="padding:28px 28px 8px;">${mono('◌ VINOFLOW · TEST')}
<p style="margin:10px 0 0;font-family:${F.sans};font-size:14px;line-height:1.6;color:${C.soft};">${esc(message)}</p></td></tr>`;
  return {
    title, markdown: message, priority: 4, subject: title, text: message,
    html: cockpitShell({ title, preheader: message, label: 'TEST', body, appUrl }),
  };
};
