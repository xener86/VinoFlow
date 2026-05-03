// VinoFlow — App shell + design canvas mounting

const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSlider } = window;

const App = () => {
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "sketchIntensity": 1,
    "wineAccent": true,
    "showAnnotations": true,
    "language": "fr"
  }/*EDITMODE-END*/);

  // Apply tweaks to root via CSS vars
  React.useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--wine', tweaks.wineAccent ? '#9b1c1c' : '#1a1a1a');
    document.body.classList.toggle('hide-anno', !tweaks.showAnnotations);
    const filterMap = { 0: 'none', 1: 'url(#sk-wobble)', 2: 'url(#sk-wobble-strong)' };
    document.body.style.setProperty('--sk-filter', filterMap[tweaks.sketchIntensity] || 'url(#sk-wobble)');
  }, [tweaks]);

  return (
    <>
      <style>{`
        body.hide-anno .sk-callout, body.hide-anno [class*="Anno"], body.hide-anno .sk-anno-tag { display: none !important; }
      `}</style>

      <DesignCanvas>
        <DCSection id="intro" title="VinoFlow · Wireframes" subtitle="Exploration low-fi des 5 flows critiques · 13 artboards">
          <DCArtboard id="readme" label="Lis-moi en premier" width={520} height={720}>
            <div style={{ padding: 36, height: '100%', background: '#fbf8f3', overflow: 'auto' }}>
              <div className="sk-print sk-wine" style={{ fontSize: 12, letterSpacing: 2 }}>VINOFLOW · ROUGH BOOK</div>
              <div className="sk-serif" style={{ fontSize: 44, lineHeight: 1.05, marginTop: 8 }}>Premier jet, sur la table.</div>
              <div className="sk-squiggle" style={{ margin: '14px 0' }} />
              <div className="sk-p mt-3">Salut. Voici 13 wireframes low-fi qui couvrent les 5 flows critiques + le command palette + le système de cave + l'add wine. <b>Volontairement crayon</b> — on explore la structure, pas la peinture.</div>

              <div className="sk-h3 mt-4">CE QUI EST DEDANS</div>
              <div className="col gap-1 mt-2">
                <div className="sk-p">— <b>Tableau de bord</b> · 3 variantes (classique / dense / magazine éditorial)</div>
                <div className="sk-p">— <b>Sommelier</b> · 3 variantes (trio / comparatif / conversationnel)</div>
                <div className="sk-p">— <b>Tasting express</b> · 2 desktop + 2 mobile</div>
                <div className="sk-p">— <b>Add wine</b> · desktop texte + mobile OCR</div>
                <div className="sk-p">— <b>Insights · à boire avant</b> avec timeline visuelle</div>
                <div className="sk-p">— <b>Cave</b> liste + filtres + bulk actions</div>
                <div className="sk-p">— <b>Command palette</b> (⌘K)</div>
              </div>

              <div className="sk-h3 mt-4">PARTIS PRIS</div>
              <div className="col gap-2 mt-2">
                <div className="sk-p">→ <b>Magazine restreint</b> : touches éditoriales (Playfair en italique pour les noms de vins, petites caps Architects Daughter pour les rubriques) sur ossature dashboard pragmatique.</div>
                <div className="sk-p">→ <b>Pas d'imagerie</b> : silhouettes de bouteilles + blocs de couleur. Quand on a tes photos, on remplace.</div>
                <div className="sk-p">→ <b>Sommelier multi-tons</b> : Sûr=factuel, Personnel=chaleureux, Audacieux=littéraire — comme demandé.</div>
                <div className="sk-p">→ <b>Mobile first-class</b> : 2 variantes du tasting + l'add wine OCR sont mockés en parallèle, pas en after.</div>
                <div className="sk-p">→ <b>Wine red</b> n'apparaît que pour : titres de marque, CTAs principaux, accents de notation, alertes urgentes. Pas de gradient, pas de fond rouge plein.</div>
              </div>

              <div className="sk-h3 mt-4">PROCHAINES ÉTAPES</div>
              <div className="col gap-1 mt-2">
                <div className="sk-p">1. Tu picks tes variantes préférées par flow → on les hi-fi (Playfair + Outfit, vrai theme dark/light)</div>
                <div className="sk-p">2. On dessine le design system : palette, type, espacements, et les 9 composants atomiques du brief</div>
                <div className="sk-p">3. On boucle les flows secondaires (Cave plan visuel, Hall of Fame détail, fiche vin individuelle)</div>
              </div>

              <div className="sk-note mt-4" style={{ fontSize: 14 }}>Tu peux <b>renommer</b> les artboards en cliquant le titre, et <b>réorganiser</b> en glissant la poignée. Open le panneau <b>Tweaks</b> (en bas à droite) pour cycler le ton.</div>
            </div>
          </DCArtboard>
        </DCSection>

        <DCSection id="dash" title="01 · Tableau de bord" subtitle="L'écran le plus important — 3 directions">
          <DCArtboard id="dash-a" label="A · Hero proéminent" width={1180} height={840}><DashA /></DCArtboard>
          <DCArtboard id="dash-b" label="B · Dense / 3 colonnes" width={1180} height={840}><DashB /></DCArtboard>
          <DCArtboard id="dash-c" label="C · Magazine éditorial" width={1180} height={920}><DashC /></DCArtboard>
        </DCSection>

        <DCSection id="somm" title="02 · Sommelier — Que boire ce soir ?" subtitle="JTBD à 80% — 3 directions UX">
          <DCArtboard id="somm-a" label="A · Trio horizontal" width={1180} height={760}><SommA /></DCArtboard>
          <DCArtboard id="somm-b" label="B · Vue comparative" width={1180} height={760}><SommB /></DCArtboard>
          <DCArtboard id="somm-c" label="C · Conversationnel" width={1180} height={760}><SommC /></DCArtboard>
        </DCSection>

        <DCSection id="tast" title="03 · Dégustation express" subtitle="Desktop + mobile en parallèle, ~40s total">
          <DCArtboard id="tast-da" label="Desktop A · Vertical 4 blocs" width={1180} height={1100}><TastDeskA /></DCArtboard>
          <DCArtboard id="tast-db" label="Desktop B · Tout sur un écran" width={1180} height={780}><TastDeskB /></DCArtboard>
          <DCArtboard id="tast-ma" label="Mobile A · Bottom sheet étapes" width={360} height={720}><TastMobA /></DCArtboard>
          <DCArtboard id="tast-mb" label="Mobile B · Single scroll + sticky" width={360} height={780}><TastMobB /></DCArtboard>
        </DCSection>

        <DCSection id="add" title="04 · Ajouter un vin" subtitle="Desktop = texte ; mobile = OCR caméra">
          <DCArtboard id="add-d" label="Desktop · texte + IA timeline" width={1180} height={900}><AddDesk /></DCArtboard>
          <DCArtboard id="add-m" label="Mobile · photo étiquette" width={360} height={720}><AddMob /></DCArtboard>
        </DCSection>

        <DCSection id="ins" title="05 · Insights — alertes garde" subtitle="Le pourquoi-tu-ouvres-l'app en deuxième">
          <DCArtboard id="ins-a" label="Insights · onglet Garde" width={1180} height={900}><Insights /></DCArtboard>
        </DCSection>

        <DCSection id="extra" title="Bonus — Cave & Command palette" subtitle="Pour compléter le tour">
          <DCArtboard id="cave-a" label="Cave · liste + filtres + bulk" width={1180} height={900}><Cave /></DCArtboard>
          <DCArtboard id="cmd-a" label="Command palette (⌘K)" width={760} height={540}><CmdPalette /></DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Style sketch">
          <TweakRadio
            label="Intensité du tracé"
            value={tweaks.sketchIntensity}
            options={[{ value: 0, label: 'Net' }, { value: 1, label: 'Crayon' }, { value: 2, label: 'Brouillon' }]}
            onChange={(v) => setTweak('sketchIntensity', v)}
          />
          <TweakToggle label="Accent wine red" checked={tweaks.wineAccent} onChange={(v) => setTweak('wineAccent', v)} />
          <TweakToggle label="Annotations visibles" checked={tweaks.showAnnotations} onChange={(v) => setTweak('showAnnotations', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
