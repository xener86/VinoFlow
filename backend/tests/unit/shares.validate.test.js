import { describe, it, expect } from 'vitest';
import { newShareToken, isShareToken } from '../../src/shares/token.js';
import { ShareError, isUuid, validateDinner } from '../../src/shares/validate.js';

const WINE = '11111111-2222-4333-8444-555555555555';
const err = (body) => { try { validateDinner(body); } catch (e) { return e; } return null; };

describe('jeton de partage', () => {
  it('43 caractères base64url, unique', () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isShareToken(a)).toBe(true);
  });
  it('refuse les jetons tronqués, trop longs ou étrangers', () => {
    expect(isShareToken(newShareToken().slice(0, 42))).toBe(false);
    expect(isShareToken(`${newShareToken()}A`)).toBe(false);
    expect(isShareToken('abc/def+ghi=')).toBe(false);
    expect(isShareToken(undefined)).toBe(false);
  });
});

describe('validateDinner', () => {
  it('normalise titre, date, plats', () => {
    expect(validateDinner({ title: '  Dîner du 11  ', date: '2026-10-11', items: [{ wineId: WINE, dish: ' Gigot ' }, { wineId: WINE }] }))
      .toEqual({ title: 'Dîner du 11', date: '2026-10-11', items: [{ wineId: WINE, dish: 'Gigot' }, { wineId: WINE, dish: null }] });
    expect(validateDinner({ title: 'x', date: '', items: [{ wineId: WINE }] }).date).toBeNull();
  });
  it('titre vide ou trop long → 400', () => {
    expect(err({ title: '  ', items: [{ wineId: WINE }] })).toMatchObject({ status: 400, message: 'Donne un titre à la carte.' });
    expect(err({ title: 'a'.repeat(121), items: [{ wineId: WINE }] })).toMatchObject({ status: 400 });
    expect(err({ title: 'a'.repeat(120), items: [{ wineId: WINE }] })).toBeNull();
  });
  it('0 ou 21 vins → 400', () => {
    expect(err({ title: 'x', items: [] })).toMatchObject({ status: 400, message: 'Ajoute au moins un vin à la carte.' });
    expect(err({ title: 'x' })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', items: Array.from({ length: 21 }, () => ({ wineId: WINE })) })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', items: Array.from({ length: 20 }, () => ({ wineId: WINE })) })).toBeNull();
  });
  it('vin invalide, plat trop long → 400', () => {
    expect(err({ title: 'x', items: [{ wineId: 'pas-un-uuid' }] })).toMatchObject({ status: 400, message: 'Vin n°1 invalide.' });
    expect(err({ title: 'x', items: [{ wineId: WINE, dish: 'a'.repeat(201) }] })).toMatchObject({ status: 400 });
  });
  it('date : AAAA-MM-JJ et jour réel', () => {
    expect(err({ title: 'x', date: '11/10/2026', items: [{ wineId: WINE }] })).toMatchObject({ status: 400, message: 'La date doit être au format AAAA-MM-JJ.' });
    expect(err({ title: 'x', date: '2026-02-30', items: [{ wineId: WINE }] })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', date: '2026-13-01', items: [{ wineId: WINE }] })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', date: '2028-02-29', items: [{ wineId: WINE }] })).toBeNull();
  });
  it('ShareError garde le statut', () => {
    const e = new ShareError(409, 'révoqué');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(409);
    expect(isUuid(WINE)).toBe(true);
    expect(isUuid('x')).toBe(false);
  });
});
