// Identité d'un vin pour le rapprochement de la rafale : nom + producteur +
// millésime, sans casse, accents ni espaces superflus.
const clean = (value) => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

export const identityKey = ({ name, producer, vintage }) => [clean(name), clean(producer), vintage ?? ''].join('|');
