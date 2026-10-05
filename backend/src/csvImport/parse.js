// Lecture d'un CSV issu de l'export VinoFlow, éventuellement réenregistré par
// Excel ou Numbers : BOM, séparateur ; ou , (détecté sur l'en-tête), guillemets
// doublés, retours à la ligne dans une cellule, CRLF.

export class CsvFormatError extends Error {}

// Séparateur le plus fréquent sur la ligne d'en-tête (hors guillemets).
const detectDelimiter = (text) => {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === '\n' || c === '\r') break;
    else if (c === ';') semicolons += 1;
    else if (c === ',') commas += 1;
  }
  return semicolons >= commas ? ';' : ',';
};

const parseRecords = (text, delimiter) => {
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); records.push(row); }
  return records;
};

export const parseCsv = (input) => {
  const text = String(input ?? '').replace(/^﻿/, '');
  if (!text.trim()) throw new CsvFormatError('Le fichier est vide.');
  const [header, ...body] = parseRecords(text, detectDelimiter(text));
  const rows = [];
  body.forEach((cells, index) => {
    if (cells.every((c) => c.trim() === '')) return;
    rows.push({ line: index + 2, cells: cells.map((c) => c.trim()) });
  });
  return { headers: header.map((h) => h.trim()), rows };
};
