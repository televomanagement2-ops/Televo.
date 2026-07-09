// =============================================================================
// clustering.ts — fusione spaziale delle Aure sulla Mappa della Città (M7 / MM8).
// =============================================================================
// map.md §6/§13.5: le aure vicine a zoom bassi si FONDONO in un'aura aggregata
// (dimensione ∝ numero, MAI cifre in vista); allo zoom-in il cluster si apre.
// Usiamo `supercluster` (JS puro) sul solo insieme AMICI: gli eventi (bolle
// stanza con titolo) sono pochi e semanticamente distinti → resi sempre singoli.
//
// Perché questo è compatibile con l'ancoraggio nativo dei Marker (decisione MM8,
// §13.5): il clustering è GEOGRAFICO. Cambia solo con lo ZOOM (o quando cambia
// l'insieme dei punti), MAI col pan. Chi chiama ricalcola i cluster a gesto fermo
// (onRegionDidChange) e i Marker restano incollati nativamente nel frattempo →
// zero proiezione per-frame, zero rischio di desync canvas↔camera.
//
// Modulo PURO (nessun import nativo): l'unica dipendenza è supercluster.

import Supercluster from 'supercluster';
import type { PuntoAmico } from '@/store/mapStore';

/** bbox in gradi: [ovest(lng), sud(lat), est(lng), nord(lat)] — come vuole supercluster. */
export type BBox = [number, number, number, number];

/** Proprietà minime portate da ogni foglia (punto amico) nell'indice. */
interface ProprietaFoglia {
  userId: string;
}

// Parametri del clustering. `radius` = raggio di fusione in px per tile 512;
// `maxZoom` = oltre questo zoom niente più cluster (le aure sono separate). Il
// nostro maxZoom mappa è 18: teniamo il cluster maxZoom a 17 così che all'ultimo
// gradino i punti distinti si separino sempre.
const CLUSTER_RADIUS = 56;
const CLUSTER_MAX_ZOOM = 17;

// bbox del mondo intero — fallback finché non conosciamo il viewport reale.
export const BBOX_MONDO: BBox = [-180, -85, 180, 85];

/**
 * Costruisce l'indice supercluster dagli amici VISIBILI con coordinate valide.
 * Chi chiama filtra prima (amicoVisibile + lat/lng finiti): qui ci fidiamo.
 */
export function costruisciIndice(amici: PuntoAmico[]): Supercluster<ProprietaFoglia> {
  const index = new Supercluster<ProprietaFoglia>({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    minZoom: 0,
  });
  index.load(
    amici.map((a) => ({
      type: 'Feature',
      properties: { userId: a.userId },
      geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
    })),
  );
  return index;
}

/** Un cluster aggregato (2+ aure fuse), apribile con lo zoom. */
export interface RenderCluster {
  kind: 'cluster';
  id: number; //             cluster_id (per getLeaves/expansionZoom)
  lng: number;
  lat: number;
  count: number; //          numero di aure fuse → pilota la DIMENSIONE (mai mostrato)
  expansionZoom: number; //  zoom a cui il cluster si separa (tap → easeTo)
}

/** Una foglia: un singolo amico, eventualmente con offset px per lo spiderfy. */
export interface RenderFoglia {
  kind: 'foglia';
  userId: string;
  lng: number;
  lat: number;
  /** Offset in px applicato al Marker (spiderfy di punti coincidenti). */
  offsetX: number;
  offsetY: number;
}

export type RenderPunto = RenderCluster | RenderFoglia;

// Oltre questo zoom un cluster è di punti (quasi) coincidenti: non si separa più
// zoomando → si apre a ventaglio (spiderfy) con offset radiali in px.
const ZOOM_SPIDERFY = CLUSTER_MAX_ZOOM + 1;

/** Raggio (px) del ventaglio di spiderfy in funzione del numero di foglie. */
function raggioSpiderfy(n: number): number {
  return 26 + Math.min(n, 12) * 3;
}

/**
 * Calcola i punti da renderizzare per un dato viewport (bbox + zoom). I cluster
 * apribili restano cluster (tap → zoom); i cluster di punti coincidenti si
 * aprono a ventaglio (offset px sui Marker, ancorati alla stessa coordinata).
 */
export function calcolaRender(
  index: Supercluster<ProprietaFoglia>,
  bbox: BBox,
  zoom: number,
): RenderPunto[] {
  const z = Math.round(zoom);
  const clusters = index.getClusters(bbox, z);
  const out: RenderPunto[] = [];

  for (const f of clusters) {
    // GeoJSON Position è number[]: qui sono sempre [lng, lat] validi (li abbiamo
    // caricati noi da lat/lng finiti) → tupla esplicita per il type checker.
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const props = f.properties as Supercluster.ClusterProperties & ProprietaFoglia;

    if (props.cluster) {
      const clusterId = props.cluster_id;
      const expansionZoom = index.getClusterExpansionZoom(clusterId);

      if (expansionZoom > ZOOM_SPIDERFY) {
        // Punti (quasi) coincidenti: apri a ventaglio invece di zoomare a vuoto.
        const foglie = index.getLeaves(clusterId, Infinity);
        const n = foglie.length;
        const r = raggioSpiderfy(n);
        foglie.forEach((leaf, i) => {
          const ang = (2 * Math.PI * i) / n - Math.PI / 2; // parte dalle ore 12
          out.push({
            kind: 'foglia',
            userId: (leaf.properties as ProprietaFoglia).userId,
            lng,
            lat,
            offsetX: Math.round(Math.cos(ang) * r),
            offsetY: Math.round(Math.sin(ang) * r),
          });
        });
      } else {
        out.push({
          kind: 'cluster',
          id: clusterId,
          lng,
          lat,
          count: props.point_count,
          expansionZoom,
        });
      }
    } else {
      out.push({
        kind: 'foglia',
        userId: props.userId,
        lng,
        lat,
        offsetX: 0,
        offsetY: 0,
      });
    }
  }

  return out;
}
