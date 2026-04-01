import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWishlist } from '../hooks/useWishlist';
import { addWishlistItem, deleteWishlistItem } from '../services/storageService';
import { WishlistItem, WineType } from '../types';
import { Heart, Plus, Trash2, ShoppingCart, X, Loader2, Wine as WineIcon } from 'lucide-react';

const wineTypeLabels: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié'
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  HIGH: { label: 'Prioritaire', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  MEDIUM: { label: 'Normal', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  LOW: { label: 'Optionnel', color: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400' }
};

export const Wishlist: React.FC = () => {
  const navigate = useNavigate();
  const { items, loading, refresh } = useWishlist();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '', producer: '', region: '', appellation: '',
    type: '' as string, vintage: '' as string,
    estimatedPrice: '' as string, priority: 'MEDIUM',
    notes: '', source: ''
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await addWishlistItem({
      name: form.name,
      producer: form.producer || undefined,
      region: form.region || undefined,
      appellation: form.appellation || undefined,
      type: (form.type || undefined) as WineType | undefined,
      vintage: form.vintage ? Number(form.vintage) : undefined,
      estimatedPrice: form.estimatedPrice ? Number(form.estimatedPrice) : undefined,
      priority: form.priority as 'HIGH' | 'MEDIUM' | 'LOW',
      notes: form.notes || undefined,
      source: form.source || undefined
    });
    setForm({ name: '', producer: '', region: '', appellation: '', type: '', vintage: '', estimatedPrice: '', priority: 'MEDIUM', notes: '', source: '' });
    setShowForm(false);
    setSaving(false);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer de la wishlist ?')) return;
    await deleteWishlistItem(id);
    refresh();
  };

  const handleBuy = (item: WishlistItem) => {
    const params = new URLSearchParams();
    params.set('prefill', 'true');
    params.set('name', item.name);
    if (item.vintage) params.set('vintage', String(item.vintage));
    if (item.producer) params.set('producer', item.producer);
    if (item.type) params.set('type', item.type);
    navigate(`/add-wine?${params.toString()}`);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-wine-600" size={48} />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif text-stone-800 dark:text-white flex items-center gap-3">
          <Heart size={28} className="text-wine-600" /> Wishlist
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-wine-600 hover:bg-wine-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-wine-900/20 transition-colors"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Fermer' : 'Ajouter'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 space-y-4 shadow-sm animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text" placeholder="Nom du vin *" value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              className="col-span-2 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-600"
            />
            <input
              type="text" placeholder="Producteur" value={form.producer}
              onChange={(e) => setForm({...form, producer: e.target.value})}
              className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none"
            />
            <input
              type="text" placeholder="Région" value={form.region}
              onChange={(e) => setForm({...form, region: e.target.value})}
              className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none"
            />
            <input
              type="text" placeholder="Appellation" value={form.appellation}
              onChange={(e) => setForm({...form, appellation: e.target.value})}
              className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none"
            />
            <select
              value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}
              className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-700 dark:text-stone-300 outline-none"
            >
              <option value="">Type (optionnel)</option>
              {Object.entries(wineTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input
              type="number" placeholder="Millésime" value={form.vintage}
              onChange={(e) => setForm({...form, vintage: e.target.value})}
              className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none"
            />
            <input
              type="number" placeholder="Prix estimé (€)" step="0.5" value={form.estimatedPrice}
              onChange={(e) => setForm({...form, estimatedPrice: e.target.value})}
              className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none"
            />
            <select
              value={form.priority} onChange={(e) => setForm({...form, priority: e.target.value})}
              className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-700 dark:text-stone-300 outline-none"
            >
              <option value="HIGH">Prioritaire</option>
              <option value="MEDIUM">Normal</option>
              <option value="LOW">Optionnel</option>
            </select>
            <input
              type="text" placeholder="Source (salon, caviste...)" value={form.source}
              onChange={(e) => setForm({...form, source: e.target.value})}
              className="col-span-2 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none"
            />
            <textarea
              placeholder="Notes" value={form.notes} rows={2}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              className="col-span-2 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white outline-none resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || saving}
            className="w-full bg-wine-600 hover:bg-wine-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 shadow-lg shadow-wine-900/20 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Ajouter à la wishlist
          </button>
        </div>
      )}

      {/* Wishlist Items */}
      <div className="space-y-4">
        {items.map(item => {
          const prio = priorityLabels[item.priority || 'MEDIUM'];
          return (
            <div key={item.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase ${prio.color}`}>{prio.label}</span>
                    {item.type && (
                      <span className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        {wineTypeLabels[item.type] || item.type}
                      </span>
                    )}
                    {item.source && (
                      <span className="text-[10px] text-stone-400 dark:text-stone-600 italic">{item.source}</span>
                    )}
                  </div>
                  <h3 className="text-lg font-serif text-stone-800 dark:text-stone-100 truncate">{item.name}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400 mt-1">
                    {item.producer && <span>{item.producer}</span>}
                    {item.vintage && <span>{item.vintage}</span>}
                    {item.region && <span>{item.region}</span>}
                    {item.appellation && <span className="italic">{item.appellation}</span>}
                    {item.estimatedPrice && <span className="text-amber-600 dark:text-amber-400 font-medium">~{item.estimatedPrice}{'\u20AC'}</span>}
                  </div>
                  {item.notes && <p className="text-xs text-stone-500 dark:text-stone-500 mt-2 italic border-l-2 border-stone-200 dark:border-stone-800 pl-2">{item.notes}</p>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleBuy(item)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <ShoppingCart size={12} /> Acheter
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-stone-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="text-center py-20 text-stone-500 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col items-center gap-3">
            <Heart size={40} className="opacity-30" />
            <p className="text-sm">Votre wishlist est vide.</p>
            <p className="text-xs text-stone-400">Notez les vins repérés en salon, chez le caviste...</p>
          </div>
        )}
      </div>
    </div>
  );
};
