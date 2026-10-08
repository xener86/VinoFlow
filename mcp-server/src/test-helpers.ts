// Outils de test : faux backend (fetch simulé) et faux serveur MCP qui capture les outils.
import { vi } from 'vitest';

export interface Call { method: string; path: string; body: unknown }

type Handler = (call: Call) => { status?: number; body?: unknown; text?: string } | undefined;

/** Remplace fetch : chaque appel est enregistré ; `handler` choisit la réponse (200 {} par défaut). */
export const mockBackend = (handler: Handler = () => undefined) => {
    const calls: Call[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
        const u = new URL(String(url));
        const call: Call = {
            method: (init.method || 'GET').toUpperCase(),
            path: u.pathname.replace(/^\/api/, '') + u.search,
            body: init.body ? JSON.parse(String(init.body)) : undefined,
        };
        calls.push(call);
        const r = handler(call) || {};
        const status = r.status ?? 200;
        if (r.text !== undefined) return new Response(r.text, { status });
        if (status === 204) return new Response(null, { status });
        return new Response(JSON.stringify(r.body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { calls, fetchMock };
};

type ToolHandler = (args: any) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

/** Faux McpServer : enregistre les outils pour les appeler directement dans les tests. */
export const fakeServer = () => {
    const tools = new Map<string, { description: string; schema: Record<string, unknown>; handler: ToolHandler }>();
    const server = {
        tool: (name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler) => {
            tools.set(name, { description, schema, handler });
        },
    };
    const call = async (name: string, args: Record<string, unknown> = {}) => {
        const t = tools.get(name);
        if (!t) throw new Error(`outil inconnu : ${name}`);
        const r = await t.handler(args);
        return { text: r.content.map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
    };
    return { server, tools, call };
};
