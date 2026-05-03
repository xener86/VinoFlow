// VinoFlow — Sommelier flow wireframes (3 variantes desktop)

// Variante A — Trio horizontal classique (Safe / Personnel / Audacieux)
const SommA = () => (
  <Browser url="vinoflow.local/sommelier">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="somm" />
      <div style={{ flex: 1, padding: '20px 28px' }}>
        <TopBar subtitle="Sommelier" sparse />
        {/* Question + reformulation */}
        <div style={{ marginBottom: 18 }}>
          <div className="sk-xs sk-mute">TA QUESTION</div>
          <div className="sk-h1" style={{ fontSize: 22, marginTop: 4 }}>« agneau aux herbes, à deux, mardi soir »</div>
          <div className="sk-s sk-mute mt-2">Compris : un rouge structuré, plat carné herbacé, contexte intime semaine.</div>
          <div className="row gap-2 mt-2">
            <span className="sk-chip">rouge</span>
            <span className="sk-chip">structure moyenne</span>
            <span className="sk-chip">notes herbacées</span>
            <span className="sk-chip on">éditer la question</span>
          </div>
        </div>
        <div className="sk-squiggle" style={{ margin: '10px 0 18px' }} />

        <div className="sk-h2">Trois propositions</div>
        <div className="sk-s sk-mute" style={{ marginBottom: 14 }}>De la plus sûre à la plus audacieuse.</div>

        <div className="row gap-3">
          <PickCard kind="safe" name="Bandol Tempier" region="Provence" vintage="2016" location="case C2" why="Mourvèdre dominant, garrigue, structure faite. Accord canonique avec l'agneau." />
          <PickCard kind="personnel" name="Crozes-Hermitage Domaine Graillot" region="Rhône Nord" vintage="2018" location="case A5" why="Tu adores les Graillot, la dernière fois c'était parfait. Syrah poivrée pile dans ton goût." />
          <PickCard kind="audacieux" name="Chinon Clos de la Dioterie" region="Loire" vintage="2017" location="case D1" why="Cabernet franc mûri, finesse au lieu de puissance. Le plat va aller chercher le vin, pas l'inverse." />
        </div>

        <div className="row between mt-5 center">
          <div className="row gap-2">
            <span className="sk-btn ghost sm">↻ Autres propositions</span>
            <span className="sk-btn ghost sm">⚙ Affiner</span>
          </div>
          <div className="sk-s sk-mute">Tu peux aussi <span className="sk-arrow">choisir manuellement</span></div>
        </div>
        <Anno style={{ position: 'absolute', top: 12, right: 24 }}>3 cards · trio horizontal · safe → audace</Anno>
      </div>
    </div>
  </Browser>
);

// Variante B — Comparison table (forces vs. faiblesses)
const SommB = () => (
  <Browser url="vinoflow.local/sommelier">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="somm" />
      <div style={{ flex: 1, padding: '20px 28px' }}>
        <div className="sk-h0" style={{ fontSize: 28, marginBottom: 4 }}>Trois pistes pour <span className="sk-highlight">ce soir</span></div>
        <div className="sk-s sk-mute" style={{ marginBottom: 18 }}>« agneau aux herbes, à deux, mardi soir »  ·  <span className="sk-arrow">éditer</span></div>

        <div className="sk-box" style={{ overflow: 'hidden' }}>
          {/* En-tête colonnes */}
          <div className="row" style={{ borderBottom: '1.5px solid #1a1a1a' }}>
            <div className="sk-h3 p-3" style={{ flex: 1 }}>CRITÈRE</div>
            <div className="p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa' }}>
              <div className="sk-h3 sk-soft">SÛR</div>
              <div className="sk-h2 mt-2">Bandol Tempier '16</div>
              <div className="sk-xs">Provence · case C2</div>
            </div>
            <div className="p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa', background: '#f4efe5' }}>
              <div className="sk-h3 sk-wine">PERSONNEL ★</div>
              <div className="sk-h2 mt-2">Crozes-H. Graillot '18</div>
              <div className="sk-xs">Rhône Nord · case A5</div>
            </div>
            <div className="p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa' }}>
              <div className="sk-h3 sk-wine">AUDACIEUX</div>
              <div className="sk-h2 mt-2">Chinon Dioterie '17</div>
              <div className="sk-xs">Loire · case D1</div>
            </div>
          </div>
          {[
            ['Match avec le plat', 'canonique 95%', 'très bon 90%', 'inattendu 78%'],
            ['Fenêtre de garde', 'pic actuel', 'pic 2027', 'à boire avant fin 2026'],
            ['Tu connais déjà ?', 'jamais ouvert', '4 dégustations · 8.7 moy.', 'jamais ouvert'],
            ['Stock', '2 bouteilles', '3 bouteilles', '1 bouteille'],
            ['Ce que dit la cave', 'Profil structuré, garrigue', 'Syrah poivrée, finesse', 'Cab franc mûri, cérébral'],
          ].map((r, i) => (
            <div key={i} className="row" style={{ borderBottom: i < 4 ? '1px dotted #aaa' : 'none' }}>
              <div className="sk-s p-3" style={{ flex: 1, fontWeight: 700 }}>{r[0]}</div>
              <div className="sk-p p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa' }}>{r[1]}</div>
              <div className="sk-p p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa', background: '#f4efe5' }}>{r[2]}</div>
              <div className="sk-p p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa' }}>{r[3]}</div>
            </div>
          ))}
          <div className="row" style={{ borderTop: '1.5px solid #1a1a1a', background: '#fbf8f3' }}>
            <div className="p-3" style={{ flex: 1 }}></div>
            <div className="p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa' }}><span className="sk-btn sm">Choisir</span></div>
            <div className="p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa', background: '#f4efe5' }}><span className="sk-btn wine sm">Choisir ★</span></div>
            <div className="p-3" style={{ flex: 1.4, borderLeft: '1px dotted #aaa' }}><span className="sk-btn sm">Choisir</span></div>
          </div>
        </div>
        <div className="row gap-2 mt-4">
          <span className="sk-btn ghost sm">↻ 3 autres</span>
          <span className="sk-btn ghost sm">+ Comparer un 4e</span>
          <span className="sk-btn ghost sm">⚙ Affiner</span>
        </div>
        <Anno style={{ position: 'absolute', top: 12, right: 24 }}>variante B — vue comparative pour décider vite</Anno>
      </div>
    </div>
  </Browser>
);

