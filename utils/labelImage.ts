import type { OcrResult } from '../types';

// Photo d'étiquette : réduite pour l'OCR (route JSON limitée à 1 Mo).
export const MAX_LABEL_BASE64 = 700_000;
export const LABEL_QUALITIES = [0.85, 0.7, 0.55];
const MAX_SIDE = 1600;

/** Première qualité JPEG dont l'encodage tient sous la limite (sinon la plus basse). */
export const chooseEncoding = (encode: (quality: number) => string, max = MAX_LABEL_BASE64): string => {
  let out = '';
  for (const quality of LABEL_QUALITIES) {
    out = encode(quality);
    if (out.length <= max) return out;
  }
  return out;
};

export interface LabelImage { base64: string; mimeType: string; preview: string }

/** Réduit la photo (≤ 1600 px, JPEG, ≤ ~700 Ko en base64). */
export const loadLabelImage = (file: File): Promise<LabelImage> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const raw = () => resolve({ base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg', preview: dataUrl });
      const img = new Image();
      img.onerror = raw;
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return raw();
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = chooseEncoding(quality => canvas.toDataURL('image/jpeg', quality));
        resolve({ base64: out.split(',')[1], mimeType: 'image/jpeg', preview: out });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

/** Texte libre attendu par la page d'ajout (« Pommard 1er Cru Rugiens 2018 »). */
export const ocrToAddText = (r: OcrResult) => {
  const parts = [r.producer, r.appellation && r.appellation !== r.name ? r.appellation : null, r.name, r.cuvee && r.cuvee !== r.name ? r.cuvee : null, r.vintage];
  const seen = new Set<string>();
  return parts.filter(p => {
    if (p == null || p === '') return false;
    const k = String(p).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(' ');
};
