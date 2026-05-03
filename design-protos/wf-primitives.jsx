// VinoFlow — Wireframe primitives
// Reusable rough/sketchy components. All grayscale + occasional wine accent.

const Box = ({ children, className = '', style = {}, ...rest }) => (
  <div className={`sk-box ${className}`} style={style} {...rest}>{children}</div>
);

// Browser frame — desktop wireframes
const Browser = ({ url, children, style = {} }) => (
  <div className="sk-browser" style={style}>
    <div className="sk-browser-bar">
      <span className="dot" /><span className="dot" /><span className="dot" />
      <div style={{ flex: 1, padding: '3px 10px', background: '#fbf8f3', border: '1.2px solid #2a2a2a', borderRadius: 12, marginLeft: 8 }}>
        {url || 'vinoflow.local'}
      </div>
    </div>
    <div className="sk-browser-body">{children}</div>
  </div>
);

// Phone frame
const Phone = ({ children, style = {} }) => (
  <div className="sk-phone" style={style}>
    <div className="sk-phone-screen">{children}</div>
  </div>
);

// Sidebar nav
const Sidebar = ({ active = 'dash' }) => {
  const items = [
    { id: 'dash', label: 'Tableau de bord', glyph: '◰' },
    { id: 'cave', label: 'Cave', glyph: '▤' },
    { id: 'somm', label: 'Sommelier', glyph: '◇' },
    { id: 'ins',  label: 'Insights', glyph: '◷' },
  ];
  return (
    <div className="sk-side">
      <div className="sk-h2 sk-wine" style={{ marginBottom: 18, letterSpacing: 0.5 }}>VinoFlow</div>
      <div className="sk-xs" style={{ marginBottom: 8 }}>NAVIGATION</div>
      {items.map(it => (
        <div key={it.id} className={`sk-side-item ${active === it.id ? 'on' : ''}`}>
          <span className="glyph" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{it.glyph}</span>
          {it.label}
        </div>
      ))}
      <div className="sk-squiggle" style={{ margin: '14px 0' }} />
      <div className="sk-xs" style={{ marginBottom: 6 }}>RACCOURCIS</div>
      <div className="sk-side-item"><span className="glyph">★</span>Wishlist</div>
      <div className="sk-side-item"><span className="glyph">✎</span>Journal</div>
      <div className="sk-side-item"><span className="glyph">≡</span>Régions</div>
      <div className="sk-side-item"><span className="glyph">◎</span>Hall of Fame</div>
      <div style={{ position: 'absolute', bottom: 16, fontSize: 12, color: '#888' }} className="sk-xs">v1.0 · self-host</div>
    </div>
  );
};