// Variante C — Conversation guidée (sommelier qui parle, pas un picker)
const SommC = () => (
  <Browser url="vinoflow.local/sommelier">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="somm" />
      <div style={{ flex: 1, padding: '20px 28px', maxWidth: 720 }}>
        <div className="sk-h3 sk-wine">SOMMELIER · CONVERSATION</div>
        <div className="sk-h0" style={{ fontSize: 26, marginTop: 4, marginBottom: 18 }}>Discutons-en.</div>

        {/* Bulle user */}
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 14 }}>
          <div className="sk-box thin" style={{ padding: '10px 14px', maxWidth: 360, background: '#f4efe5' }}>
            <div className="sk-p">agneau aux herbes, à deux, mardi soir</div>
          </div>
        </div>

        {/* Bulle sommelier */}
        <div className="row gap-3" style={{ marginBottom: 18 }}>
          <div className="sk-box wine" style={{ width: 32, height: 32, borderRadius: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="sk-serif" style={{ color: '#fbf8f3', fontStyle: 'italic', fontSize: 16 }}>S</span>
          </div>
          <div style={{ flex: 1 }}>
            <div className="sk-p">D'accord — un mardi à deux, c'est pas le jour pour sortir une cathédrale. Mais l'agneau aux herbes mérite un peu de structure. Voilà comment je verrais ça :</div>
            <div className="col gap-2 mt-3">
              <div className="sk-box thin" style={{ padding: 12 }}>
                <div className="row between center">
                  <div>
                    <div className="sk-h2">Le choix sûr — <span className="sk-serif" style={{ fontStyle: 'italic' }}>Bandol Tempier '16</span></div>
                    <div className="sk-s sk-mute">case C2 · 2 bouteilles</div>
                  </div>
                  <div className="sk-btn sm">Voir</div>
                </div>
                <div className="sk-p mt-2 sk-soft">Mourvèdre, garrigue. Le mariage est attendu, et c'est très bien comme ça.</div>
              </div>
              <div className="sk-box wine" style={{ padding: 12 }}>
                <div className="row between center">
                  <div>
                    <div className="sk-h2">★ Ma recommandation — <span className="sk-serif" style={{ fontStyle: 'italic' }}>Crozes-Hermitage Graillot '18</span></div>
                    <div className="sk-s sk-mute">case A5 · 3 bouteilles · tu l'as adoré 4 fois</div>
                  </div>
                  <div className="sk-btn wine sm">Choisir ★</div>
                </div>
                <div className="sk-p mt-2 sk-soft">Tu sais déjà que tu l'aimes. Syrah poivrée, finesse — c'est ton goût. Et c'est mardi.</div>
              </div>
              <div className="sk-box thin" style={{ padding: 12 }}>
                <div className="row between center">
                  <div>
                    <div className="sk-h2">Le pari — <span className="sk-serif" style={{ fontStyle: 'italic' }}>Chinon Clos de la Dioterie '17</span></div>
                    <div className="sk-s sk-mute">case D1 · 1 bouteille (la dernière)</div>
                  </div>
                  <div className="sk-btn sm">Voir</div>
                </div>
                <div className="sk-p mt-2 sk-soft">Cab franc mûri — moins de muscle, plus de cervelle. Le plat va chercher le vin. Risqué, mais fascinant.</div>
              </div>
            </div>
            <div className="sk-note mt-3">Si tu hésites, dis-moi en plus — un détail, une humeur, ce que vous aimez en ce moment.</div>
          </div>
        </div>

        {/* Réponse rapide */}
        <div className="sk-box thin" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sk-mute sk-s">réponds, ou pose une autre question...</span>
          <span style={{ flex: 1 }} />
          <span>🎙</span>
          <div className="sk-btn wine sm">→</div>
        </div>
        <Anno style={{ position: 'absolute', top: 12, right: 24 }}>variante C — sommelier conversationnel</Anno>
      </div>
    </div>
  </Browser>
);

Object.assign(window, { SommA, SommB, SommC });
