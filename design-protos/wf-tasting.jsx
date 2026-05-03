// VinoFlow — Tasting express wireframes (2 desktop + 2 mobile)

// Desktop A — Vertical 4 blocs (la version par défaut du brief)
const TastDeskA = () => (
  <Browser url="vinoflow.local/cave/wine/342/tasting">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="cave" />
      <div style={{ flex: 1, padding: '20px 28px', maxWidth: 640 }}>
        <div className="sk-xs sk-mute">FICHE → DÉGUSTATION EXPRESS</div>
        <div className="sk-h0" style={{ fontSize: 26, marginTop: 4 }}>J'ai bu ce vin</div>
        <div className="sk-serif sk-mute" style={{ fontSize: 16, fontStyle: 'italic' }}>Crozes-Hermitage Graillot '18 · case A5</div>
        <div className="sk-s sk-mute mt-2">~ 40 secondes · auto-save activé</div>

        {/* Bloc 1 */}
        <div className="sk-box mt-4" style={{ padding: 16 }}>
          <div className="row between center">
            <div className="sk-h3">BLOC 1 · VERDICT <span className="sk-mute">— 5s</span></div>
            <span className="sk-xs sk-mute">⏱ 0:00 / 0:05</span>
          </div>
          <div className="mt-3">
            <div className="sk-s">Note globale</div>
            <div className="row gap-3 center mt-2">
              <div className="sk-slider" style={{ flex: 1, position: 'relative' }}>
                <div className="track" />
                <div className="knob" style={{ left: '78%' }} />
              </div>
              <div className="sk-h0 sk-wine" style={{ fontSize: 32, lineHeight: 1 }}>8.5</div>
            </div>
            <div className="row between sk-xs sk-mute mt-1"><span>1</span><span>5</span><span>10</span></div>
          </div>
          <div className="mt-3">
            <div className="sk-s">C'était une claque ?</div>
            <div className="row gap-2 mt-2">
              <span className="sk-chip on">Oui</span>
              <span className="sk-chip">Pas vraiment</span>
              <span className="sk-chip">Non</span>
            </div>
          </div>
        </div>

        {/* Bloc 2 */}
        <div className="sk-box mt-3" style={{ padding: 16 }}>
          <div className="sk-h3">BLOC 2 · POURQUOI <span className="sk-mute">— 15s</span></div>
          <div className="sk-s mt-3">Qu'est-ce qui a sublimé ce vin ?</div>
          <div className="row gap-2 wrap mt-2">
            {['L\'accord avec le plat', 'Le moment', 'Le millésime', 'L\'aération', 'Le vin intrinsèque', 'La compagnie', 'Rien de spécial'].map((c, i) => (
              <span key={i} className={`sk-chip ${i === 0 || i === 5 ? 'on' : ''}`}>{c}</span>
            ))}
          </div>
          <div className="row gap-3 mt-3">
            <div style={{ flex: 1 }}>
              <div className="sk-s">Plat associé</div>
              <div className="sk-box thin mt-1" style={{ padding: '6px 10px' }}>
                <span className="sk-p">agneau aux herbes</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="sk-s">Occasion</div>
              <div className="row gap-1 wrap mt-1">
                {['dîner', 'festif', 'apéro', 'à deux', 'solo'].map((o, i) => (
                  <span key={i} className={`sk-chip ${i === 3 ? 'on' : ''}`} style={{ fontSize: 11 }}>{o}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bloc 3 */}
        <div className="sk-box mt-3" style={{ padding: 16 }}>
          <div className="sk-h3">BLOC 3 · POUR LA SUITE <span className="sk-mute">— 5s</span></div>
          <div className="row gap-3 mt-3">
            <div style={{ flex: 1 }}>
              <div className="sk-s">Tu rachètes ?</div>
              <div className="row gap-1 mt-1">
                <span className="sk-chip on">Oui</span>
                <span className="sk-chip">Peut-être</span>
                <span className="sk-chip">Non</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="sk-s">Cherches similaires ?</div>
              <div className="row gap-1 mt-1">
                <span className="sk-chip on">Oui</span>
                <span className="sk-chip">Non</span>
              </div>
            </div>
            <div>
              <div className="sk-s">À retenir</div>
              <div className="sk-h1 sk-wine mt-1" style={{ fontSize: 22 }}>★</div>
            </div>
          </div>
        </div>

        {/* Bloc 4 */}
        <div className="sk-box thin mt-3" style={{ padding: 16, borderStyle: 'dashed' }}>
          <div className="sk-h3 sk-mute">BLOC 4 · OPTIONNEL <span>— 15s</span></div>
          <div className="sk-box thin mt-3" style={{ padding: '8px 10px', minHeight: 50 }}>
            <span className="sk-mute sk-p">Une émotion ? Un détail marquant ?</span>
          </div>
          <div className="row gap-2 mt-3 center">
            <div className="sk-photo" style={{ width: 60, height: 60 }} />
            <div className="sk-s sk-mute">Photo (pour le Hall of Fame)</div>
          </div>
        </div>

        <div className="row between center mt-4">
          <span className="sk-s sk-mute">↩ Annuler · auto-save dans 8s</span>
          <span className="sk-btn wine">Enregistrer la dégustation</span>
        </div>
        <Anno style={{ position: 'absolute', top: 12, right: 24 }}>desktop A — vertical, 4 blocs séquentiels</Anno>
      </div>
      <div style={{ width: 240, padding: 20, borderLeft: '1.2px dashed #aaa' }}>
        <div className="sk-h3">CONTEXTE</div>
        <div className="sk-bottle wine lg mt-2" style={{ marginLeft: 10 }} />
        <div className="sk-h2 mt-3">Crozes-H. Graillot</div>
        <div className="sk-s sk-mute">Rhône Nord · 2018</div>
        <div className="sk-squiggle" style={{ margin: '12px 0' }} />
        <div className="sk-xs">DÉGUSTATIONS PRÉCÉDENTES</div>
        <div className="col gap-1 mt-2">
          <div className="sk-s">★ 9 — déc. '24, agneau</div>
          <div className="sk-s">★ 8.5 — mai '24, BBQ</div>
          <div className="sk-s">★ 9 — févr. '24, dîner J.</div>
          <div className="sk-s">★ 8 — sept. '23</div>
        </div>
        <div className="sk-s sk-wine mt-2">Moy. 8.6 / 4 sessions</div>
      </div>
    </div>
  </Browser>
);

// Desktop B — One-screen, all-at-once (single scrollable, side-by-side)
const TastDeskB = () => (
  <Browser url="vinoflow.local/cave/wine/342/tasting">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="cave" />
      <div style={{ flex: 1, padding: '20px 28px' }}>
        <div className="row between center">
          <div>
            <div className="sk-xs sk-mute">DÉGUSTATION EXPRESS</div>
            <div className="sk-h0" style={{ fontSize: 26 }}>Crozes-H. Graillot '18</div>
          </div>
          <div className="row gap-2 center">
            <span className="sk-s sk-mute">⏱ 38s écoulées</span>
            <span className="sk-btn ghost sm">Annuler</span>
            <span className="sk-btn wine">Enregistrer</span>
          </div>
        </div>
        <Anno style={{ marginTop: 8 }}>variante B — tout sur un écran, deux colonnes</Anno>

        <div className="row gap-4 mt-4">
          {/* Colonne gauche : verdict + slider grand format */}
          <div style={{ flex: 1 }}>
            <div className="sk-h3">VERDICT</div>
            <div className="sk-box mt-2 tinted" style={{ padding: 20, textAlign: 'center' }}>
              <div className="sk-h0 sk-wine" style={{ fontSize: 64, lineHeight: 1 }}>8.5<span style={{ fontSize: 28, color: '#888' }}>/10</span></div>
              <div className="sk-slider mt-3">
                <div className="track" />
                <div className="knob" style={{ left: '78%' }} />
              </div>
              <div className="row between sk-xs sk-mute mt-1"><span>vidange</span><span>correct</span><span>claque</span></div>
            </div>
            <div className="sk-h3 mt-4">UNE CLAQUE ?</div>
            <div className="row gap-2 mt-2">
              <span className="sk-chip on" style={{ padding: '6px 16px', fontSize: 14 }}>Oui ★</span>
              <span className="sk-chip" style={{ padding: '6px 16px', fontSize: 14 }}>Pas vraiment</span>
              <span className="sk-chip" style={{ padding: '6px 16px', fontSize: 14 }}>Non</span>
            </div>
            <div className="sk-h3 mt-4">À RETENIR / RACHETER ?</div>
            <div className="row gap-3 mt-2">
              <div className="sk-h1" style={{ color: '#9b1c1c', fontSize: 28 }}>★</div>
              <div className="row gap-1">
                <span className="sk-chip on">Rachète</span>
                <span className="sk-chip on">Cherche similaires</span>
              </div>
            </div>
          </div>

          {/* Colonne droite : pourquoi + contexte */}
          <div style={{ flex: 1.2 }}>
            <div className="sk-h3">POURQUOI ?</div>
            <div className="sk-s mt-2">Qu'est-ce qui a sublimé ce vin ?</div>
            <div className="row gap-2 wrap mt-2">
              {['Plat', 'Moment', 'Millésime', 'Aération', 'Vin intrinsèque', 'Compagnie'].map((c, i) => (
                <span key={i} className={`sk-chip ${[0,1,5].includes(i) ? 'on' : ''}`}>{c}</span>
              ))}
            </div>
            <div className="row gap-3 mt-3">
              <div style={{ flex: 1 }}>
                <div className="sk-s">Plat</div>
                <div className="sk-box thin mt-1" style={{ padding: '6px 10px' }}>agneau aux herbes</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="sk-s">Occasion</div>
                <div className="row gap-1 wrap mt-1">
                  <span className="sk-chip">dîner</span>
                  <span className="sk-chip on">à deux</span>
                  <span className="sk-chip">festif</span>
                </div>
              </div>
            </div>
            <div className="sk-h3 mt-4">UN MOT ? <span className="sk-mute">(optionnel)</span></div>
            <div className="sk-box thin mt-2" style={{ padding: 10, minHeight: 60 }}>
              <span className="sk-mute sk-p">une émotion, un détail marquant...</span>
            </div>
            <div className="row gap-2 mt-3 center">
              <div className="sk-photo" style={{ width: 50, height: 50 }} />
              <span className="sk-s sk-mute">+ Photo pour Hall of Fame</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Browser>
);

// Mobile A — Bottom sheet style (vaul)
const TastMobA = () => (
  <Phone>
    <div className="sk-xs sk-mute">CROZES-H. GRAILLOT '18</div>
    <div className="sk-h1" style={{ fontSize: 20, marginTop: 2 }}>J'ai bu ce vin</div>
    <div className="sk-s sk-mute">étape 1/4 · ~40s</div>
    <div className="sk-squiggle" style={{ margin: '12px 0' }} />

    <div className="sk-h3">VERDICT</div>
    <div className="sk-box tinted mt-2" style={{ padding: 16, textAlign: 'center' }}>
      <div className="sk-h0 sk-wine" style={{ fontSize: 44 }}>8.5<span className="sk-mute" style={{ fontSize: 16 }}>/10</span></div>
      <div className="sk-slider mt-2">
        <div className="track" />
        <div className="knob" style={{ left: '78%' }} />
      </div>
    </div>

    <div className="sk-s mt-3">Une claque ?</div>
    <div className="row gap-1 mt-1 wrap">
      <span className="sk-chip on">Oui ★</span>
      <span className="sk-chip">Pas vraiment</span>
      <span className="sk-chip">Non</span>
    </div>

    <div className="sk-h3 mt-4">POURQUOI ?</div>
    <div className="row gap-1 mt-2 wrap">
      {['Plat', 'Moment', 'Millésime', 'Aération', 'Compagnie'].map((c, i) => (
        <span key={i} className={`sk-chip ${[0,1,4].includes(i) ? 'on' : ''}`}>{c}</span>
      ))}
    </div>

    <div className="sk-s mt-3">Plat</div>
    <div className="sk-box thin mt-1" style={{ padding: '6px 10px' }}>agneau aux herbes</div>

    <div style={{ position: 'absolute', bottom: 30, left: 24, right: 24 }}>
      <div className="sk-btn wine" style={{ width: '100%', justifyContent: 'center' }}>Suivant →</div>
      <div className="sk-xs sk-mute" style={{ textAlign: 'center', marginTop: 6 }}>auto-save · swipe ↓ pour fermer</div>
    </div>
    <Anno style={{ position: 'absolute', top: -28, left: 0, fontSize: 12 }}>mobile A — bottom sheet, étapes</Anno>
  </Phone>
);

// Mobile B — Single scroll with sticky CTA
const TastMobB = () => (
  <Phone>
    <div className="row between center">
      <div>
        <div className="sk-xs sk-mute">DÉGUSTATION</div>
        <div className="sk-h2" style={{ fontSize: 16 }}>Crozes-H. '18</div>
      </div>
      <span className="sk-s sk-mute">×</span>
    </div>
    <div className="sk-squiggle" style={{ margin: '8px 0' }} />

    <div className="sk-h3">NOTE</div>
    <div className="sk-h0 sk-wine mt-2" style={{ fontSize: 56, textAlign: 'center', lineHeight: 1 }}>8.5</div>
    <div className="sk-slider mt-2"><div className="track" /><div className="knob" style={{ left: '78%' }} /></div>

    <div className="sk-h3 mt-3">CLAQUE ?</div>
    <div className="row gap-1 mt-1">
      <span className="sk-chip on" style={{ flex: 1, justifyContent: 'center' }}>Oui</span>
      <span className="sk-chip" style={{ flex: 1, justifyContent: 'center' }}>±</span>
      <span className="sk-chip" style={{ flex: 1, justifyContent: 'center' }}>Non</span>
    </div>

    <div className="sk-h3 mt-3">POURQUOI</div>
    <div className="row gap-1 mt-1 wrap">
      {['Plat', 'Moment', 'Millésime', 'Aération', 'Compagnie'].map((c, i) => (
        <span key={i} className={`sk-chip ${[0,1].includes(i) ? 'on' : ''}`}>{c}</span>
      ))}
    </div>

    <div className="sk-s mt-3">Plat</div>
    <div className="sk-box thin mt-1" style={{ padding: '6px 10px' }}>agneau aux herbes</div>

    <div className="sk-h3 mt-3">SUITE</div>
    <div className="row gap-1 mt-1 wrap">
      <span className="sk-chip on">↻ Rachète</span>
      <span className="sk-chip on">~ Similaires</span>
      <span className="sk-chip">★ Mémorable</span>
    </div>

    <div className="sk-s mt-3">Un mot ?</div>
    <div className="sk-box thin mt-1" style={{ padding: '6px 10px', minHeight: 40 }}>
      <span className="sk-mute sk-xs">une émotion, un détail...</span>
    </div>

    <div className="row gap-2 mt-3">
      <div className="sk-photo" style={{ width: 40, height: 40 }} />
      <div className="sk-s sk-mute" style={{ alignSelf: 'center' }}>+ photo</div>
    </div>

    {/* Sticky CTA */}
    <div style={{ position: 'sticky', bottom: 0, marginTop: 18, paddingTop: 8, background: 'linear-gradient(transparent, #fbf8f3 30%)' }}>
      <div className="sk-btn wine" style={{ width: '100%', justifyContent: 'center' }}>Enregistrer ✓</div>
    </div>
    <Anno style={{ position: 'absolute', top: -28, left: 0, fontSize: 12 }}>mobile B — single scroll + CTA sticky</Anno>
  </Phone>
);

Object.assign(window, { TastDeskA, TastDeskB, TastMobA, TastMobB });
