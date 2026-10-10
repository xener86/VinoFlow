// Fil de discussion avec le sommelier sous un accord (variante C du prototype
// design-protos/wf-sommelier.jsx). La conversation est créée au premier
// message ; chaque tour renvoie le texte, les vins cités et, si le plat a
// changé en cours de route, une reformulation à relancer.

import React, { useEffect, useRef, useState } from 'react';
import { Send, GlassWater } from 'lucide-react';
import { sommelierChat, SommelierChatMessage } from '../services/storageService';
import { AiLoading, WineLink } from './cockpit/primitives';
import { CellarWine } from '../types';

const SUGGESTIONS = [
  'Plutôt un blanc ?',
  "Pour des invités qui n'aiment pas les tanins ?",
  'Lequel ouvrir ce soir, lequel garder ?',
];

interface Props {
  dish: string;
  pairing: any;                       // résultat de /sommelier/pair, envoyé tel quel au premier message
  inventory: CellarWine[];
  conversationId?: string;            // reprise d'une discussion enregistrée
  initialMessages?: SommelierChatMessage[];
  openedCount: Record<string, number>;
  onOpenBottle: (wine: CellarWine) => void;
  onRevise: (dish: string) => void;   // relancer l'accord sur le plat reformulé
  onConversationCreated?: () => void; // première réponse enregistrée (liste des discussions à rafraîchir)
}

const inStockBottles = (wine: CellarWine) => (wine.bottles || []).filter(b => !b.isConsumed);

export const SommelierChat: React.FC<Props> = ({ dish, pairing, inventory, conversationId: initialId, initialMessages, openedCount, onOpenBottle, onRevise, onConversationCreated }) => {
  const [conversationId, setConversationId] = useState<string | undefined>(initialId);
  const [messages, setMessages] = useState<SommelierChatMessage[]>(initialMessages || []);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentOnce = useRef(false);

  useEffect(() => {
    if (sentOnce.current) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, sending]);

  const wineById = (id: string) => inventory.find(w => w.id === id);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    sentOnce.current = true;
    setError(null);
    setSending(true);
    const optimistic: SommelierChatMessage = { id: `tmp-${Date.now()}`, role: 'user', content, wineIds: [], revisedDish: null, createdAt: new Date().toISOString() };
    setMessages(m => [...m, optimistic]);
    setDraft('');
    try {
      const res = await sommelierChat(conversationId
        ? { conversationId, message: content }
        : { dish, pairing, message: content });
      if (!conversationId) onConversationCreated?.();
      setConversationId(res.conversationId);
      setMessages(m => [...m.filter(x => x.id !== optimistic.id), { ...optimistic, id: `u-${res.message.id}` }, res.message]);
    } catch (e: any) {
      // Le message n'a pas été conservé côté serveur : on le remet dans le champ.
      setMessages(m => m.filter(x => x.id !== optimistic.id));
      setDraft(content);
      setError(e?.message || 'Le sommelier n’a pas pu répondre ; réessayez dans un instant.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <section className="pt-4 border-t border-stone-200" aria-label="Discussion avec le sommelier">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div>
          <div className="mono text-[10px] tracking-widest text-wine-700 uppercase">Sommelier · Discussion</div>
          <h4 className="serif text-lg text-stone-900 leading-tight">Discutons-en.</h4>
        </div>
        {conversationId && <span className="mono text-[9px] tracking-widest text-stone-400 uppercase">Enregistrée</span>}
      </div>

      <div className="space-y-3">
        {messages.length === 0 && (
          <Bubble role="assistant">
            <p className="text-sm text-stone-800 leading-relaxed">
              Une question sur ces accords ? Un détail sur la recette, une humeur, vos invités… je m'adapte.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={sending}
                  className="h-9 md:h-7 px-2.5 rounded-full border border-stone-200 bg-white text-xs text-stone-700 hover:bg-stone-50 hover:text-wine-700 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </Bubble>
        )}

        {messages.map(m => (
          <Bubble key={m.id} role={m.role}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
            {m.role === 'assistant' && m.wineIds.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {m.wineIds.map(id => {
                  const wine = wineById(id);
                  if (!wine) return null;
                  const stock = Math.max(0, inStockBottles(wine).length - (openedCount[wine.id] || 0));
                  return (
                    <li key={id} className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white pl-2.5 pr-1 py-1 text-xs">
                      <WineLink id={wine.id} className="serif text-[13px] text-stone-900">
                        {wine.name}{wine.vintage ? ` ${wine.vintage}` : ''}
                      </WineLink>
                      <span className="text-stone-400">· {stock} btl</span>
                      <button
                        type="button"
                        onClick={() => onOpenBottle(wine)}
                        disabled={stock === 0}
                        title={stock === 0 ? 'Plus de bouteille en stock' : 'Ouvrir une bouteille'}
                        aria-label={`Ouvrir ${wine.name}`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded bg-wine-700 hover:bg-wine-800 text-white disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <GlassWater size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {m.role === 'assistant' && m.revisedDish && (
              <button
                type="button"
                onClick={() => onRevise(m.revisedDish!)}
                className="mt-2 h-9 md:h-8 px-3 rounded-md border border-wine-200 bg-wine-50 text-xs text-wine-800 hover:bg-wine-100"
              >
                Relancer l'accord pour « {m.revisedDish} »
              </button>
            )}
          </Bubble>
        ))}

        {sending && <AiLoading label="Le sommelier réfléchit…" hint="Quelques secondes" />}

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => send(draft)} className="shrink-0 h-8 px-3 rounded-md bg-white border border-red-200 text-xs hover:bg-red-100">
              Réessayer
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(draft); }}
        className="mt-3 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={2000}
          disabled={sending}
          placeholder="Répondez, ou posez une autre question… (Entrée pour envoyer)"
          aria-label="Votre message au sommelier"
          className="flex-1 min-w-0 resize-none bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-wine-500 outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Envoyer"
          className="h-11 w-11 shrink-0 rounded-xl bg-wine-600 hover:bg-wine-700 text-white inline-flex items-center justify-center disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </section>
  );
};

const Bubble: React.FC<{ role: 'user' | 'assistant'; children: React.ReactNode }> = ({ role, children }) => (
  role === 'user' ? (
    <div className="flex justify-end">
      <div className="max-w-[85%] md:max-w-[70%] rounded-xl bg-stone-100 border border-stone-200 px-3.5 py-2.5 text-stone-900">{children}</div>
    </div>
  ) : (
    <div className="flex gap-2.5">
      <div aria-hidden className="w-8 h-8 shrink-0 rounded-full bg-wine-700 text-wine-50 serif italic flex items-center justify-center">S</div>
      <div className="flex-1 min-w-0 text-stone-900">{children}</div>
    </div>
  )
);
