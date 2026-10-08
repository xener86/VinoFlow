// Windows-1252 : seuls les octets 0x80–0x9F diffèrent de latin-1 (€, ’, œ…).
// Certains environnements (Node sans ICU complet) décodent « windows-1252 »
// comme du latin-1 pur : on applique la table nous-mêmes.
const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

export const fixCp1252 = (text: string): string =>
  text.replace(/[\u0080-\u009f]/g, c => CP1252[c.charCodeAt(0)] ?? c);

/**
 * Texte d'un CSV choisi par l'utilisateur. L'export VinoFlow est en UTF-8, mais
 * « Enregistrer sous → CSV (séparateur : point-virgule) » d'Excel FR écrit en
 * Windows-1252 : lu en UTF-8, chaque accent deviendrait « � » (en-têtes non
 * reconnus, valeurs abîmées). UTF-8 strict d'abord, Windows-1252 sinon.
 */
export const decodeCsvBytes = (buffer: ArrayBuffer): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return fixCp1252(new TextDecoder('windows-1252').decode(buffer));
  }
};
