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
    return new TextDecoder('windows-1252').decode(buffer);
  }
};
