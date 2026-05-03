// VinoFlow — Add wine, Insights, Cave, Command palette wireframes

// ── Add wine — desktop (texte priorité)
const AddDesk = () => (
  <Browser url="vinoflow.local/add">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="cave" />
      <div style={{ flex: 1, padding: '20px 28px', maxWidth: 720 }}>
        <div className="sk-xs sk-mute">QUICK ADD</div>
        <div className="sk-h0" style={{ fontSize: 26 }}>Ajouter un vin</div>
        <div className="row gap-2 mt-3">
          <span className="sk-chip on">⌨ Texte</span>
          <span className="sk-chip">📷 Photo étiquette</span>
          <span className="sk-chip">🎙 Dictée</span>
        </div>

        {/* Étape 1 — paste raw */}
        <div className="sk-box mt-4" style={{ padding: 16 }}>
          <div className="sk-h3">1 · COLLE OU TAPE</div>
          <div className="sk-s sk-mute mt-1">Le parseur IA reconnaît domaine, appellation, millésime, cuvée.</div>
          <div className="sk-box thin mt-3" style={{ padding: 12, minHeight: 70 }}>
            <span className="sk-p">Domaine Graillot Crozes-Hermitage La Guiraude 2018, 3 bouteilles, case A5</span>
          </div>
        </div>

        {/* Loading timeline */}
        <div className="sk-box mt-3" style={{ padding: 16, background: '#f4efe5' }}>
          <div className="sk-h3">2 · ANALYSE EN COURS</div>
          <div className="col gap-2 mt-3">
            {[
              ['✓', 'Parsing texte', 'Domaine + appellation détectés', true],
              ['✓', 'Recherche base de données', 'Match : Graillot · Crozes-H. · La Guiraude', true],
              ['◐', 'Profil aromatique IA', 'génère... (confiance : HIGH)', false],
            ].map((s, i) => (
              <div key={i} className="row gap-3 center">
                <div className={`sk-box thin ${s[3] ? 'fill-wine' : ''}`} style={{ width: 22, height: 22, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{s[0]}</div>
                <div style={{ flex: 1 }}>
                  <div className="sk-p"><b>{s[1]}</b></div>
                  <div className="sk-xs sk-mute">{s[2]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview card */}
        <div className="sk-box mt-3" style={{ padding: 16 }}>
          <div className="sk-h3">3 · VÉRIFIE & VALIDE</div>
          <div className="row gap-3 mt-3">
            <div className="sk-bottle wine lg" />
            <div style={{ flex: 1 }}>
              <div className="sk-h2">Crozes-Hermitage La Guiraude</div>
              <div className="sk-s">Domaine Graillot · Rhône Nord · 2018</div>
              <div className="row gap-2 mt-2 wrap">
                <span className="sk-chip">3 bouteilles</span>
                <span className="sk-chip">Case A5</span>
                <span className="sk-chip wine">Profil IA · HIGH</span>
                <span className="sk-chip">Garde : 2024-2030</span>
              </div>
              <div className="sk-note mt-2">Tous les champs sont éditables en cliquant dessus (inline).</div>
            </div>
          </div>
          <div className="row between center mt-4">
            <span className="sk-s sk-arrow">+ Ajouter un autre vin</span>
            <div className="row gap-2">
              <span className="sk-btn ghost sm">Modifier</span>
              <span className="sk-btn wine">Ajouter à la cave ✓</span>
            </div>
          </div>
        </div>
        <Anno style={{ position: 'absolute', top: 12, right: 24 }}>desktop — texte first, IA pipeline visible</Anno>
      </div>
    </div>
  </Browser>
);

// Add — mobile OCR (photo first)
const AddMob = () => (
  <Phone>
    <div className="row between center">
      <span className="sk-xs sk-mute">×</span>
      <div className="sk-h2">Ajouter</div>
      <span className="sk-xs sk-mute">⚙</span>
    </div>
    <div className="row gap-1 mt-2">
      <span className="sk-chip on" style={{ flex: 1, justifyContent: 'center' }}>📷 Photo</span>
      <span className="sk-chip" style={{ flex: 1, justifyContent: 'center' }}>⌨ Texte</span>
      <span className="sk-chip" style={{ flex: 1, justifyContent: 'center' }}>🎙</span>
    </div>

    {/* Camera viewfinder */}
    <div className="sk-photo mt-3" style={{ height: 280, position: 'relative' }}>
      {/* Overlay frame */}
      <div style={{ position: 'absolute', inset: '20% 18%', border: '1.5px dashed #fbf8f3' }} />
      <div className="sk-hand" style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', color: '#fbf8f3' }}>cadre l'étiquette ici</div>
    </div>

    <div className="row gap-2 mt-3 center" style={{ justifyContent: 'center' }}>
      <div className="sk-box thin" style={{ width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🖼</div>
      <div className="sk-box fill-wine" style={{ width: 60, height: 60, borderRadius: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>◉</div>
      <div className="sk-box thin" style={{ width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↻</div>
    </div>

    {/* Mini timeline en bas */}
    <div className="sk-box thin mt-3 tinted" style={{ padding: 8 }}>
      <div className="sk-xs">DERNIÈRE ANALYSE</div>
      <div className="row gap-2 center mt-1">
        <div className="sk-bottle wine" style={{ width: 10, height: 30 }} />
        <div className="sk-s" style={{ flex: 1 }}>Pommard 1er Cru '17 — détecté</div>
        <span className="sk-xs sk-wine">→</span>
      </div>
    </div>
    <Anno style={{ position: 'absolute', top: -28, left: 0 }}>mobile — photo en priorité, capture native</Anno>
  </Phone>
);

// ── Insights — "à boire avant"
const Insights = () => (
  <Browser url="vinoflow.local/insights">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="ins" />
      <div style={{ flex: 1, padding: '20px 28px' }}>
        <TopBar subtitle="Insights" sparse />

        {/* Tabs */}
        <div className="row gap-3" style={{ borderBottom: '1.5px solid #1a1a1a', marginBottom: 18 }}>
          {[
            ['Garde', true, '7'],
            ['Achat', false, '5'],
            ['Anomalies', false, '3'],
            ['Stats', false, ''],
          ].map(([n, on, c], i) => (
            <div key={i} style={{ padding: '6px 4px', borderBottom: on ? '3px solid #9b1c1c' : 'none' }}>
              <span className={`sk-h2 ${on ? 'sk-wine' : 'sk-mute'}`} style={{ fontSize: 17 }}>{n}</span>
              {c && <span className="sk-chip" style={{ marginLeft: 6, fontSize: 11 }}>{c}</span>}
            </div>
          ))}
        </div>

        {/* Hero alert */}
        <div className="sk-box wine" style={{ padding: 18, marginBottom: 18 }}>
          <div className="sk-h3 sk-wine">⚠ ALERTE PRINCIPALE</div>
          <div className="sk-h1 mt-2" style={{ fontSize: 22 }}>4 vins quittent leur fenêtre dans les 60 jours</div>
          <div className="sk-s sk-mute mt-1">Les ouvrir, les déplacer dans « à boire ce mois », ou accepter qu'ils déclinent.</div>
        </div>

        <div className="row gap-4">
          {/* Liste des alertes */}
          <div style={{ flex: 1.4 }}>
            <div className="sk-h3">À BOIRE AVANT...</div>
            <div className="col gap-2 mt-3">
              {[
                ['Pommard 1er Cru les Rugiens', "'18", 'Bourgogne', '15 juin', 'urgent', '#9b1c1c'],
                ['Sancerre Caillottes', "'20", 'Loire blanc', '30 juin', 'urgent', '#9b1c1c'],
                ['Vouvray sec Foreau', "'19", 'Loire blanc', '15 juil.', 'bientôt', '#888'],
                ['Vacqueyras Le Sang', "'17", 'Rhône Sud', 'fin juil.', 'bientôt', '#888'],
                ['Côte-Rôtie Landonne', "'14", 'Rhône Nord', 'août', 'à surveiller', '#888'],
              ].map((w, i) => (
                <div key={i} className="sk-box thin" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="sk-bottle wine" style={{ width: 12, height: 36 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sk-h2" style={{ fontSize: 15 }}>{w[0]} <span className="sk-hand sk-mute" style={{ fontSize: 13 }}>{w[1]}</span></div>
                    <div className="sk-xs">{w[2]} · pic ↘ {w[3]}</div>
                  </div>
                  <span className="sk-chip" style={{ color: w[5], borderColor: w[5] }}>{w[4]}</span>
                  <span className="sk-btn ghost sm">→</span>
                </div>
              ))}
            </div>
          </div>

          {/* Aging timeline visualisation */}
          <div style={{ flex: 1 }}>
            <div className="sk-h3">FENÊTRES DE GARDE</div>
            <div className="sk-box mt-3" style={{ padding: 14 }}>
              <div className="sk-s sk-mute mb-2">Vue 12 mois</div>
              {[
                ['Pommard 1er C.', 0.05, 0.18],
                ['Sancerre Caill.', 0.1, 0.22],
                ['Vouvray Foreau', 0.18, 0.32],
                ['Vacqueyras', 0.22, 0.38],
                ['Côte-R. Landonne', 0.3, 0.50],
                ['Hermitage Chave', 0.45, 0.95],
                ['Bandol Tempier', 0.4, 0.85],
              ].map((r, i) => (
                <div key={i} className="row center mt-2 gap-2">
                  <div className="sk-xs" style={{ width: 110 }}>{r[0]}</div>
                  <div style={{ flex: 1, position: 'relative', height: 14, background: '#f4efe5', border: '1px solid #ccc' }}>
                    <div style={{ position: 'absolute', left: `${r[1]*100}%`, width: `${(r[2]-r[1])*100}%`, top: 0, bottom: 0, background: '#9b1c1c', opacity: 0.6 }} />
                    <div style={{ position: 'absolute', left: '8%', top: -2, bottom: -2, width: 1.5, background: '#1a1a1a' }} title="auj." />
                  </div>
                </div>
              ))}
              <div className="sk-xs sk-mute mt-2">↑ ligne verticale = aujourd'hui · zone rouge = pic</div>
            </div>

            <div className="sk-h3 mt-4">SUGGESTIONS</div>
            <div className="col gap-2 mt-2">
              <div className="sk-box thin" style={{ padding: 10 }}>
                <div className="sk-p"><b>↻ À racheter</b> — Crozes-H. Graillot, dernière bouteille, noté 8.7 moy.</div>
              </div>
              <div className="sk-box thin" style={{ padding: 10 }}>
                <div className="sk-p"><b>↑ Trop de</b> bourgognes blancs — 23% de la cave</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Browser>
);

// ── Cave — list with filters
const Cave = () => (
  <Browser url="vinoflow.local/cave">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="cave" />
      <div style={{ flex: 1, padding: '20px 28px' }}>
        <div className="row between center">
          <div>
            <div className="sk-xs sk-mute">CAVE</div>
            <div className="sk-h0" style={{ fontSize: 26 }}>290 vins · 27 emplacements</div>
          </div>
          <div className="row gap-2 center">
            <span className="sk-chip on">≡ Liste</span>
            <span className="sk-chip">▦ Plan</span>
            <span className="sk-chip">📋 Wishlist</span>
            <div className="sk-btn wine sm">+ Ajouter</div>
          </div>
        </div>

        {/* Filtres */}
        <div className="sk-squiggle" style={{ margin: '14px 0' }} />
        <div className="row gap-2 wrap center">
          <span className="sk-s">Filtres</span>
          <span className="sk-chip on">Rouges</span>
          <span className="sk-chip">Blancs</span>
          <span className="sk-chip">Effervescents</span>
          <span className="sk-chip">Tous types</span>
          <div style={{ width: 1, background: '#aaa', height: 18, margin: '0 4px' }} />
          <span className="sk-chip">Bourgogne</span>
          <span className="sk-chip on">Rhône</span>
          <span className="sk-chip">Loire</span>
          <span className="sk-chip">+ Région</span>
          <div style={{ width: 1, background: '#aaa', height: 18, margin: '0 4px' }} />
          <span className="sk-chip">À boire</span>
          <span className="sk-chip">Pic</span>
          <span className="sk-chip">Garde</span>
          <span style={{ flex: 1 }} />
          <span className="sk-s sk-mute">Trier : <b>Pic ↗</b></span>
        </div>
        <div className="sk-s sk-mute mt-2">68 vins affichés · <span className="sk-arrow">2 sélectionnés</span></div>

        {/* Bulk action bar */}
        <div className="sk-box wine mt-2" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="sk-p">2 vins sélectionnés</span>
          <span style={{ flex: 1 }} />
          <span className="sk-btn ghost sm">Déplacer</span>
          <span className="sk-btn ghost sm">Tagger</span>
          <span className="sk-btn ghost sm">Exporter</span>
          <span className="sk-btn ghost sm">Supprimer</span>
        </div>

        {/* Liste */}
        <div className="sk-box mt-3" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="row sk-h3" style={{ borderBottom: '1px solid #1a1a1a', padding: '8px 14px', background: '#f4efe5' }}>
            <span style={{ width: 24 }}>☐</span>
            <span style={{ flex: 2 }}>VIN</span>
            <span style={{ flex: 1.2 }}>RÉGION</span>
            <span style={{ width: 70 }}>VINTAGE</span>
            <span style={{ width: 80 }}>STOCK</span>
            <span style={{ width: 90 }}>STATUT</span>
            <span style={{ width: 60 }}>NOTE</span>
            <span style={{ width: 40 }} />
          </div>
          {[
            ['☑', 'Pommard 1er Cru Rugiens', 'Bourgogne', '2018', '2', 'pic', '8.5'],
            ['☑', 'Crozes-Hermitage La Guiraude', 'Rhône Nord', '2018', '3', 'à boire', '8.7'],
            ['☐', 'Côte-Rôtie La Landonne', 'Rhône Nord', '2014', '1', 'pic ↘', '—'],
            ['☐', 'Sancerre Les Caillottes', 'Loire', '2020', '2', 'à boire', '8.0'],
            ['☐', 'Hermitage La Chapelle', 'Rhône Nord', '2010', '1', 'garde', '9.5 ★'],
            ['☐', 'Vacqueyras Le Sang', 'Rhône Sud', '2017', '4', 'à boire', '—'],
            ['☐', 'Bandol Tempier', 'Provence', '2016', '2', 'pic', '8.0'],
          ].map((r, i) => (
            <div key={i} className="row center" style={{ borderBottom: '1px dotted #aaa', padding: '8px 14px' }}>
              <span style={{ width: 24 }}>{r[0]}</span>
              <span className="sk-p" style={{ flex: 2, fontWeight: 600 }}>{r[1]}</span>
              <span className="sk-s" style={{ flex: 1.2 }}>{r[2]}</span>
              <span className="sk-hand" style={{ width: 70, fontSize: 16 }}>{r[3]}</span>
              <span className="sk-s" style={{ width: 80 }}>×{r[4]}</span>
              <span style={{ width: 90 }}><span className="sk-chip" style={{ fontSize: 11 }}>{r[5]}</span></span>
              <span className="sk-h2 sk-wine" style={{ width: 60, fontSize: 15 }}>{r[6]}</span>
              <span style={{ width: 40 }} className="sk-s sk-mute">⋯</span>
            </div>
          ))}
        </div>
        <Anno style={{ position: 'absolute', top: 12, right: 24 }}>cave — liste, filtres, bulk actions</Anno>
      </div>
    </div>
  </Browser>
);

// ── Command palette overlay
const CmdPalette = () => (
  <div style={{ position: 'relative', width: 720, height: 520 }}>
    {/* Faded background */}
    <div className="sk-box" style={{ position: 'absolute', inset: 0, padding: 18, opacity: 0.35, overflow: 'hidden' }}>
      <div className="sk-h0">Tableau de bord</div>
      <div className="sk-line long mt-2" /><div className="sk-line med" /><div className="sk-line long" />
    </div>
    {/* Modal */}
    <div className="sk-box" style={{ position: 'absolute', top: 70, left: 90, right: 90, bottom: 90, padding: 0, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', background: '#fbf8f3' }}>
      <div className="row center" style={{ padding: '12px 16px', borderBottom: '1.2px solid #1a1a1a', gap: 10 }}>
        <span style={{ fontSize: 16 }}>🔍</span>
        <div className="sk-h2" style={{ fontSize: 18, flex: 1 }}>pommard<span className="sk-mute" style={{ fontWeight: 400 }}> ▌</span></div>
        <span className="sk-chip" style={{ fontSize: 11 }}>esc</span>
      </div>
      <div style={{ padding: '8px 0' }}>
        <div className="sk-xs sk-mute" style={{ padding: '4px 16px' }}>VINS · 3</div>
        {[
          ['Pommard 1er Cru Rugiens', "'18 · case A2 · pic"],
          ['Pommard les Épenots', "'19 · case B1 · garde"],
          ['Pommard village', "'20 · case A4 · garde"],
        ].map((r, i) => (
          <div key={i} className="row center gap-3" style={{ padding: '8px 16px', background: i === 0 ? '#f4efe5' : 'transparent' }}>
            <div className="sk-bottle wine" style={{ width: 10, height: 30 }} />
            <div style={{ flex: 1 }}>
              <div className="sk-p" style={{ fontWeight: 600 }}>{r[0]}</div>
              <div className="sk-xs">{r[1]}</div>
            </div>
            {i === 0 && <span className="sk-chip" style={{ fontSize: 11 }}>↵ ouvrir</span>}
          </div>
        ))}
        <div className="sk-xs sk-mute" style={{ padding: '4px 16px', marginTop: 6 }}>ACTIONS</div>
        <div className="row center gap-3" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 14 }}>+</span>
          <div className="sk-p" style={{ flex: 1 }}>Ajouter un Pommard à la wishlist</div>
        </div>
        <div className="row center gap-3" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 14 }}>≡</span>
          <div className="sk-p" style={{ flex: 1 }}>Filtrer la cave : <b>pommard</b></div>
        </div>
        <div className="sk-xs sk-mute" style={{ padding: '4px 16px', marginTop: 6 }}>RÉGIONS · 1</div>
        <div className="row center gap-3" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 14 }}>📍</span>
          <div className="sk-p" style={{ flex: 1 }}>Pommard <span className="sk-mute sk-xs">— appellation, Bourgogne</span></div>
        </div>
        <div className="sk-xs sk-mute" style={{ padding: '4px 16px', marginTop: 6 }}>PLATS · 2</div>
        <div className="row center gap-3" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 14 }}>🍽</span>
          <div className="sk-p" style={{ flex: 1 }}>Que servir avec un Pommard ?</div>
        </div>
      </div>
      <div className="row center between" style={{ padding: '8px 16px', borderTop: '1.2px solid #aaa', background: '#f4efe5' }}>
        <div className="row gap-2 center sk-xs sk-mute">
          <span className="sk-chip" style={{ fontSize: 10 }}>↑↓</span> naviguer
          <span className="sk-chip" style={{ fontSize: 10 }}>↵</span> ouvrir
          <span className="sk-chip" style={{ fontSize: 10 }}>⌘K</span> fermer
        </div>
        <span className="sk-xs sk-mute">universel · vins, plats, régions, actions</span>
      </div>
    </div>
    <Anno style={{ position: 'absolute', top: 8, left: 8 }}>command palette — Cmd+K, type-to-find</Anno>
  </div>
);

Object.assign(window, { AddDesk, AddMob, Insights, Cave, CmdPalette });
