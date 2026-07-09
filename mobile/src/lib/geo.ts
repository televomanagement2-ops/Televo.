// =============================================================================
// geo.ts — geometria pura per la Mappa della Città (M7 / MM9).
// =============================================================================
// Un solo compito: costruire il POLIGONO di un cerchio geografico (centro +
// raggio in metri) da disegnare sulla mappa come Safe Zone (ZonesLayer) o come
// anteprima durante l'editor. MapLibre non ha un "cerchio in metri" nativo
// (`circle-radius` è in pixel), quindi lo approssimiamo con un poligono di N
// vertici calcolati con la formula del punto di destinazione (great-circle).
//
// Modulo PURO: nessun import nativo (né MapLibre né expo). Coerente con la
// convenzione del repo — la geometria vive fuori dai componenti (come la
// haversine in lib/location.ts, che però tira dentro expo-location: qui no).

const R_TERRA_M = 6_378_137; // raggio equatoriale WGS84 (come EPSG:3857)
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Poligono (GeoJSON) che approssima il cerchio di raggio `radiusM` metri attorno
 * a (`lng`,`lat`). `steps` vertici (64 = liscio anche a zoom alto). L'anello è
 * chiuso (primo = ultimo vertice) come richiede la spec GeoJSON. Coordinate in
 * [lng, lat] (l'ordine di MapLibre/GeoJSON).
 */
export function cerchioGeoJSON(
  lng: number,
  lat: number,
  radiusM: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const latR = rad(lat);
  const lngR = rad(lng);
  const dR = radiusM / R_TERRA_M; // distanza angolare
  const ring: GeoJSON.Position[] = [];

  for (let i = 0; i <= steps; i++) {
    const brng = (2 * Math.PI * i) / steps; // azimut 0..2π
    const lat2 = Math.asin(
      Math.sin(latR) * Math.cos(dR) + Math.cos(latR) * Math.sin(dR) * Math.cos(brng),
    );
    const lng2 =
      lngR +
      Math.atan2(
        Math.sin(brng) * Math.sin(dR) * Math.cos(latR),
        Math.cos(dR) - Math.sin(latR) * Math.sin(lat2),
      );
    ring.push([deg(lng2), deg(lat2)]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}
