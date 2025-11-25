import React, { useState, useRef, useEffect } from 'react';
import { getAiProvider } from '../services/geminiService';
import { getWines, getInventory } from '../services/storageService';
import { Sparkles, Send, Loader2, Wine, Utensils, Calendar, HelpCircle, ChevronRight } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  { icon: Wine, text: "Quoi boire ce soir ?", prompt: "Que me conseilles-tu de boire ce soir parmi ma cave ?" },
  { icon: Utensils, text: "Accord pour un plat", prompt: "J'ai prévu de cuisiner un risotto aux champignons. Quel vin de ma cave irait bien ?" },
  { icon: Calendar, text: "Vins à boire bientôt", prompt: "Quels vins de ma cave devraient être bus prochainement ?" },
  { icon: HelpCircle, text: "Conseil d'achat", prompt: "Quels types de vins manquent dans ma cave pour l'équilibrer ?" },
];

export const Sommelier: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildContext = () => {
    const wines = getWines();
    const inventory = getInventory();
    
    const wineList = wines.map(w => {
      const count = inventory.filter(b => b.wineId === w.id).length;
      return `- ${w.name} ${w.vintage} (${w.region}, ${w.type}) x${count}`;
    }).join('\n');

    return `Tu es un sommelier expert et sympathique. L'utilisateur possède la cave suivante:

${wineList || "Cave vide"}

Réponds de manière concise et personnalisée. Utilise les vins de sa cave quand c'est pertinent.`;
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const provider = getAiProvider();
      if (!provider) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Je n'ai pas accès à l'IA. Veuillez configurer une clé API dans les paramètres." 
        }]);
        return;
      }

      const context = buildContext();
      const history = messages.map(m => `${m.role === 'user' ? 'Utilisateur' : 'Sommelier'}: ${m.content}`).join('\n');
      
      const prompt = `${context}

${history}
Utilisateur: ${text}
Sommelier:`;

      const response = await provider.generate(prompt);
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      console.error('Sommelier error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Désolé, une erreur s'est produite. Réessayez." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-wine-500 to-wine-700 rounded-full flex items-center justify-center text-white shadow-lg shadow-wine-500/30">
          <Sparkles size={24} />
        </div>
        <div>
          <h2 className="text-xl font-serif text-stone-900 dark:text-white">Sommelier IA</h2>
          <p className="text-xs text-stone-500">Votre conseiller personnel</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Wine size={48} className="text-stone-300 dark:text-stone-700 mb-4" />
            <p className="text-stone-500 dark:text-stone-400 text-center mb-6">
              Posez-moi une question sur votre cave
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
              {QUICK_PROMPTS.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(qp.prompt)}
                  className="flex items-center gap-2 p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-left hover:border-wine-500 transition-all text-sm"
                >
                  <qp.icon size={16} className="text-wine-500" />
                  <span className="text-stone-600 dark:text-stone-300">{qp.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-wine-600 text-white rounded-br-sm'
                    : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-bl-sm shadow-sm'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 rounded-2xl rounded-bl-sm shadow-sm">
              <div className="flex items-center gap-2 text-stone-500">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Le sommelier réfléchit...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Posez votre question..."
          disabled={isLoading}
          className="flex-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="bg-wine-600 hover:bg-wine-700 disabled:bg-stone-300 dark:disabled:bg-stone-700 text-white p-3 rounded-xl transition-all"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};
