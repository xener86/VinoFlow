// Cockpit — wishlist : vins repérés (salon, caviste…) à acheter plus tard.

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ShoppingCart, Loader2 } from 'lucide-react';
import { useWishlist } from '../hooks/useWishlist';
import { addWishlistItem, deleteWishlistItem } from '../services/storageService';
import { WishlistItem, WineType } from '../types';
import { useToast, useConfirm } from '../components/cockpit/feedback';
import { Badge, Button, Card, EmptyState, Input, Modal, MonoLabel, Select, Skeleton, Textarea } from '../components/cockpit/primitives';

const wineTypeLabels: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};

const priorityMeta: Record<string, { label: string; tone: 'urgent' | 'warning' | 'neutral'; rank: number }> = {
  HIGH: { label: 'Prioritaire', tone: 'urgent', rank: 0 },
  MEDIUM: { label: 'Normal', tone: 'warning', rank: 1 },
  LOW: { label: 'Optionnel', tone: 'neutral', rank: 2 },
};

const EMPTY_FORM = {
  name: '', producer: '', region: '', appellation: '',
  type: '' as string, vintage: '' as string,
  estimatedPrice: '' as string, priority: 'MEDIUM',
  notes: '', source: '',
};

export const Wishlist: React.FC = () => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const { items, loading, error, refresh } = useWishlist();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (priorityMeta[a.priority || 'MEDIUM'].rank - priorityMeta[b.priority || 'MEDIUM'].rank)),
    [items],
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await addWishlistItem({
        name: form.name.trim(),
        producer: form.producer || undefined,
        region: form.region || undefined,
        appellation: form.appellation || undefined,
        type: (form.type || undefined) as WineType | undefined,
        vintage: form.vintage ? Number(form.vintage) : undefined,
        estimatedPrice: form.estimatedPrice ? Number(form.estimatedPrice) : undefined,
        priority: form.priority as 'HIGH' | 'MEDIUM' | 'LOW',
        notes: form.notes || undefined,
        source: form.source || undefined,
      });
      toast.success(`« ${form.name.trim()} » ajouté à la wishlist`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ? `Ajout impossible : ${err.message}` : 'Ajout impossible');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: WishlistItem) => {
    if (!(await confirmAction({
      title: 'Retirer de la wishlist ?',
      message: <>« {item.name} » sera supprimé de la liste.</>,
      confirmLabel: 'Supprimer',
      danger: true,
    }))) return;
    setDeletingId(item.id);
    try {
      await deleteWishlistItem(item.id);
      toast.success('Retiré de la wishlist');
      refresh();
    } catch (err: any) {
      toast.error(err?.message ? `Suppression impossible : ${err.message}` : 'Suppression impossible');
    } finally {
      setDeletingId(null);
    }
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

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="max-w-3xl mx-auto">
      {/* En-tête */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <MonoLabel>VINOFLOW · ACHATS</MonoLabel>
          <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Wishlist</h1>
          <div className="text-[12px] text-stone-500 mt-0.5">
            {loading ? 'Chargement…' : `${items.length} vin${items.length > 1 ? 's' : ''} repéré${items.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <Button onClick={() => setShowForm(true)} className="shrink-0">
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error && items.length === 0 ? (
        <Card>
          <EmptyState
            title="Impossible de charger la wishlist"
            action={<Button variant="outline" onClick={refresh}>Réessayer</Button>}
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Votre wishlist est vide"
            hint="Notez les vins repérés en salon, chez le caviste…"
            action={<Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Ajouter un vin</Button>}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {sorted.map((item) => {
            const prio = priorityMeta[item.priority || 'MEDIUM'] || priorityMeta.MEDIUM;
            const meta = [item.producer, item.vintage, item.appellation || item.region].filter(Boolean);
            return (
              <li key={item.id}>
                <Card className="p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge tone={prio.tone} className="uppercase tracking-widest">{prio.label}</Badge>
                        {item.type && <Badge tone="neutral" className="uppercase tracking-widest">{wineTypeLabels[item.type] || item.type}</Badge>}
                        {item.source && <span className="mono text-[10px] tracking-widest uppercase text-stone-400 truncate">· {item.source}</span>}
                      </div>
                      <h2 className="serif text-lg text-stone-900 leading-tight mt-1.5 break-words">{item.name}</h2>
                      {meta.length > 0 && (
                        <div className="text-[12.5px] text-stone-500 mt-0.5">{meta.join(' · ')}</div>
                      )}
                      {item.notes && (
                        <p className="serif-it text-[13px] text-stone-600 mt-2 border-l-2 border-stone-200 pl-2.5 whitespace-pre-line">{item.notes}</p>
                      )}
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                      {item.estimatedPrice != null && item.estimatedPrice > 0 && (
                        <span className="mono text-sm text-stone-800 tabular-nums mr-auto sm:mr-0">~{item.estimatedPrice} €</span>
                      )}
                      <Button size="sm" onClick={() => handleBuy(item)}>
                        <ShoppingCart className="w-3.5 h-3.5" /> Acheter
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        aria-label={`Retirer ${item.name} de la wishlist`}
                        className="text-stone-400 hover:text-wine-700"
                      >
                        {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Formulaire d'ajout */}
      <Modal
        open={showForm}
        onClose={() => { if (!saving) setShowForm(false); }}
        title="Ajouter à la wishlist"
        subtitle="Un vin repéré, à acheter plus tard"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Annuler</Button>
            <Button type="submit" form="wishlist-form" disabled={!form.name.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Ajouter
            </Button>
          </>
        }
      >
        <form id="wishlist-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            wrapperClassName="sm:col-span-2"
            label="Nom du vin *"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
            required
          />
          <Input label="Producteur" value={form.producer} onChange={(e) => set('producer', e.target.value)} />
          <Input label="Millésime" type="number" inputMode="numeric" value={form.vintage} onChange={(e) => set('vintage', e.target.value)} />
          <Input label="Région" value={form.region} onChange={(e) => set('region', e.target.value)} />
          <Input label="Appellation" value={form.appellation} onChange={(e) => set('appellation', e.target.value)} />
          <Select label="Couleur" value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">—</option>
            {Object.entries(wineTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select label="Priorité" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="HIGH">Prioritaire</option>
            <option value="MEDIUM">Normal</option>
            <option value="LOW">Optionnel</option>
          </Select>
          <Input label="Prix estimé (€)" type="number" inputMode="decimal" step="0.5" value={form.estimatedPrice} onChange={(e) => set('estimatedPrice', e.target.value)} />
          <Input label="Source" placeholder="Salon, caviste…" value={form.source} onChange={(e) => set('source', e.target.value)} />
          <Textarea
            wrapperClassName="sm:col-span-2"
            label="Notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="resize-none"
          />
        </form>
      </Modal>
    </div>
  );
};
