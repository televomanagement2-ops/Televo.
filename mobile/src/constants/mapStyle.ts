// =============================================================================
// mapStyle — stile MapLibre dark custom della Mappa della Città (M7 / MM5).
// =============================================================================
// Estetica: CARTOGRAFIA MILITARE / DATA-VIZ. Base scura neutra, zero POI, zero
// transit, toponimi minimi: gli unici elementi luminosi saranno le Aure e le
// bolle Live (canvas Skia sovrapposto, MM8). La mappa è uno SFONDO, non compete
// mai col contenuto.
//
// Fonte tile: OpenFreeMap (gratis, nessun token) — schema vettoriale
// OpenMapTiles servito da `https://tiles.openfreemap.org/planet`. Questo file è
// un FORK COMPATTO dello stile "dark" ufficiale di OpenFreeMap: stessi source /
// glyphs / sprite, ma solo i layer che ci servono, ricolorati sulla palette di
// `theme.ts`. Layer POI e ferrovie/transit sono OMESSI di proposito (spec §6).
//
// Attribuzione OSM/OpenFreeMap OBBLIGATORIA: resa dal MapCanvas (overlay + info).

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

// -----------------------------------------------------------------------------
// Palette mappa — derivata dallo spirito di theme.ts (dark freddo) con toni
// dedicati alla cartografia. Neri quasi assoluti; le differenze tra terra/acqua/
// strade sono volutamente sottili così da non rubare la scena alle Aure.
// -----------------------------------------------------------------------------
export const MAP_PALETTE = {
  land: '#04050a', //        base cartografica: quasi-nero freddo
  water: '#0a1020', //       acqua: blu notte, appena più chiaro della terra
  waterway: '#0c1526', //    fiumi/canali
  green: '#070c0a', //       bosco/parchi: verde scurissimo, quasi impercettibile
  roadMinor: '#12151d', //   strade locali: grigio freddo appena sopra la terra
  roadMajor: '#1b202b', //   arterie
  roadMotorway: '#252c3b', // autostrade: la strada più visibile, ma sobria
  building: '#0a0c12', //    edifici: massa scura solo ad alto zoom
  boundary: 'rgba(120,132,156,0.16)', // confini amministrativi: linea fantasma
  label: '#7d8494', //       toponimi: grigio muted (parente di colors.muted)
  labelHalo: '#04050a', //   alone del testo = colore terra (leggibile, non brilla)
} as const;

// -----------------------------------------------------------------------------
// Vista di default — Terni (lancio invite-only). [lng, lat] come vuole MapLibre.
// In MM5 non c'è geolocalizzazione (arriva in MM6): partiamo sempre da Terni.
// -----------------------------------------------------------------------------
export const MAP_DEFAULT = {
  center: [12.6516, 42.5636] as [number, number], // Terni
  zoom: 13,
  minZoom: 3,
  maxZoom: 18,
} as const;

/** Attribuzione minima sempre visibile (ODbL/OSM). */
export const MAP_ATTRIBUTION = '© OpenStreetMap';

// Endpoint OpenFreeMap (verificati sullo stile "dark" ufficiale).
const OFM_TILES = 'https://tiles.openfreemap.org/planet';
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const OFM_SPRITE = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';

// Font disponibile su OpenFreeMap; usato solo per i pochi toponimi.
const FONT = ['Noto Sans Regular'];

// -----------------------------------------------------------------------------
// Lo stile. Ordine layer = ordine di disegno (painter's algorithm):
// terra → verde → acqua → confini → strade → edifici → toponimi.
// -----------------------------------------------------------------------------
export const mapStyleDark: StyleSpecification = {
  version: 8,
  name: 'Televo City Dark',
  glyphs: OFM_GLYPHS,
  sprite: OFM_SPRITE,
  sources: {
    openmaptiles: { type: 'vector', url: OFM_TILES },
  },
  layers: [
    // Terra: tinta di base uniforme.
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': MAP_PALETTE.land },
    },

    // Verde (bosco/parchi/prati): massa scurissima appena percettibile.
    {
      id: 'landcover-green',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'forest', 'scrub', 'meadow']]],
      minzoom: 7,
      paint: { 'fill-color': MAP_PALETTE.green, 'fill-opacity': 0.5 },
    },

    // Acqua: specchi (mare, laghi, fiumi larghi).
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': MAP_PALETTE.water },
    },

    // Corsi d'acqua stretti: linea sottile, solo ad alto zoom.
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      minzoom: 11,
      paint: {
        'line-color': MAP_PALETTE.waterway,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 18, 1.6],
      },
    },

    // Confini amministrativi (fino al livello regionale/provinciale): fantasma.
    {
      id: 'boundary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['<=', ['get', 'admin_level'], 4],
      minzoom: 4,
      paint: {
        'line-color': MAP_PALETTE.boundary,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 12, 1.2],
        'line-dasharray': [2, 2],
      },
    },

    // Strade locali: compaiono solo da vicino per non fare rumore.
    {
      id: 'road-minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track', 'path']]],
      minzoom: 12,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_PALETTE.roadMinor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 18, 1.6],
      },
    },

    // Arterie principali.
    {
      id: 'road-major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary', 'trunk']]],
      minzoom: 8,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_PALETTE.roadMajor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 18, 3],
      },
    },

    // Autostrade: la strada più visibile della mappa (ma comunque sobria).
    {
      id: 'road-motorway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['==', ['get', 'class'], 'motorway'],
      minzoom: 5,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_PALETTE.roadMotorway,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 18, 4],
      },
    },

    // Edifici: massa scura in dissolvenza solo ad alto zoom (contesto urbano).
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-color': MAP_PALETTE.building,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, 0.6],
      },
    },

    // Toponimi minimi: solo città/paesi/frazioni, testo muted con alone scuro.
    {
      id: 'place-labels',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
      minzoom: 6,
      layout: {
        'text-field': ['coalesce', ['get', 'name:it'], ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT,
        'text-size': ['match', ['get', 'class'], 'city', 13, 'town', 11, 10],
        'text-max-width': 7,
        'text-letter-spacing': 0.08,
        'text-padding': 6,
      },
      paint: {
        'text-color': MAP_PALETTE.label,
        'text-halo-color': MAP_PALETTE.labelHalo,
        'text-halo-width': 1.2,
        'text-halo-blur': 0.4,
      },
    },
  ],
};