// Top bar (search + add)
const TopBar = ({ subtitle, sparse }) => (
  <div className="row center between" style={{ paddingBottom: 14, borderBottom: '1.2px dashed #999', marginBottom: 18 }}>
    <div>
      <div className="sk-serif" style={{ fontSize: 22, color: '#1a1a1a' }}>{subtitle || 'Tableau de bord'}</div>
      {!sparse && <div className="sk-xs" style={{ marginTop: 2 }}>Lundi 4 mai · 290 bouteilles · 27 emplacements</div>}
    </div>
    <div className="row center gap-3">
      <div className="sk-box thin" style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
        <span style={{ fontSize: 14 }}>🔍</span>
        <span className="sk-s">Cherche</span>
        <span style={{ flex: 1 }} />
        <span className="sk-chip" style={{ fontSize: 10, padding: '0 6px' }}>⌘K</span>
      </div>
      <div className="sk-btn wine sm">+ Ajouter un vin</div>
      <div className="sk-box thin" style={{ width: 30, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>JD</div>
    </div>
  </div>
);

// Wine card — compact
const WineCard = ({ name = 'Château Margaux', region = 'Margaux', vintage = '2015', score, status, compact, dark }) => (
  <div className={`sk-box ${dark ? 'tinted' : ''}`} style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
    <div className="sk-bottle wine" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="sk-h2" style={{ fontSize: compact ? 16 : 18 }}>{name}</div>
      <div className="sk-s">{region} · <span className="sk-hand" style={{ fontSize: 14 }}>{vintage}</span></div>
      {!compact && (
        <div className="row gap-2 mt-2 wrap">
          {status && <span className="sk-chip">{status}</span>}
          {score && <span className="sk-chip wine">{score}/10</span>}
        </div>
      )}
    </div>
  </div>
);

// Pick card — sommelier proposition
const PickCard = ({ kind = 'safe', name, region, vintage, why, location }) => {
  const labels = { safe: 'SÛR', personnel: 'PERSONNEL', audacieux: 'AUDACIEUX' };
  const tints = { safe: '', personnel: 'tinted', audacieux: 'wine' };
  return (
    <div className={`sk-box ${tints[kind]}`} style={{ padding: 14, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row between center">
        <span className="sk-h3" style={{ color: kind === 'audacieux' ? '#9b1c1c' : '#4a4a4a' }}>{labels[kind]}</span>
        <span className="sk-xs">match {kind === 'audacieux' ? '78%' : kind === 'personnel' ? '92%' : '88%'}</span>
      </div>
      <div className="row gap-3 center">
        <div className="sk-bottle wine lg" />
        <div style={{ flex: 1 }}>
          <div className="sk-h1" style={{ fontSize: 20 }}>{name}</div>
          <div className="sk-s">{region} · <span className="sk-hand" style={{ fontSize: 15 }}>{vintage}</span></div>
        </div>
      </div>
      <div className="sk-p sk-soft" style={{ fontStyle: kind === 'audacieux' ? 'italic' : 'normal' }}>{why}</div>
      <div className="row between center mt-2">
        <span className="sk-xs">📍 {location}</span>
        <div className="row gap-2">
          <span className="sk-btn ghost sm">Fiche</span>
          <span className="sk-btn wine sm">Choisir</span>
        </div>
      </div>
    </div>
  );
};

// Hall of Fame card
const HOFCard = ({ rank, name, region, score, memory, vintage }) => (
  <div className="sk-box tinted" style={{ padding: 12, display: 'flex', gap: 10 }}>
    <div className="sk-serif" style={{ fontSize: 36, color: '#9b1c1c', lineHeight: 1, minWidth: 30 }}>{rank}</div>
    <div style={{ flex: 1 }}>
      <div className="sk-h2" style={{ fontSize: 17 }}>{name} <span className="sk-hand sk-mute" style={{ fontSize: 14 }}>'{vintage}</span></div>
      <div className="sk-xs">{region}</div>
      <div className="sk-note" style={{ marginTop: 6, fontSize: 13 }}>« {memory} »</div>
    </div>
    <div className="sk-h0 sk-wine" style={{ fontSize: 28, lineHeight: 1 }}>{score}<span style={{ fontSize: 14 }}>/10</span></div>
  </div>
);

// Stat block
const StatBlock = ({ label, value, hint }) => (
  <div className="sk-box" style={{ padding: 12, flex: 1, minWidth: 0 }}>
    <div className="sk-xs">{label}</div>
    <div className="sk-h0" style={{ fontSize: 28, marginTop: 4 }}>{value}</div>
    {hint && <div className="sk-s sk-mute">{hint}</div>}
  </div>
);

// Faux text block (paragraph of lines)
const FauxText = ({ lines = 3 }) => (
  <div>
    {Array.from({ length: lines }).map((_, i) => (
      <span key={i} className={`sk-line ${i === lines - 1 ? 'short' : 'long'}`} />
    ))}
  </div>
);

// Annotation pill — context labels for wireframes
const Anno = ({ children, color = '#9b1c1c', style = {} }) => (
  <div className="sk-hand" style={{
    display: 'inline-block',
    padding: '2px 8px',
    border: `1px dashed ${color}`,
    borderRadius: 12,
    fontSize: 13,
    color,
    background: 'rgba(255,255,255,0.6)',
    ...style,
  }}>{children}</div>
);

// Hand-drawn arrow (svg) for callouts
const Arrow = ({ d = 'M 0 0 Q 30 -20 60 0', length = 60, label, side = 'right', style = {} }) => (
  <div style={{ position: 'relative', display: 'inline-block', ...style }}>
    <svg width="80" height="40" viewBox="0 0 80 40">
      <path d={d} fill="none" stroke="#9b1c1c" strokeWidth="1.4" strokeDasharray="3 3" />
      <path d="M 56 -2 L 60 0 L 56 4" fill="none" stroke="#9b1c1c" strokeWidth="1.4" transform="translate(0 0)" />
    </svg>
    {label && <span className="sk-hand sk-wine" style={{ position: 'absolute', left: side === 'right' ? 80 : -100, top: -2, fontSize: 13, fontStyle: 'italic' }}>{label}</span>}
  </div>
);

Object.assign(window, {
  Box, Browser, Phone, Sidebar, TopBar,
  WineCard, PickCard, HOFCard, StatBlock, FauxText,
  Anno, Arrow,
});
