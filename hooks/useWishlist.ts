import { useState, useEffect, useCallback } from 'react';
import { getWishlist } from '../services/storageService';
import { WishlistItem } from '../types';

export const useWishlist = () => {
    const [items, setItems] = useState<WishlistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWishlist = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getWishlist();
            setItems(Array.isArray(data) ? data : []);
            setError(null);
        } catch (err) {
            console.error("Erreur chargement wishlist:", err);
            setError("Impossible de charger la wishlist.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

    return { items, loading, error, refresh: fetchWishlist };
};
