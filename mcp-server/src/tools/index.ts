// Outils ajoutés par domaine (les 26 outils historiques restent dans src/index.ts).
import type { Server } from './shared.js';
import { registerBar } from './bar.js';
import { registerTastings } from './tastings.js';
import { registerCellarWrites } from './cellar.js';
import { registerEnrichment } from './enrichment.js';
import { registerValuation } from './valuation.js';
import { registerMenuflow } from './menuflow.js';

export const registerAll = (server: Server) => {
    registerBar(server);
    registerTastings(server);
    registerCellarWrites(server);
    registerEnrichment(server);
    registerValuation(server);
    registerMenuflow(server);
};
