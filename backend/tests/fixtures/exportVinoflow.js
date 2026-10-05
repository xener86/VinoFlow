// Fichier type produit par l'export VinoFlow (utils/exportCsv.ts, buildCellarCsv) :
// BOM, séparateur ;, CRLF, virgule décimale, colonnes calculées en fin de ligne.
// L'en-tête doit rester identique à CSV_HEADERS côté front.
export const EXPORT_HEADER = "Identifiant;Nom;Cuvée;Producteur;Millésime;Région;Appellation;Pays;Type;Cépages;Format;Favori;Apogée début;Apogée fin;Prix d'achat (€);Bouteilles;Description;Accords mets;Stock;Apogée;Fenêtre estimée";
export const WINE_A_ID = '11111111-1111-4111-8111-111111111111';
export const WINE_B_ID = '22222222-2222-4222-8222-222222222222';
export const exportCsv = '﻿' + [
  EXPORT_HEADER,
  `${WINE_A_ID};Grand Vin;;"Château, Test";2018;Bordeaux;Pauillac;France;Rouge;"Merlot; Cabernet";750ml;Oui;2025;2035;25,00;;"Dit ""superbe""";agneau;2;À Boire;2025-2035`,
  `${WINE_B_ID};Petit Vin;Cuvée Lune;Domaine Y;2020;Loire;Vouvray;France;Blanc;Chenin;750ml;Non;;;;;"Sur deux lignes
fin";"poisson; fromage";1;À Boire;2022-2027`,
].join('\r\n');
