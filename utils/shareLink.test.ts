import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareOrCopy, copyLink } from './shareLink';

afterEach(() => vi.unstubAllGlobals());

describe('shareOrCopy', () => {
  it('feuille de partage du téléphone si disponible', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { share });
    expect(await shareOrCopy({ title: 'Dîner', url: 'https://x/p/t' })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Dîner', url: 'https://x/p/t' });
  });

  it('partage annulé par l’utilisateur', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }) });
    expect(await shareOrCopy({ title: 'D', url: 'u' })).toBe('cancelled');
  });

  it('sinon copie dans le presse-papiers', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareOrCopy({ title: 'D', url: 'u' })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('u');
  });

  it('ni partage ni presse-papiers', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareOrCopy({ title: 'D', url: 'u' })).toBe('failed');
  });
});

describe('copyLink', () => {
  it('copie directement, sans feuille de partage', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await copyLink('u')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('u');
    expect(share).not.toHaveBeenCalled();
  });

  it('presse-papiers absent ou refusé', async () => {
    vi.stubGlobal('navigator', {});
    expect(await copyLink('u')).toBe(false);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('refusé'); }) } });
    expect(await copyLink('u')).toBe(false);
  });
});
