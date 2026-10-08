// Accord du soir (passerelle MenuFlow) et aperçu de la newsletter.
import { apiRequest } from '../vinoflow-client.js';
import { Server, json, label, safe, text } from './shared.js';

interface TonightWine { wineId: string; wine: string; vintage: number | null; reason?: string | null; location?: string | null }
type Tonight =
    | { configured: false }
    | { configured: true; dinner: { date: string; title: string } | null; suggested: TonightWine | null; opened: TonightWine[] };

const render = (t: Tonight) => {
    if (!t.configured) return 'MenuFlow is not connected to this VinoFlow server (MENUFLOW_URL / MENUFLOW_TOKEN).';
    if (!t.dinner) return 'No dinner planned in MenuFlow tonight.';
    const lines = [`**Tonight**: ${t.dinner.title}`];
    if (t.opened.length) lines.push(`Opened: ${t.opened.map(label).join(', ')}`);
    else if (t.suggested) {
        lines.push(`Suggested: **${label(t.suggested)}**${t.suggested.location ? ` (${t.suggested.location})` : ''} | wine ID: ${t.suggested.wineId}`);
        if (t.suggested.reason) lines.push(t.suggested.reason);
    } else lines.push('No wine suggested yet for this dish.');
    return lines.join('\n');
};

export const registerMenuflow = (server: Server) => {
    server.tool('get_tonight_pairing', 'Tonight’s dinner planned in MenuFlow and the wine suggested from the cellar', {}, safe(async () => (
        text(render(await apiRequest<Tonight>('GET', '/menuflow/tonight')))
    )));

    server.tool('suggest_another_tonight', 'Ask the sommelier for another wine for tonight’s dinner (excludes the previous suggestion)', {}, safe(async () => (
        text(render(await apiRequest<Tonight>('POST', '/menuflow/tonight/resuggest', {})))
    )));

    server.tool('get_menuflow_status', 'State of the link with MenuFlow: connected, last sync, last error', {}, safe(async () => (
        text(json(await apiRequest('GET', '/menuflow/status')))
    )));

    server.tool('preview_newsletter', 'Preview the cellar newsletter for the current period (markdown, nothing is sent, no AI)', {}, safe(async () => {
        const r = await apiRequest<{ subject: string; markdown: string }>('GET', '/notifications/newsletter/preview');
        return text(`**${r.subject}**\n\n${r.markdown}`);
    }));
};
