// Seed data for the React prototype — kept on window for cross-script access
window.SEED = {
  user: { name: 'Marc' },
  cellar: {
    bottles: 290,
    locations: 27,
    monthsOfStock: 14.2,
    tastingsThisYear: 38,
    regionsCovered: 12,
    regionsTotal: 27,
    monthIn: 12,
    monthOut: 7,
  },
  urgent: [
    { id:'w1', name:"Pommard 1er Cru Rugiens",   region:'Bourgogne',    vintage:2018, loc:'A2', daysToPeak:15, score:8.5 },
    { id:'w2', name:"Sancerre Les Caillottes",   region:'Loire',        vintage:2020, loc:'B4', daysToPeak:28, score:8.0 },
    { id:'w3', name:"Vouvray Foreau",            region:'Loire',        vintage:2011, loc:'D6', daysToPeak:42, score:8.0 },
    { id:'w4', name:"Vacqueyras Le Sang",        region:'Rhône Sud',    vintage:2017, loc:'C5', daysToPeak:58, score:null },
    { id:'w5', name:"Côte-Rôtie La Landonne",    region:'Rhône Nord',   vintage:2014, loc:'C1', daysToPeak:75, score:null },
    { id:'w6', name:"Chablis Vaudésir",          region:'Bourgogne',    vintage:2019, loc:'B7', daysToPeak:82, score:7.5 },
    { id:'w7', name:"Saint-Joseph Granit",       region:'Rhône Nord',   vintage:2016, loc:'C3', daysToPeak:88, score:8.0 },
  ],
  wishlist: [
    { id:'l1', name:"Rayas Châteauneuf-du-Pape", vintage:2019, status:'dispo' },
    { id:'l2', name:"Rouss. Romanee-St-Vivant",  vintage:2018, status:'none' },
    { id:'l3', name:"Trimbach Clos Ste-Hune",    vintage:2017, status:'dispo' },
    { id:'l4', name:"Coche-Dury Meursault",      vintage:2020, status:'none' },
    { id:'l5', name:"Clape Cornas",              vintage:2015, status:'rare' },
  ],
  hallOfFame: [
    { rank:'I',   name:"Hermitage La Chapelle",   vintage:'10', score:9.5, note:"« avec un agneau, un samedi d'hiver »" },
    { rank:'II',  name:"Pavillon Blanc",          vintage:'17', score:9.0, note:"« anniversaire de M., terrasse »" },
    { rank:'III', name:"Chambolle-Musigny",       vintage:'15', score:8.5, note:"« dimanche pluvieux, seul »" },
    { rank:'IV',  name:"Vouvray Foreau",          vintage:'11', score:8.0, note:"« foie gras de Noël »" },
    { rank:'V',   name:"Bandol Tempier",          vintage:'16', score:8.0, note:"« BBQ d'été, terrasse »" },
  ],
  journal: [
    { ts:'19:42',  type:'ADD',   accent:true,  text:"+3 bourgognes · Pommard '17, Chambolle '15, Volnay '19", ago:'2h' },
    { ts:'17:08',  type:'TAST',  accent:false, text:"Crozes-H. Graillot '18 · note 8.5 · « claque »",         ago:'5h' },
    { ts:'02 MAI', type:'MOVE',  accent:false, text:"Sancerre Caillottes · A4 → B2",                          ago:'2 j' },
    { ts:'01 MAI', type:'ADD',   accent:false, text:"Bandol Tempier '20 · ×2 · case D3",                      ago:'3 j' },
    { ts:'29 AVR', type:'ALERT', accent:true,  text:"4 vins entrent en pic ce mois",                          ago:'5 j' },
    { ts:'28 AVR', type:'TAST',  accent:false, text:"Hermitage Chave '11 · note 9.0 · « grande occasion »",   ago:'6 j' },
  ],
  // Sommelier scripted conversation (cycles on demand)
  sommelierExamples: [
    {
      query: "dîner à deux, agneau aux herbes, on est mardi",
      answers: [
        { vin:"Côte-Rôtie La Landonne",   vtg:2014, loc:'C1', why:"épicé, ample — rencontre l'agneau sans le couvrir", score:9.0 },
        { vin:"Pommard 1er Cru Rugiens",  vtg:2018, loc:'A2', why:"dans sa fenêtre — note au journal d'avril",        score:8.5 },
        { vin:"Vacqueyras Le Sang",       vtg:2017, loc:'C5', why:"plus rustique, idéal pour un mardi sans cérémonie", score:8.0 },
      ],
    },
  ],
  // Quick-search candidates for ⌘K
  quickActions: [
    { kind:'action', label:'Ajouter un vin',        hint:'⌘N' },
    { kind:'action', label:'Démarrer une dégustation', hint:'⌘D' },
    { kind:'action', label:'Ouvrir Insights',       hint:'⌘I' },
    { kind:'action', label:'Voir la cave',          hint:'⌘L' },
    { kind:'action', label:'Wishlist',              hint:'⌘W' },
  ],
};
