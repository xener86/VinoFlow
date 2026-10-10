import { randomBytes } from 'node:crypto';

// 256 bits en base64url = 43 caractères, sans '=' de remplissage.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const newShareToken = () => randomBytes(32).toString('base64url');

// Un jeton mal formé est refusé avant toute requête SQL (404 indistinct).
export const isShareToken = (value) => typeof value === 'string' && TOKEN_RE.test(value);
