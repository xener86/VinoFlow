// VinoFlow — Dashboard wireframes (3 variantes desktop)

const DashA = () => (
  <Browser url="vinoflow.local/">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="dash" />
      <div style={{ flex: 1, padding: '18px 24px' }}>
        <TopBar />
        {/* HERO — Que boire ce soir */}
        <div className="sk-box tinted" style={{ padding: 28, marginBottom: 18, position: 'relative' }}>
          <div className="sk-h3 sk-wine">SOMMELIER</div>
          <div className="sk-h0" style={{ fontSize: 38, marginTop: 6 }}>
            Que boire <span className="sk-highlight">ce soir</span> ?
          </div>
          <div className="sk-s sk-mute" style={{ marginTop: 4 }}>Décris le moment, le plat, l'humeur — ou pose la question.</div>
          <div className="row gap-3 center mt-4">
            <div className="sk-box thin" style={{ flex: 1, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="sk-mute sk-p">ex. dîner à deux, agneau aux herbes, on est mardi</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 16 }}>🎙</span>
            </div>
            <div className="sk-btn wine">Demander →</div>
          </div>
          <div className="row gap-2 mt-3 wrap">
            <span className="sk-chip">À deux</span>
            <span className="sk-chip">Festif</span>
            <span className="sk-chip">Solo</span>
            <span className="sk-chip">Apéro</span>
            <span className="sk-chip">Surprise-moi</span>
          </div>
          <Anno style={{ position: 'absolute', top: 8, right: 14 }}>Hero principal — JTBD 80%</Anno>
        </div>

        {/* À boire ce mois */}
        <div className="row between center mt-2">
          <div className="sk-h2">À boire ce mois <span className="sk-mute sk-s">— fenêtre de garde qui se ferme</span></div>
          <span className="sk-s sk-arrow">Tout voir</span>
        </div>
        <div className="row gap-3 mt-2">
          {[
            { name: 'Pommard 1er Cru', region: 'Bourgogne', vintage: '2018', status: 'pic ↘ juin' },
            { name: 'Sancerre Les Caillottes', region: 'Loire', vintage: '2020', status: 'à boire' },
            { name: 'Côte-Rôtie La Landonne', region: 'Rhône Nord', vintage: '2014', status: 'pic ↘ août' },
          ].map((w, i) => (
            <div key={i} style={{ flex: 1 }}>
              <WineCard {...w} />
              <div className="row gap-2 mt-2">
                <span className="sk-btn ghost sm">Fiche</span>
                <span className="sk-btn sm">J'ai bu</span>
              </div>
            </div>
          ))}
        </div>

        {/* Hall of Fame + Stats */}
        <div className="row gap-4 mt-5">
          <div style={{ flex: 1.4 }}>
            <div className="sk-h3">HALL OF FAME</div>
            <div className="sk-serif" style={{ fontSize: 18, marginBottom: 10 }}>Tes coups de cœur, dans l'ordre</div>
            <div className="col gap-3">
              <HOFCard rank="01" name="Hermitage La Chapelle" vintage="2010" region="Rhône" score="9.5" memory="avec un agneau, un samedi d'hiver" />
              <HOFCard rank="02" name="Pavillon Blanc" vintage="2017" region="Margaux" score="9" memory="anniversaire de M., la terrasse" />
              <HOFCard rank="03" name="Chambolle-Musigny" vintage="2015" region="Bourgogne" score="8.5" memory="dimanche pluvieux, seul" />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="sk-h3">EN UN COUP D'ŒIL</div>
            <div className="sk-serif" style={{ fontSize: 18, marginBottom: 10 }}>Ta cave aujourd'hui</div>
            <div className="col gap-2">
              <StatBlock label="BOUTEILLES" value="290" hint="↗ 12 ce mois-ci" />
              <StatBlock label="MOIS DE STOCK" value="14" hint="rythme actuel" />
              <StatBlock label="DÉGUSTATIONS" value="38" hint="cette année" />
            </div>
            <div className="sk-squiggle" style={{ margin: '14px 0' }} />
            <div className="sk-h3">JOURNAL — RÉCENT</div>
            <div className="col gap-2 mt-2">
              <div className="sk-s">— hier · ajouté 3 bourgognes</div>
              <div className="sk-s">— 2j · dégusté Pommard '18</div>
              <div className="sk-s">— 4j · déplacé case A4 → B2</div>
            </div>
            <div className="sk-s sk-arrow mt-3">Voir tout le journal</div>
          </div>
        </div>
      </div>
    </div>
  </Browser>
);

// Variante B — Hero plus discret, focus sur "À boire ce mois" en colonne large
const DashB = () => (
  <Browser url="vinoflow.local/">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="dash" />
      <div style={{ flex: 1, padding: '18px 24px' }}>
        <TopBar />
        {/* Hero compact */}
        <div className="row gap-4 center" style={{ marginBottom: 22 }}>
          <div style={{ flex: 1 }}>
            <div className="sk-h3 sk-wine">SOMMELIER</div>
            <div className="sk-h1" style={{ fontSize: 26, marginTop: 4 }}>Que boire ce soir ?</div>
            <div className="sk-box thin mt-2" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="sk-mute sk-s">décris le moment...</span>
              <span style={{ flex: 1 }} />
              <span>🎙</span>
              <div className="sk-btn wine sm">→</div>
            </div>
            <Anno style={{ marginTop: 10 }}>variante B : hero compact, place pour data</Anno>
          </div>
          <div className="sk-box wine" style={{ padding: 18, flex: 1, minWidth: 280 }}>
            <div className="sk-h3" style={{ color: '#9b1c1c' }}>UNE IDÉE POUR TOI</div>
            <div className="sk-h1 mt-2" style={{ fontSize: 22 }}>Sancerre Les Caillottes</div>
            <div className="sk-s">Loire · 2020 · case B4</div>
            <div className="sk-p mt-2 sk-soft">Tu n'as pas ouvert de blanc cette semaine. Celui-ci sort de sa fenêtre dans 6 semaines.</div>
            <div className="row gap-2 mt-3">
              <span className="sk-btn sm wine">Choisir</span>
              <span className="sk-btn ghost sm">Autre proposition</span>
            </div>
          </div>
        </div>

        <div className="row gap-4">
          {/* Colonne 1 : à boire ce mois — vertical */}
          <div style={{ flex: 1.3 }}>
            <div className="sk-h3">À BOIRE CE MOIS · 7 VINS</div>
            <div className="sk-serif" style={{ fontSize: 16, marginBottom: 8 }}>Avant qu'ils ne passent leur pic</div>
            <div className="col gap-2">
              {[
                ['Pommard 1er Cru', 'Bourgogne', '2018', 'pic ↘ juin'],
                ['Sancerre Caillottes', 'Loire', '2020', 'à boire'],
                ['Côte-Rôtie La Landonne', 'Rhône', '2014', 'pic ↘ août'],
                ['Chablis Vaudésir', 'Bourgogne', '2019', 'pic ↘ juin'],
                ['Vacqueyras', 'Rhône Sud', '2017', 'à boire'],
              ].map((w, i) => (
                <div key={i} className="sk-box thin" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="sk-bottle wine" style={{ width: 12, height: 36 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sk-h2" style={{ fontSize: 15 }}>{w[0]} <span className="sk-hand sk-mute" style={{ fontSize: 13 }}>'{w[2].slice(2)}</span></div>
                    <div className="sk-xs">{w[1]} · {w[3]}</div>
                  </div>
                  <span className="sk-s sk-mute">→</span>
                </div>
              ))}
            </div>
          </div>

          {/* Colonne 2 : Hall of Fame */}
          <div style={{ flex: 1 }}>
            <div className="sk-h3">HALL OF FAME</div>
            <div className="sk-serif" style={{ fontSize: 16, marginBottom: 8 }}>Top 5 de tous les temps</div>
            <div className="col gap-2">
              {[
                ['01', 'Hermitage La Chapelle', '10', '9.5'],
                ['02', 'Pavillon Blanc Margaux', '17', '9'],
                ['03', 'Chambolle-Musigny', '15', '8.5'],
                ['04', 'Vouvray moelleux', '11', '8'],
                ['05', 'Bandol Tempier', '16', '8'],
              ].map((h, i) => (
                <div key={i} className="row center gap-2" style={{ padding: '4px 0', borderBottom: '1px dotted #aaa' }}>
                  <span className="sk-serif sk-wine" style={{ fontSize: 18, minWidth: 22 }}>{h[0]}</span>
                  <span className="sk-p" style={{ flex: 1 }}>{h[1]} <span className="sk-mute sk-s">'{h[2]}</span></span>
                  <span className="sk-h2 sk-wine" style={{ fontSize: 16 }}>{h[3]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Colonne 3 : KPIs + activité */}
          <div style={{ flex: 0.9 }}>
            <div className="sk-h3">CHIFFRES</div>
            <div className="row gap-2 mt-2 wrap">
              <StatBlock label="VINS" value="290" />
              <StatBlock label="MOIS" value="14" />
            </div>
            <StatBlock label="DÉGUSTATIONS '26" value="38" hint="2x plus que '25" />
            <div className="sk-squiggle" style={{ margin: '14px 0' }} />
            <div className="sk-h3">JOURNAL</div>
            <div className="col gap-1 mt-2">
              <div className="sk-s">+ 3 bourgognes · hier</div>
              <div className="sk-s">~ Pommard '18 dégusté · 2j</div>
              <div className="sk-s">↻ A4 → B2 · 4j</div>
              <div className="sk-s">+ Sancerre '20 · 5j</div>
            </div>
            <div className="sk-s sk-arrow mt-2">Tout le journal</div>
            <div className="sk-squiggle" style={{ margin: '14px 0' }} />
            <div className="sk-h3">INSIGHTS</div>
            <div className="col gap-1 mt-2">
              <div className="sk-p">⚠ 4 vins à boire cette saison</div>
              <div className="sk-p">↻ 3 doublons détectés</div>
              <div className="sk-p">★ 2 à racheter (épuisés, 9+/10)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Browser>
);

// Variante C — Magazine (cover éditoriale)
const DashC = () => (
  <Browser url="vinoflow.local/">
    <div className="row" style={{ minHeight: 720 }}>
      <Sidebar active="dash" />
      <div style={{ flex: 1, padding: '0' }}>
        {/* Cover éditoriale */}
        <div style={{ background: '#f4efe5', padding: '28px 36px', borderBottom: '1.5px solid #1a1a1a', position: 'relative' }}>
          <div className="row between center">
            <div className="sk-print" style={{ fontSize: 11, letterSpacing: 1.5 }}>VOL. III · LUNDI 4 MAI 2026 · ÉDITION DU SOIR</div>
            <div className="row gap-3 center">
              <span className="sk-s">🔍 Cherche · ⌘K</span>
              <div className="sk-btn wine sm">+ Ajouter</div>
            </div>
          </div>
          <div style={{ height: 1, background: '#1a1a1a', margin: '8px 0 14px' }} />
          <div className="sk-serif" style={{ fontSize: 56, lineHeight: 1, color: '#1a1a1a' }}>Le Cellier</div>
          <div className="sk-print" style={{ fontSize: 12, marginTop: 4, letterSpacing: 1 }}>290 BOUTEILLES · 27 EMPLACEMENTS · 14 MOIS DE STOCK</div>

          {/* Article principal — Que boire */}
          <div className="row gap-5 mt-5" style={{ marginTop: 22 }}>
            <div style={{ flex: 1.3 }}>
              <div className="sk-print sk-wine" style={{ fontSize: 12, letterSpacing: 1.5 }}>À LA UNE · SOMMELIER</div>
              <div className="sk-serif" style={{ fontSize: 36, lineHeight: 1.05, marginTop: 8 }}>Que boire <span style={{ fontStyle: 'italic' }}>ce soir</span> ?</div>
              <div className="sk-p sk-soft mt-3" style={{ fontSize: 15 }}>
                Décris le moment — un plat, une humeur, deux mots — et la cave répond. Trois propositions : sûre, personnelle, audacieuse.
              </div>
              <div className="sk-box thin mt-4" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="sk-mute sk-p">ex. agneau aux herbes, à deux, mardi soir</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 16 }}>🎙</span>
                <div className="sk-btn wine sm">→</div>
              </div>
            </div>
            <div style={{ flex: 1, borderLeft: '1.2px solid #1a1a1a', paddingLeft: 24 }}>
              <div className="sk-print sk-wine" style={{ fontSize: 11, letterSpacing: 1.5 }}>L'ÉDITO DU JOUR</div>
              <div className="sk-serif" style={{ fontSize: 16, marginTop: 6, fontStyle: 'italic' }}>
                « Trois Pommards passent leur pic ce mois-ci. Une Côte-Rôtie attend depuis douze ans. Le moment est venu. »
              </div>
              <div className="sk-print mt-3" style={{ fontSize: 11 }}>— LE SOMMELIER, IA</div>
            </div>
          </div>
        </div>

        {/* Section : à boire ce mois */}
        <div style={{ padding: '24px 36px' }}>
          <div className="row between center" style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: 6 }}>
            <div className="sk-print" style={{ fontSize: 12, letterSpacing: 2 }}>RUBRIQUE — À BOIRE CE MOIS</div>
            <span className="sk-s sk-mute">7 vins en fin de fenêtre</span>
          </div>
          <div className="row gap-4 mt-4">
            {[
              ['Pommard 1er Cru', 'Bourgogne', '2018', 'pic ↘ juin'],
              ['Sancerre Caillottes', 'Loire blanc', '2020', 'à boire'],
              ['Côte-Rôtie La Landonne', 'Rhône Nord', '2014', 'pic ↘ août'],
            ].map((w, i) => (
              <div key={i} style={{ flex: 1 }}>
                <div className="sk-print sk-wine" style={{ fontSize: 10, letterSpacing: 1.5 }}>0{i+1}</div>
                <div className="sk-serif" style={{ fontSize: 22, lineHeight: 1.1, marginTop: 4 }}>{w[0]}</div>
                <div className="sk-s" style={{ marginTop: 2 }}>{w[1]} · {w[2]} · {w[3]}</div>
                <FauxText lines={2} />
                <div className="row gap-2 mt-2">
                  <span className="sk-btn ghost sm">Lire</span>
                  <span className="sk-btn sm">J'ai bu</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: '#1a1a1a', margin: '24px 0' }} />

          {/* Hall of Fame + Chiffres */}
          <div className="row gap-5">
            <div style={{ flex: 1.4 }}>
              <div className="sk-print" style={{ fontSize: 12, letterSpacing: 2, borderBottom: '1px solid #1a1a1a', paddingBottom: 6 }}>HALL OF FAME — TES COUPS DE CŒUR</div>
              <div className="row gap-4 mt-3">
                {[
                  ['I', 'Hermitage La Chapelle', '10', '9.5', 'agneau, samedi d\'hiver'],
                  ['II', 'Pavillon Blanc', '17', '9', 'anniversaire de M.'],
                  ['III', 'Chambolle-Musigny', '15', '8.5', 'dimanche pluvieux'],
                ].map((h, i) => (
                  <div key={i} style={{ flex: 1, borderRight: i < 2 ? '1px dotted #1a1a1a' : 'none', paddingRight: 12 }}>
                    <div className="sk-serif sk-wine" style={{ fontSize: 32, lineHeight: 1, fontStyle: 'italic' }}>{h[0]}</div>
                    <div className="sk-serif mt-2" style={{ fontSize: 17 }}>{h[1]}</div>
                    <div className="sk-xs">'{h[2]} · note <span className="sk-wine sk-h2" style={{ fontSize: 16 }}>{h[3]}</span></div>
                    <div className="sk-note mt-2" style={{ fontSize: 13 }}>« {h[4]} »</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="sk-print" style={{ fontSize: 12, letterSpacing: 2, borderBottom: '1px solid #1a1a1a', paddingBottom: 6 }}>EN CHIFFRES</div>
              <div className="row gap-3 mt-3">
                <div style={{ flex: 1 }}>
                  <div className="sk-serif" style={{ fontSize: 36 }}>290</div>
                  <div className="sk-xs">BOUTEILLES</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="sk-serif" style={{ fontSize: 36 }}>14</div>
                  <div className="sk-xs">MOIS DE STOCK</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="sk-serif" style={{ fontSize: 36 }}>38</div>
                  <div className="sk-xs">DÉGUSTATIONS</div>
                </div>
              </div>
              <div className="sk-print mt-4" style={{ fontSize: 12, letterSpacing: 2, borderBottom: '1px solid #1a1a1a', paddingBottom: 6 }}>JOURNAL</div>
              <div className="col gap-1 mt-2">
                <div className="sk-s">+ 3 bourgognes · hier</div>
                <div className="sk-s">~ Pommard '18 dégusté · 2j</div>
                <div className="sk-s">↻ A4 → B2 · 4j</div>
              </div>
            </div>
          </div>
        </div>
        <Anno style={{ position: 'absolute', top: 12, right: 36, background: '#fbf8f3' }}>variante C — magazine éditorial</Anno>
      </div>
    </div>
  </Browser>
);

Object.assign(window, { DashA, DashB, DashC });
